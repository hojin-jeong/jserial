'use strict'

const MsgPackr = require('msgpackr')
const LZ4 = require('./lz4')
const Utility = require('./utility')
const Platform = require('./platform')

class JsonSerializer {
    // WASM 버퍼 관리
    #lz4 = null
    #srcPtr = 0
    #srcCap = 0
    #dstPtr = 0
    #dstCap = 0
    #srcBuf = null
    #dstView = null
    #packBuf = null
    #lastStart = 0
    #lastSize = 0
    #dstBufView = null
    #dstSubView = null      // 서브어레이 캐시 (DataView 재사용 유도)
    #dstSubOffset = -1
    #dstSubLen = -1


    // Packer 관리
    #namespace
    #packerOptions
    #defaultPacker
    #dictionaryPacker

    static MAX_HEADER_RESERVE = 10


    constructor (opts = {}) {
        if (typeof opts === 'string') {
            opts = { namespace: opts }
        }
        this.#namespace = opts.namespace
        this.#packerOptions = {
            mapsAsObjects: true,
            variableMapSize: false,
            moreTypes: true,
            bundleStrings: false,
            ...opts.options
        }
        this.#defaultPacker = new MsgPackr.Packr(this.#packerOptions)
        this.#dictionaryPacker = null

        // WASM 초기화 (16KB, 동기 컴파일)
        this.#lz4 = LZ4.createInstance()
        this.#_allocSrc(65536)
        this.#_allocDst(65536)
        this.#packBuf = Buffer.allocUnsafe(65536)
    }


    get defaultPacker () { return this.#defaultPacker }
    get dictionaryPacker () { return this.#_ensureDictionaryPacker() }

    // 사전 구조 저장
    #_getStructures () {
        const rawBuffer = Platform.loadStructures(this.#namespace)
        if (rawBuffer) {
            return this.#_deserializeWithPacker(this.#defaultPacker, rawBuffer)
        }
        return []
    }

    #_saveStructures (structures) {
        const tempBuf = Buffer.allocUnsafe(65536)
        this.#defaultPacker.useBuffer(tempBuf)
        const packed = this.#defaultPacker.pack(structures)
        const s0 = packed.length

        this.#_ensureSrc(s0)
        this.#srcBuf.set(packed)
        const bound = s0 + ((s0 / 255) | 0) + 16
        const MAX_HEADER = JsonSerializer.MAX_HEADER_RESERVE
        this.#_ensureDst(MAX_HEADER + bound)
        const rv = this.#lz4.CompressWithHeader(
            this.#srcPtr, s0, this.#dstPtr, this.#dstCap
        )
        if (rv === 0) return
        const headerStart = rv & 0x1F
        const totalSize = rv >>> 5
        const result = Buffer.from(this.#dstView.slice(headerStart, headerStart + totalSize))
        Platform.saveStructures(this.#namespace, result)
    }

    #_ensureDictionaryPacker() {
        if (!this.#dictionaryPacker) {
            this.#dictionaryPacker = new MsgPackr.Packr({
                getStructures: this.#_getStructures.bind(this),
                saveStructures: this.#_saveStructures.bind(this),
                ...this.#packerOptions
            })
        }
        return this.#dictionaryPacker
    }

    // WASM 버퍼 할당
    #_allocSrc(newCap) {
        if (this.#srcPtr) this.#lz4.Free(this.#srcPtr, this.#srcCap)
        this.#srcCap = newCap
        this.#srcPtr = this.#lz4.Alloc(newCap)
        this.#_rebuildSrcView()
    }

    #_allocDst(newCap) {
        if (this.#dstPtr) this.#lz4.Free(this.#dstPtr, this.#dstCap)
        this.#dstCap = newCap
        this.#dstPtr = this.#lz4.Alloc(newCap)
        this.#_rebuildDstView()
    }

    #_rebuildSrcView() {
        const u8 = this.#lz4.U8(this.#srcPtr, this.#srcCap)
        this.#srcBuf = Buffer.from(u8.buffer, u8.byteOffset, u8.byteLength)
    }

    #_rebuildDstView() {
        this.#dstView = this.#lz4.U8(this.#dstPtr, this.#dstCap)
        this.#dstBufView = null  // 캐시 무효화
        this.#dstSubView = null  // 서브어레이 캐시 무효화
    }


    #_ensureSrc(needed) {
        if (needed > this.#srcCap) {
            let newCap = this.#srcCap
            while (newCap < needed) newCap *= 2
            this.#_allocSrc(newCap)
        } else if (this.#srcBuf.buffer.byteLength === 0) {
            this.#_rebuildSrcView()
        }
    }

    #_ensureDst(needed) {
        if (needed > this.#dstCap) {
            let newCap = this.#dstCap
            while (newCap < needed) newCap *= 2
            this.#_allocDst(newCap)
        } else if (this.#dstView.buffer.byteLength === 0) {
            this.#_rebuildDstView()
        }
    }

    // 캐시된 Buffer 뷰 반환 (재할당 방지, DataView 재사용 유도)
    #_getDstBuffer(offset, length) {
        if (!this.#dstBufView || this.#dstBufView.buffer !== this.#dstView.buffer) {
            this.#dstBufView = Buffer.from(this.#dstView.buffer)
            this.#dstSubView = null  // 버퍼 교체 시 서브어레이 캐시 무효화
        }
        if (!this.#dstSubView || this.#dstSubOffset !== offset || this.#dstSubLen !== length) {
            this.#dstSubView = this.#dstBufView.subarray(offset, offset + length)
            this.#dstSubOffset = offset
            this.#dstSubLen = length
        }
        return this.#dstSubView
    }

    // 직렬화
    #_serializeWithPacker (packer, json) {
        packer.useBuffer(this.#packBuf)
        const packed = packer.pack(json)
        const s0 = packed.length
        // high-water mark 유지: 재할당 방지를 위해 #packBuf를 교체하지 않음

        // LZ4 압축 경로 (항상)
        this.#_ensureSrc(s0)
        this.#srcBuf.set(packed)
        const bound = s0 + ((s0 / 255) | 0) + 16
        const MAX_HEADER = JsonSerializer.MAX_HEADER_RESERVE
        this.#_ensureDst(MAX_HEADER + bound)
        const rv = this.#lz4.CompressWithHeader(
            this.#srcPtr, s0, this.#dstPtr, this.#dstCap
        )
        if (rv === 0) return new Error('LZ4 compression failed')
        this.#lastStart = rv & 0x1F
        this.#lastSize = rv >>> 5
        return null  // no error
    }


    serialize (json) {
        const err = this.#_serializeWithPacker(this.#defaultPacker, json)
        if (err) return err
        return Utility.toBuffer(this.#dstView.slice(this.#lastStart, this.#lastStart + this.#lastSize))
    }

    serializeView (json) {
        const err = this.#_serializeWithPacker(this.#defaultPacker, json)
        if (err) return err
        return this.#dstView.subarray(this.#lastStart, this.#lastStart + this.#lastSize)
    }

    serializeWithDictionary (json) {
        const err = this.#_serializeWithPacker(this.#_ensureDictionaryPacker(), json)
        if (err) return err
        return Utility.toBuffer(this.#dstView.slice(this.#lastStart, this.#lastStart + this.#lastSize))
    }

    serializeTo (packer = this.#defaultPacker, json) {
        const err = this.#_serializeWithPacker(packer, json)
        if (err) return err
        return this.#dstView.slice(this.#lastStart, this.#lastStart + this.#lastSize)
    }

    // 역직렬화
    #_deserializeWithPacker (packer, buffer) {
        if (!buffer || !(buffer instanceof Uint8Array) || buffer.length < 2) {
            return new Error('Buffer is Wrong')
        }

        const u8 = buffer instanceof Uint8Array
            ? buffer
            : new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength)

        const n0 = u8[0]
        const n1 = u8[1]

        // LZ4 압축 프레임
        const s0 = Utility.readUIntBE(u8, 2, n0)
        const s1 = Utility.readUIntBE(u8, 2 + n0, n1)
        const headerSize = 2 + n0 + n1

        if (u8.length !== s1 + headerSize) return new Error('Buffer size is Wrong')

        // 압축 데이터를 WASM 버퍼로 복사
        this.#_ensureSrc(s1)
        this.#srcBuf.set(u8.subarray(headerSize, headerSize + s1))

        // WASM 버퍼에서 압축 해제
        this.#_ensureDst(s0)
        const decompLen = this.#lz4.DecompressRawInto(this.#srcPtr, s1, this.#dstPtr, s0)
        if (decompLen !== s0) return new Error('Buffer size is Wrong')

        const decompBuf = this.#_getDstBuffer(this.#dstView.byteOffset, decompLen)
        return packer.unpack(decompBuf)
    }


    deserialize (buffer) {
        return this.#_deserializeWithPacker(this.#defaultPacker, buffer)
    }

    deserializeWithDictionary (buffer) {
        return this.#_deserializeWithPacker(this.#_ensureDictionaryPacker(), buffer)
    }

    deserializeTo (packer = this.#defaultPacker, buffer) {
        return this.#_deserializeWithPacker(packer, buffer)
    }

    /**
     * 역직렬화 (zero-copy 입력) — Uint8Array 직접 수용, Buffer 변환 생략
     * @param {Uint8Array} buffer
     * @returns {*|Error}
     */
    deserializeView (buffer) {
        return this.#_deserializeViewWithPacker(this.#defaultPacker, buffer)
    }

    #_deserializeViewWithPacker (packer, buffer) {
        if (!buffer || !(buffer instanceof Uint8Array) || buffer.length < 2) {
            return new Error('Buffer is Wrong')
        }

        const u8 = buffer

        const n0 = u8[0]
        const n1 = u8[1]

        // LZ4 압축 프레임
        const s0 = Utility.readUIntBE(u8, 2, n0)
        const s1 = Utility.readUIntBE(u8, 2 + n0, n1)
        const headerSize = 2 + n0 + n1

        if (u8.length !== s1 + headerSize) return new Error('Buffer size is Wrong')

        // 압축 데이터를 WASM 버퍼로 복사
        this.#_ensureSrc(s1)
        this.#srcBuf.set(u8.subarray(headerSize, headerSize + s1))

        // WASM 버퍼에서 압축 해제
        this.#_ensureDst(s0)
        const decompLen = this.#lz4.DecompressRawInto(this.#srcPtr, s1, this.#dstPtr, s0)
        if (decompLen !== s0) return new Error('Buffer size is Wrong')

        const decompBuf = this.#_getDstBuffer(this.#dstView.byteOffset, decompLen)
        return packer.unpack(decompBuf)
    }


    addExtension (extension) {
        MsgPackr.addExtension(extension)
    }

    static addExtension (extension) {
        MsgPackr.addExtension(extension)
    }

    /**
   * Create a FrameStream for streaming serialization
   * @param {JsonSerializer} serializer - The serializer instance
   * @param {Duplex|ReadableStream} stream - Node.js Duplex or Browser ReadableStream
   * @param {WritableStream} [writable] - Browser WritableStream (only for browser)
   * @returns {FrameStream}
   */
    static createFrameStream(serializer, stream, writable) {
        if (writable !== undefined) {
            // 브라우저: (serializer, readable, writable)
            return new Platform.FrameStream(serializer, stream, writable)
        }
        // Node.js: (serializer, duplexStream)
        return new Platform.FrameStream(serializer, stream)
    }

    /**
     * msgpackr-extract 네이티브 애드온 활성화 여부
     * false 이면 pure-JS fallback 이므로 성능이 저하됩니다.
     */
    static get isNativeAccelerationEnabled () {
        return MsgPackr.isNativeAccelerationEnabled === true
    }

    // 리소스 정리
    destroy () {
        if (this.#srcPtr) {
            this.#lz4.Free(this.#srcPtr, this.#srcCap)
            this.#srcPtr = 0
        }
        if (this.#dstPtr) {
            this.#lz4.Free(this.#dstPtr, this.#dstCap)
            this.#dstPtr = 0
        }
        this.#srcBuf = null
        this.#dstView = null
        this.#dstBufView = null
        this.#dstSubView = null
        this.#packBuf = null
    }
}

module.exports = JsonSerializer
