const storage = new Map()
const BaseFrameProcessor = require('../stream')

const loadStructures = (namespace) => {
  return storage.get(namespace) || null
}

const saveStructures = (namespace, data) => {
  storage.set(namespace, data)
}

class FrameStream {
  #processor
  #serializer
  #reader
  #writer
  #readBuffer = []
  #readResolvers = []
  #reading = false

  constructor(serializer, readable, writable) {
    this.#serializer = serializer
    this.#processor = new BaseFrameProcessor(serializer)
    this.#reader = readable.getReader()
    this.#writer = writable.getWriter()

    this.#startReading()
  }

  async #startReading() {
    this.#reading = true
    try {
      while (this.#reading) {
        const { value, done } = await this.#reader.read()
        if (done) break

        const frames = this.#processor.processChunk(value)
        frames.forEach(frame => {
          if (this.#readResolvers.length > 0) {
            const resolve = this.#readResolvers.shift()
            resolve(frame)
          } else {
            this.#readBuffer.push(frame)
          }
        })
      }
    } catch (err) {
      // Handle stream errors
      this.#readResolvers.forEach(resolve => resolve(null))
      this.#readResolvers = []
    }
  }

  async read() {
    if (this.#readBuffer.length > 0) {
      return this.#readBuffer.shift()
    }
    return new Promise(resolve => {
      this.#readResolvers.push(resolve)
    })
  }

  async write(data) {
    const encoded = this.#serializer.serialize(data)
    await this.#writer.write(encoded)
  }

  /**
   * Write multiple messages as frames in batch (more efficient than multiple write() calls)
   * @param {Array} dataArray - Array of data objects to write
   * @returns {Promise<void>}
   */
  async writeV(dataArray) {
    // Serialize all messages first
    const buffers = dataArray.map(data => this.#serializer.serialize(data))
    
    // Concatenate into single buffer for one write call
    const totalLength = buffers.reduce((sum, buf) => sum + buf.length, 0)
    const combined = new Uint8Array(totalLength)
    let offset = 0
    for (const buf of buffers) {
      combined.set(buf, offset)
      offset += buf.length
    }
    
    // Single write to stream
    await this.#writer.write(combined)
  }

  close() {
    this.#reading = false
    this.#reader.releaseLock()
    this.#writer.releaseLock()
  }
}

module.exports = {
  loadStructures,
  saveStructures,
  FrameStream
}
