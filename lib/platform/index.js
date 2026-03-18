const Fs = require('fs')
const Os = require('os')
const Path = require('path')
const { attempt } = require('../utils/common')

const BaseFrameProcessor = require('../stream')

let _cachedTmpDir = null

const getCacheStoragePath = (...optionalPaths) => {
    if (!_cachedTmpDir) {
        const cacheStorageList = [
            '/dev/shm',
            '/run/shm',
            Os.tmpdir()
        ]
        for (const dir of cacheStorageList) {
            if (Fs.existsSync(dir)) {
                _cachedTmpDir = dir
                break
            }
        }
        if (!_cachedTmpDir) _cachedTmpDir = Os.tmpdir()
    }

    const targetDir = Path.join(_cachedTmpDir, 'jserial', ...optionalPaths.filter(p => !!p).map(String))
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

  /**
   * Read multiple frames in batch (more efficient than multiple read() calls when messages are buffered)
   * @param {number} count - Number of frames to read
   * @returns {Promise<Array>}
   */
  async readV(count) {
    const available = this.#readBuffer.length - this.#readBufferHead

    // 모든 메시지가 이미 버퍼에 있는 경우 — Promise 생성 없이 즉시 반환
    if (available >= count) {
      const frames = this.#readBuffer.slice(this.#readBufferHead, this.#readBufferHead + count)
      this.#readBufferHead += count
      if (this.#readBufferHead > 1000) {
        this.#readBuffer = this.#readBuffer.slice(this.#readBufferHead)
        this.#readBufferHead = 0
      }
      return frames
    }

    // 버퍼에 있는 것 먼저 드레인
    const frames = this.#readBuffer.slice(this.#readBufferHead)
    this.#readBuffer = []
    this.#readBufferHead = 0

    // 남은 메시지를 위한 Promise 생성
    const remaining = count - frames.length
    const pending = Array.from({ length: remaining }, () =>
      new Promise(resolve => this.#readResolvers.push(resolve))
    )
    const waited = await Promise.all(pending)
    return frames.concat(waited)
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
    this.#stream.cork()
    try {
      for (const data of dataArray) {
        const encoded = this.#serializer.serialize(data)
        const canContinue = this.#stream.write(encoded)
        if (!canContinue) {
          await new Promise(resolve => this.#stream.once('drain', resolve))
        }
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
