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
        this.#defaultPacker.useBuffer(this.#packBuf)
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

        // #packBuf high-water mark 갱신: 64KB 초과 객체 반복 직렬화 시 임시 alloc 방지
        if (s0 > this.#packBuf.length) {
            this.#packBuf = Buffer.allocUnsafe(s0 * 2)
        }

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

    /**
     * Serialize and return a zero-copy view into WASM memory.
     *
     * LIFETIME WARNING: The returned Uint8Array is a direct view into WASM memory.
     * It is valid ONLY until the next call to any serialize*() or deserialize*() method
     * on this instance. If the next call triggers WASM memory growth (_allocDst),
     * the view becomes detached and any access will throw or return garbage.
     *
     * Safe usage: consume the view synchronously before calling any other method.
     * Unsafe: storing the view and using it later across serialize calls.
     *
     * @param {*} json - Value to serialize
     * @returns {Uint8Array|Error} Zero-copy view into compressed frame, or Error on failure
     */
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

        // 전체 프레임(헤더 포함)을 WASM src 버퍼에 복사 — 헤더 파싱은 WASM 내부에서 처리
        const frameLen = buffer.length
        this.#_ensureSrc(frameLen)
        this.#srcBuf.set(buffer)

        // s0(원본 크기)를 WASM에서 파싱 — JS는 헤더 포맷을 알 필요 없음
        const s0 = this.#lz4.GetDecompressedSize(this.#srcPtr, frameLen)
        if (s0 === 0) return new Error('Buffer size is Wrong')
        this.#_ensureDst(s0)

        const decompLen = this.#lz4.DecompressWithHeader(
            this.#srcPtr, frameLen,
            this.#dstPtr, this.#dstCap
        )
        if (decompLen === 0) return new Error('Decompression failed')

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
        // 전체 프레임(헤더 포함)을 WASM src 버퍼에 복사
        const frameLen = buffer.length
        this.#_ensureSrc(frameLen)
        this.#srcBuf.set(buffer)

        // s0(원본 크기)를 WASM에서 파싱 — JS는 헤더 포맷을 알 필요 없음
        const s0 = this.#lz4.GetDecompressedSize(this.#srcPtr, frameLen)
        if (s0 === 0) return new Error('Buffer size is Wrong')
        this.#_ensureDst(s0)

        const decompLen = this.#lz4.DecompressWithHeader(
            this.#srcPtr, frameLen,
            this.#dstPtr, this.#dstCap
        )
        if (decompLen === 0) return new Error('Decompression failed')

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
     * Create a BlockFrameStream for high-throughput streaming with LZ4 block compression.
     * Uses msgpackr sequential structures for efficient encoding of repeated schemas.
     *
     * Wire format: [4B decompressed_len][4B compressed_len][LZ4 compressed msgpack data]
     * @param {Duplex} stream - Node.js Duplex stream
     * @param {object} options - { blockSize, flushInterval, packrOptions }
     * @returns {BlockFrameStream}
     */
    static createBlockFrameStream(stream, options = {}) {
        return new Platform.BlockFrameStream(stream, options)
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
