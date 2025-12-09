const MsgPackr = require('msgpackr')
const WasmLZ4 = require('./lz4')
const Utility = require('./utility')
const Platform = require('./platform')

class JsonSerializer {
  #namespace
  #packerOptions
  #defaultPacker
  #dictionaryPacker
  #minHeaderSize = 4

  #_getStructures () {
    const rawBuffer = Platform.loadStructures(this.#namespace)
    if (rawBuffer) {
      return this.deserializeTo(this.#defaultPacker, rawBuffer)
    } else {
      return []
    }
  }

  #_saveStructures (structures) {
    const result = this.serializeTo(this.#defaultPacker, structures)
    Platform.saveStructures(this.#namespace, result)
  }

  constructor (opts = {}) {
    if (typeof opts === 'string') {
      opts = {
        namespace: opts
      }
    }
    this.#namespace = opts.namespace
    this.#packerOptions = {
      mapsAsObjects: true,
      variableMapSize: true,
      moreTypes: true,
      bundleStrings: true,
      ...opts.options
    }
    this.#defaultPacker = new MsgPackr.Packr(this.#packerOptions)
    this.#dictionaryPacker = new MsgPackr.Packr({
      getStructures: this.#_getStructures.bind(this),
      saveStructures: this.#_saveStructures.bind(this),
      ...this.#packerOptions
    })
  }

  get defaultPacker () { return this.#defaultPacker }
  get dictionaryPacker () { return this.#dictionaryPacker }

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
  serialize (json) {
    return Utility.toBuffer(this.serializeTo(this.defaultPacker, json))
  }

  /**
   * @deprecated
   */
  serializeHC (json) {
    return Utility.toBuffer(this.serializeTo(this.defaultPacker, json))
  }

  serializeSimple (json) {
    const packedBuffer = this.defaultPacker.pack(json)
    return Utility.toBuffer(WasmLZ4.Compress(packedBuffer))
  }

  serializeWithDictionary (json) {
    return Utility.toBuffer(this.serializeTo(this.dictionaryPacker, json))
  }

  serializeTo (packer = this.defaultPacker, json) {
    const packedBuffer = packer.pack(json)
    const compressedBuffer = WasmLZ4.CompressRaw(packedBuffer)

    // Packed Size
    const s0 = packedBuffer.length
    // Compressed Size
    const s1 = compressedBuffer.length
    // Packed Size Header ByteSize
    const n0 = Utility.getUIntBound(s0)
    // Compressed Size Header ByteSize
    const n1 = Utility.getUIntBound(s1)
    const headerSize = 2 + n0 + n1

    const headerBuffer = new Uint8Array(headerSize)
    let headerBufferIdx = 0

    headerBufferIdx = Utility.writeUIntBE(headerBuffer, n0, headerBufferIdx, 1)
    headerBufferIdx = Utility.writeUIntBE(headerBuffer, n1, headerBufferIdx, 1)
    headerBufferIdx = Utility.writeUIntBE(headerBuffer, s0, headerBufferIdx, n0)
    Utility.writeUIntBE(headerBuffer, s1, headerBufferIdx, n1)

    return Utility.concat([headerBuffer, compressedBuffer.subarray(0, s1)])
  }

  deserialize (buffer) {
    return this.deserializeTo(this.defaultPacker, buffer)
  }

  deserializeSimple (buffer) {
    const decompressedBuffer = WasmLZ4.Decompress(buffer)
    return this.defaultPacker.unpack(Utility.toBuffer(decompressedBuffer))
  }

  deserializeWithDictionary (buffer) {
    return this.deserializeTo(this.dictionaryPacker, buffer)
  }

  deserializeTo (packer = this.defaultPacker, buffer) {
    if (!buffer || !(buffer instanceof Uint8Array) || buffer.length < this.#minHeaderSize) return new Error('Buffer is Wrong')

    let idx = 0
    // Packed Size Header ByteSize
    const n0 = Utility.readUIntBE(buffer, idx, 1)
    // Compressed Size Header ByteSize
    const n1 = Utility.readUIntBE(buffer, idx += 1, 1)
    // Packed Size
    const s0 = Utility.readUIntBE(buffer, idx += 1, n0)
    // Compressed Size
    const s1 = Utility.readUIntBE(buffer, idx += n0, n1)
    const headerSize = 2 + n0 + n1

    if (buffer.length !== s1 + headerSize) return new Error('Buffer size is Wrong')

    const dataBuffer = buffer.subarray(headerSize)
    const decompressed = WasmLZ4.DecompressRaw(s0, dataBuffer)
    const decompressedSize = decompressed.length

    if (decompressedSize !== s0) return new Error('Buffer size is Wrong')

    return packer.unpack(Utility.toBuffer(decompressed.subarray(0, decompressedSize)))
  }

  addExtension (extension) {
    MsgPackr.addExtension(extension)
  }

  static addExtension (extension) {
    MsgPackr.addExtension(extension)
  }
}

module.exports = JsonSerializer