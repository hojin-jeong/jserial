const Utility = require('./utility')

class BaseFrameProcessor {
  #buffer = new Uint8Array(0)
  #serializer
  #minHeaderSize = 2

  constructor (serializer) {
    this.#serializer = serializer
  }

  /**
   * Parse jserial header: [n0][n1][s0...][s1...][data]
   * Returns { headerSize, dataSize } or null if incomplete
   */
  parseHeader (buffer) {
    if (buffer.length < this.#minHeaderSize) {
      return null
    }

    let idx = 0
    const n0 = Utility.readUIntBE(buffer, idx, 1)
    const n1 = Utility.readUIntBE(buffer, idx += 1, 1)

    // Check if we have enough bytes for the size headers
    if (buffer.length < 2 + n0 + n1) {
      return null
    }

    const s0 = Utility.readUIntBE(buffer, idx += 1, n0)
    const s1 = Utility.readUIntBE(buffer, idx += n0, n1)
    const headerSize = 2 + n0 + n1
    const dataSize = s1
    const totalSize = headerSize + dataSize

    return {
      headerSize,
      dataSize,
      totalSize
    }
  }

  /**
   * Process incoming chunk, extract complete frames
   * Returns array of deserialized objects
   */
  processChunk (chunk) {
    if (chunk) {
      this.#buffer = Utility.concat([this.#buffer, chunk])
    }

    const frames = []

    while (this.#buffer.length >= this.#minHeaderSize) {
      const header = this.parseHeader(this.#buffer)

      if (!header) {
        // Incomplete header, wait for more data
        break
      }

      const { totalSize } = header

      if (this.#buffer.length < totalSize) {
        // Incomplete frame, wait for more data
        break
      }

      // Extract complete frame
      const frameBuffer = this.#buffer.subarray(0, totalSize)
      const deserialized = this.#serializer.deserialize(frameBuffer)

      if (!(deserialized instanceof Error)) {
        frames.push(deserialized)
      }

      // Remove processed frame from buffer
      this.#buffer = this.#buffer.subarray(totalSize)
    }

    return frames
  }

  /**
   * Encode data with jserial (just calls serializer.serialize)
   */
  encodeFrame (data) {
    return this.#serializer.serialize(data)
  }

  /**
   * Reset internal buffer
   */
  reset () {
    this.#buffer = new Uint8Array(0)
  }
}

module.exports = BaseFrameProcessor
