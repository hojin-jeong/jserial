
const Fs = require('fs')

const MsgPackr = require('msgpackr')
const LZ4 = require('lz4')

const Utility = require('./utility')

class JsonSerializer {
    constructor(opts = {}) {
        if (typeof opts === "string") {
            opts = {
                namespace: opts
            }
        }
        this.$namespace = opts.namespace
        this.$nonDictionaryPacker = new MsgPackr.Packr()
        this.$dictionaryPacker = new MsgPackr.Packr({
            getStructures: this.$_getStructures.bind(this),
            saveStructures: this.$_saveStructures.bind(this)
        })
        this.$minHeaderSize = 4
    }

    $_getStructures() {
        const path = Utility.getCacheStoragePath(this.$namespace, 'SharedStructures.data')
        if (Fs.existsSync(path)) {
            const rawBuffer = Fs.readFileSync(path)
            return this.deserializeTo(this.$nonDictionaryPacker, rawBuffer)
        } else {
            return []
        }
    }
    $_saveStructures(structures) {
        const path = Utility.getCacheStoragePath(this.$namespace, 'SharedStructures.data')
        const result = this.serializeTo(this.$nonDictionaryPacker, structures)
        Fs.writeFileSync(path, result)
    }

    /**
     * Byte structure
     * n0 / Packed Size Header ByteSize
     * n1 / Compressed Size Header ByteSize
     * s0 / Packed Size
     * s1 / Compressed Size
     * cb / Compressed Buffer
     *
     * n0, n1, s0..., s1..., cb
     */
    serialize(json) {
        return this.serializeTo(this.$nonDictionaryPacker, json)
    }
    serializeHC(json) {
        return this.serializeTo(this.$nonDictionaryPacker, json, true)
    }
    serializeSimple(json, highComp = false) {
        const packedBuffer = this.$nonDictionaryPacker.pack(json)
        return LZ4.encode(packedBuffer, {
            highCompression: highComp
        })
    }
    serializeWithDictionary(json) {
        return this.serializeTo(this.$dictionaryPacker, json)
    }
    serializeTo(packer = this.$nonDictionaryPacker, json, highComp = false) {
        const packedBuffer = packer.pack(json)
        const compressedBuffer = Buffer.allocUnsafe(LZ4.encodeBound(packedBuffer.length))
        const compressor = highComp ? LZ4.encodeBlockHC : LZ4.encodeBlock

        // Packed Size
        const s0 = packedBuffer.length
        // Compressed Size
        const s1 = compressor(packedBuffer, compressedBuffer)
        // Packed Size Header ByteSize
        const n0 = Utility.getUIntBound(s0)
        // Compressed Size Header ByteSize
        const n1 = Utility.getUIntBound(s1)
        const headerSize = 2 + n0 + n1

        const headerBuffer = Buffer.allocUnsafe(headerSize)
        let headerBufferIdx = 0

        headerBufferIdx = headerBuffer.writeUIntBE(n0, headerBufferIdx, 1)
        headerBufferIdx = headerBuffer.writeUIntBE(n1, headerBufferIdx, 1)
        headerBufferIdx = headerBuffer.writeUIntBE(s0, headerBufferIdx, n0)
        headerBuffer.writeUIntBE(s1, headerBufferIdx, n1)

        return Buffer.concat([headerBuffer, compressedBuffer.slice(0, s1)])
    }
    deserialize(buffer) {
        return this.deserializeTo(this.$nonDictionaryPacker, buffer)
    }
    deserializeSimple(buffer) {
        const decompressedBuffer = LZ4.decode(buffer)
        return this.$nonDictionaryPacker.unpack(decompressedBuffer)
    }
    deserializeWithDictionary(buffer) {
        return this.deserializeTo(this.$dictionaryPacker, buffer)
    }
    deserializeTo(packer = this.$nonDictionaryPacker, buffer) {
        if (!buffer || !Buffer.isBuffer(buffer) || buffer.length < this.$minHeaderSize) return new Error('Buffer is Wrong')

        let idx = 0
        // Packed Size Header ByteSize
        const n0 = buffer.readUIntBE(idx, 1)
        // Compressed Size Header ByteSize
        const n1 = buffer.readUIntBE(idx += 1, 1)
        // Packed Size
        const s0 = buffer.readUIntBE(idx += 1, n0)
        // Compressed Size
        const s1 = buffer.readUIntBE(idx += n0, n1)
        const headerSize = 2 + n0 + n1

        if (buffer.length !== s1 + headerSize) return new Error('Buffer size is Wrong')

        const dataBuffer = buffer.slice(headerSize)
        const decompressed = Buffer.allocUnsafe(s0)
        const decompressedSize = LZ4.decodeBlock(dataBuffer, decompressed)

        if (decompressedSize !== s0) return new Error('Buffer size is Wrong')

        return packer.unpack(decompressed.slice(0, decompressedSize))
    }
}

module.exports = JsonSerializer