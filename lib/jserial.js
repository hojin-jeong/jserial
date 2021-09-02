
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
        this.$headerSize = 8
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

    serialize(json) {
        return this.serializeTo(this.$nonDictionaryPacker, json)
    }
    serializeWithDictionary(json) {
        return this.serializeTo(this.$dictionaryPacker, json)
    }
    serializeTo(packer = this.$nonDictionaryPacker, json) {
        const packedBuffer = packer.pack(json)
        const compressed = Buffer.allocUnsafe(8 + LZ4.encodeBound(packedBuffer.length))
        const compressedSize = LZ4.encodeBlock(packedBuffer, compressed, this.$headerSize)
        compressed.writeUInt32BE(compressedSize, 0)
        compressed.writeUInt32BE(packedBuffer.length, 4)
        return compressed.slice(0, compressedSize + this.$headerSize)
    }
    deserialize(buffer) {
        return this.deserializeTo(this.$nonDictionaryPacker, buffer)
    }
    deserializeWithDictionary(buffer) {
        return this.deserializeTo(this.$dictionaryPacker, buffer)
    }
    deserializeTo(packer = this.$nonDictionaryPacker, buffer) {
        if (!buffer || !Buffer.isBuffer(buffer) || buffer.length < this.$headerSize) return new Error('Buffer is Wrong')
        const compressedSize = buffer.readUInt32BE(0)
        const packedSize = buffer.readUInt32BE(4)
        if (buffer.length !== compressedSize + this.$headerSize) return new Error('Buffer size is Wrong')
        const dataBuffer = buffer.slice(this.$headerSize)
        const decompressed = Buffer.allocUnsafe(packedSize)
        const decompressedSize = LZ4.decodeBlock(dataBuffer, decompressed)
        return packer.unpack(decompressed.slice(0, decompressedSize))
    }
}

module.exports = JsonSerializer