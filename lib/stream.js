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
   * Returns totalSize or null if incomplete
   */
  parseHeader (buffer) {
    if (buffer.length < this.#minHeaderSize) {
      return null
    }

    // n0 = size of s0 (unused), n1 = size of s1 (data size)
    const n0 = buffer[0]
    const n1 = buffer[1]

    // Check if we have enough bytes for the size headers
    if (buffer.length < 2 + n0 + n1) {
      return null
    }

    // Skip s0, read s1 (data size)
    const s1Idx = 2 + n0
    const dataSize = Utility.readUIntBE(buffer, s1Idx, n1)

    return 2 + n0 + n1 + dataSize
  }

  /**
   * Process incoming chunk, extract complete frames
   * Returns array of deserialized objects
   */
  processChunk (chunk) {
    if (chunk) {
      // Fast-path: avoid concat when buffer is empty (eliminates O(n²) copying)
      if (this.#buffer.length === 0) {
        this.#buffer = chunk
      } else {
        this.#buffer = Utility.concat([this.#buffer, chunk])
      }
    }

    const frames = []

    while (this.#buffer.length >= this.#minHeaderSize) {
      const totalSize = this.parseHeader(this.#buffer)

      if (!totalSize) {
        // Incomplete header, wait for more data
        break
      }

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

}

module.exports = BaseFrameProcessor
