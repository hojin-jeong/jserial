const Fs = require('fs')
const Os = require('os')
const Path = require('path')
const { attempt } = require('../utils/common')

const BaseFrameProcessor = require('../stream')

const getCacheStoragePath = (...optionalPaths) => {
  const cacheStorageList = [
    '/dev/shm',
    '/run/shm',
    Os.tmpdir()
  ]

  let tmpDir
  for (const dir of cacheStorageList) {
    if (Fs.existsSync(dir)) {
      tmpDir = dir
      break
    }
  }
  
  if (!tmpDir) tmpDir = Os.tmpdir()

  const targetDir = Path.join(tmpDir, 'jserial', ...optionalPaths.filter(p => !!p).map(String))
  const dirPath = Path.dirname(targetDir)

  if (!Fs.existsSync(dirPath)) {
    attempt(() => Fs.mkdirSync(dirPath, { recursive: true }))
  }
  return targetDir
}

const loadStructures = (namespace) => {
  const path = getCacheStoragePath(namespace, 'SharedStructures.data')
  if (Fs.existsSync(path)) {
    const content = attempt(() => Fs.readFileSync(path))
    if (content instanceof Error) return null
    return content
  }
  return null
}

const saveStructures = (namespace, data) => {
  const path = getCacheStoragePath(namespace, 'SharedStructures.data')
  attempt(() => Fs.writeFileSync(path, data))
}

class FrameStream {
  #processor
  #serializer
  #stream
  #readBuffer = []
  #readBufferHead = 0
  #readResolvers = []
  #readResolversHead = 0

  constructor(serializer, stream) {
    this.#serializer = serializer
    this.#stream = stream
    this.#processor = new BaseFrameProcessor(serializer)

    // Listen to incoming data
    this.#stream.on('data', (chunk) => {
      const frames = this.#processor.processChunk(chunk)
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
    })
  }

  // Read next frame (returns Promise)
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

  // Write data as frame (returns Promise)
  async write(data) {
    const encoded = this.#serializer.serialize(data)
    return new Promise((resolve, reject) => {
      this.#stream.write(encoded, (err) => {
        if (err) reject(err)
        else resolve()
      })
    })
  }

  /**
   * Write multiple messages as frames in batch (more efficient than multiple write() calls)
   * @param {Array} dataArray - Array of data objects to write
   * @returns {Promise<void>}
   */
  async writeV(dataArray) {
    // Use cork/uncork to batch writes without intermediate concat buffer
    this.#stream.cork()
    try {
      for (const data of dataArray) {
        const encoded = this.#serializer.serialize(data)
        this.#stream.write(encoded)
      }
    } finally {
      this.#stream.uncork()
    }
  }

  // Get underlying stream
  unwrap() {
    return this.#stream
  }
}

module.exports = {
  loadStructures,
  saveStructures,
  FrameStream
}
