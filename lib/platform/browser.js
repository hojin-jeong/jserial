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
  #readBufferHead = 0
  #readResolvers = []
  #readResolversHead = 0
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
          if (this.#readResolvers.length > this.#readResolversHead) {
            const resolve = this.#readResolvers[this.#readResolversHead++]
            resolve(frame)
            // Periodic compaction
            if (this.#readResolversHead > 1000) {
              this.#readResolvers = this.#readResolvers.slice(this.#readResolversHead)
              this.#readResolversHead = 0
            }
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
    if (this.#readBuffer.length > this.#readBufferHead) {
      const frame = this.#readBuffer[this.#readBufferHead++]
      // Periodic compaction
      if (this.#readBufferHead > 1000) {
        this.#readBuffer = this.#readBuffer.slice(this.#readBufferHead)
        this.#readBufferHead = 0
      }
      return frame
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
    // Sequential writes without intermediate concat buffer
    for (const data of dataArray) {
      const encoded = this.#serializer.serialize(data)
      await this.#writer.write(encoded)
    }
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
