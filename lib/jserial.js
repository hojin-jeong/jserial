
const Fs = require('fs')

const MsgPackr = require('msgpackr')
const LZ4 = require('lz4')

const Utility = require('./utility')

class JsonSerializer {
    constructor(opts = {}) {
        if(typeof opts === "string") {
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
    }

    $_getStructures() {
        const path = Utility.getCacheStoragePath(this.$namespace, 'SharedStructures.data')
        if(Fs.existsSync(path)) {
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
        const bufferBound = LZ4.encodeBound(packedBuffer.length)
        const compressed = Buffer.allocUnsafe(4 + bufferBound)
        compressed.writeUInt32BE(bufferBound, 0)
        const compressedSize = LZ4.encodeBlock(packedBuffer, compressed, 4)
        return compressed.slice(0, compressedSize + 4)
    }
    deserialize(buffer) {
        return this.deserializeTo(this.$nonDictionaryPacker, buffer)
    }
    deserializeWithDictionary(buffer) {
        return this.deserializeTo(this.$dictionaryPacker, buffer)
    }
    deserializeTo(packer = this.$nonDictionaryPacker, buffer) {
        const dataBuffer = buffer.slice(4)
        const decompressed = Buffer.allocUnsafe(buffer.readUInt32BE(0))
        const decompressedSize = LZ4.decodeBlock(dataBuffer, decompressed)
        return packer.unpack(decompressed.slice(0, decompressedSize))
    }
}

module.exports = JsonSerializer