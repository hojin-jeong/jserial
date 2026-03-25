const Fs = require('fs')
const Os = require('os')
const Path = require('path')
const { attempt } = require('../utils/common')

const BaseFrameProcessor = require('../stream')
const LZ4 = require('../lz4')

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
      let frames
      try {
        frames = this.#processor.processChunk(chunk)
      } catch (err) {
        this.#stream.emit('error', err)
        return
      }
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

    this.#stream.on('end', () => this.#_drainResolvers(null))
    this.#stream.on('error', () => this.#_drainResolvers(null))
    this.#stream.on('close', () => this.#_drainResolvers(null))
  }

  #_drainResolvers(value) {
    while (this.#readResolvers.length > this.#readResolversHead) {
      const resolve = this.#readResolvers[this.#readResolversHead++]
      resolve(value)
    }
    this.#readResolvers = []
    this.#readResolversHead = 0
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
    const encoded = this.#serializer.serializeView(data)
    return new Promise((resolve, reject) => {
      this.#stream.write(encoded, (err) => {
        if (err) reject(err)
        else resolve()
      })
    })
  }

  /**
   * Write multiple messages as frames in batch (more efficient than multiple write() calls).
   * Uses owned buffers (serialize) for correctness under backpressure — serializeView
   * returns a zero-copy WASM view that would be corrupted if stream buffers reference
   * the same ArrayBuffer across multiple writes before drain completes.
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

/**
 * BlockFrameStream - LZ4 block compression streaming variant using msgpackr sequential structures.
 * 
 * Wire format:
 * [4 bytes: decompressed_len (uint32 LE)]
 * [4 bytes: compressed_len   (uint32 LE)]
 * [compressed_len bytes: LZ4 compressed data]
 * 
 * The LZ4-compressed payload is raw concatenated msgpack bytes (multiple objects in one block).
 */
class BlockFrameStream {
  #stream
  #packr
  #unpackr
  #lz4
  #msgBufLen = 0
  #srcPtr = 0
  #srcCap = 0
  #dstPtr = 0
  #dstCap = 0
  #blockSize
  #flushInterval
  #flushTimer = null

  // Read side
  #readBuffer = []
  #readBufferHead = 0
  #readResolvers = []
  #readResolversHead = 0

  // Receive-side chunk accumulation (zero-copy optimization)
  #recvChunks = []
  #recvChunksHead = 0
  #recvLen = 0
  #headerBuf = Buffer.allocUnsafe(8)  // 헤더 읽기 전용 재사용 버퍼 (8바이트 고정)

  // Receive-side pre-allocated WASM buffers (grow-only, avoids per-block Alloc/Free)
  #recvSrcPtr = 0
  #recvSrcCap = 0
  #recvDstPtr = 0
  #recvDstCap = 0

  /**
   * @param {Duplex} stream - Node.js Duplex stream
   * @param {object} options - { blockSize, flushInterval, packrOptions }
   */
  constructor(stream, options = {}) {
    const {
      blockSize = 64 * 1024,
      flushInterval = 10,
      packrOptions = {}
    } = options

    this.#stream = stream
    this.#blockSize = blockSize
    this.#flushInterval = flushInterval

    const { Packr, Unpackr } = require('msgpackr')
    this.#packr = new Packr({ ...packrOptions, sequential: true })
    this.#unpackr = new Unpackr({ ...packrOptions, sequential: true })
    this.#lz4 = LZ4.createInstance()

    // Pre-allocate WASM accumulation buffer (2× blockSize for safety margin)
    this.#srcCap = blockSize * 2
    this.#srcPtr = this.#lz4.Alloc(this.#srcCap)

    // Pre-allocate flush destination buffer (compressBound of srcCap + 8 header bytes)
    this.#dstCap = this.#srcCap * 2 + 256 + 8
    this.#dstPtr = this.#lz4.Alloc(this.#dstCap)

    // Incoming data handler
    this.#stream.on('data', (chunk) => {
      this.#_onData(chunk)
    })

    this.#stream.on('end', () => this.#_drainResolvers(null))
    this.#stream.on('error', () => this.#_drainResolvers(null))
    this.#stream.on('close', () => this.#_drainResolvers(null))
  }

  #_drainResolvers(value) {
    while (this.#readResolvers.length > this.#readResolversHead) {
      const resolve = this.#readResolvers[this.#readResolversHead++]
      resolve(value)
    }
    this.#readResolvers = []
    this.#readResolversHead = 0
  }

  // Receive-side data handler — accumulate chunks without concat
  #_onData(chunk) {
    this.#recvChunks.push(chunk)
    this.#recvLen += chunk.length
    try {
      this.#_processBlocks()
    } catch (err) {
      this.#stream.emit('error', err)
    }
  }

  // Ensure receive-side source buffer is large enough (grow-only)
  #_ensureRecvSrc(needed) {
    if (needed > this.#recvSrcCap) {
      if (this.#recvSrcPtr) this.#lz4.Free(this.#recvSrcPtr, this.#recvSrcCap)
      this.#recvSrcCap = needed * 2
      this.#recvSrcPtr = this.#lz4.Alloc(this.#recvSrcCap)
    }
  }

  // Ensure receive-side destination buffer is large enough (grow-only)
  #_ensureRecvDst(needed) {
    if (needed > this.#recvDstCap) {
      if (this.#recvDstPtr) this.#lz4.Free(this.#recvDstPtr, this.#recvDstCap)
      this.#recvDstCap = needed * 2
      this.#recvDstPtr = this.#lz4.Alloc(this.#recvDstCap)
    }
  }

  // Process complete blocks from the accumulated chunk array
  #_processBlocks() {
    while (this.#recvLen >= 8) {
      // Read 8-byte header from chunk array (may span chunk boundaries)
      const header = this.#_readBytesFromChunks(0, 8)
      const decompressedLen = header.readUInt32LE(0)
      const compressedLen = header.readUInt32LE(4)
      const totalBlockSize = 8 + compressedLen

      // Validate header bounds to detect malformed data
      const MAX_BLOCK = 64 * 1024 * 1024  // 64MB
      if (decompressedLen > MAX_BLOCK || compressedLen > MAX_BLOCK) {
        // Malformed header — skip these 8 bytes and continue
        this.#_consumeChunks(8)
        continue
      }

      if (this.#recvLen < totalBlockSize) break  // incomplete block

      // Use grow-only pre-allocated receive buffers (avoids per-block Alloc/Free)
      const lz4 = this.#lz4
      this.#_ensureRecvSrc(compressedLen)
      this.#_ensureRecvDst(decompressedLen)

      const srcPtr = this.#recvSrcPtr
      const dstPtr = this.#recvDstPtr

      // Copy compressed bytes (skipping 8 header bytes) directly into WASM memory
      this.#_copyChunksToWasm(srcPtr, 8, compressedLen)

      // Decompress
      const written = lz4.DecompressRawInto(srcPtr, compressedLen, dstPtr, decompressedLen)

      if (written !== decompressedLen) {
        this.#_consumeChunks(totalBlockSize)
        continue
      }

      // Zero-copy: use WASM Uint8Array view directly (no Buffer.from!)
      const decompressedView = lz4.U8(dstPtr, written)
      const decoded = this.#unpackr.unpackMultiple(decompressedView)

      // Push decoded values to read queue (direct index, avoids iterator overhead)
      for (let i = 0; i < decoded.length; i++) {
        this.#_pushFrame(decoded[i])
      }

      // Consume processed bytes from chunk array
      this.#_consumeChunks(totalBlockSize)
    }
  }

  // Read `length` bytes starting at virtual `offset` in the chunk array
  #_readBytesFromChunks(offset, length) {
    const result = length === 8 ? this.#headerBuf : Buffer.allocUnsafe(length)
    let written = 0
    let pos = 0
    for (let ci = this.#recvChunksHead; ci < this.#recvChunks.length; ci++) {
      const chunk = this.#recvChunks[ci]
      if (pos + chunk.length <= offset) {
        pos += chunk.length
        continue
      }
      const chunkStart = Math.max(0, offset - pos)
      const available = chunk.length - chunkStart
      const toCopy = Math.min(available, length - written)
      chunk.copy(result, written, chunkStart, chunkStart + toCopy)
      written += toCopy
      if (written >= length) break
      pos += chunk.length
    }
    return result
  }

  // Copy `length` bytes starting at virtual offset `skipBytes` into WASM memory at `wasmPtr`
  #_copyChunksToWasm(wasmPtr, skipBytes, length) {
    const lz4 = this.#lz4
    let remaining = length
    let skip = skipBytes
    let wasmOffset = 0
    for (let ci = this.#recvChunksHead; ci < this.#recvChunks.length; ci++) {
      const chunk = this.#recvChunks[ci]
      if (skip >= chunk.length) {
        skip -= chunk.length
        continue
      }
      const chunkStart = skip
      const available = chunk.length - chunkStart
      const toCopy = Math.min(available, remaining)
      lz4.U8(wasmPtr + wasmOffset, toCopy).set(chunk.subarray(chunkStart, chunkStart + toCopy))
      wasmOffset += toCopy
      remaining -= toCopy
      skip = 0
      if (remaining === 0) break
    }
  }

  // Remove the first `bytes` bytes from the chunk array
  #_consumeChunks(bytes) {
    let remaining = bytes
    while (remaining > 0 && this.#recvChunksHead < this.#recvChunks.length) {
      const first = this.#recvChunks[this.#recvChunksHead]
      if (first.length <= remaining) {
        remaining -= first.length
        this.#recvChunksHead++
        // Periodic compaction
        if (this.#recvChunksHead > 1000) {
          this.#recvChunks = this.#recvChunks.slice(this.#recvChunksHead)
          this.#recvChunksHead = 0
        }
      } else {
        this.#recvChunks[this.#recvChunksHead] = first.subarray(remaining)
        remaining = 0
      }
    }
    this.#recvLen -= bytes
    if (this.#recvLen < 0) this.#recvLen = 0
  }

  // Push frame to read queue (same resolver pattern as FrameStream)
  #_pushFrame(value) {
    if (this.#readResolvers.length > this.#readResolversHead) {
      const resolve = this.#readResolvers[this.#readResolversHead++]
      resolve(value)
      // Periodic compaction
      if (this.#readResolversHead > 1000) {
        this.#readResolvers = this.#readResolvers.slice(this.#readResolversHead)
        this.#readResolversHead = 0
      }
    } else {
      this.#readBuffer.push(value)
    }
  }

  /**
   * Read next frame (returns Promise)
   * @returns {Promise<*>}
   */
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
   * Read multiple frames in batch
   * @param {number} count - Number of frames to read
   * @returns {Promise<Array>}
   */
  async readV(count) {
    const available = this.#readBuffer.length - this.#readBufferHead

    if (available >= count) {
      const frames = this.#readBuffer.slice(this.#readBufferHead, this.#readBufferHead + count)
      this.#readBufferHead += count
      if (this.#readBufferHead > 1000) {
        this.#readBuffer = this.#readBuffer.slice(this.#readBufferHead)
        this.#readBufferHead = 0
      }
      return frames
    }

    // Drain buffer
    const frames = this.#readBuffer.slice(this.#readBufferHead)
    this.#readBuffer = []
    this.#readBufferHead = 0

    // Create promises for remaining messages
    const remaining = count - frames.length
    const pending = Array.from({ length: remaining }, () =>
      new Promise(resolve => this.#readResolvers.push(resolve))
    )
    const waited = await Promise.all(pending)
    return frames.concat(waited)
  }

  /**
   * Pack data and accumulate into WASM buffer with overflow handling.
   * Handles zero-copy path and heap fallback with buffer flush/grow logic.
   * @param {Uint8Array} packed - Already-packed data from packr
   * @param {boolean} batchMode - If true, grow buffer on overflow instead of flushing (for writeV)
   * @returns {Promise<void>}
   */
  async #_packAndAccumulate(packed, batchMode = false) {
    // Check if packr wrote directly into WASM (zero-copy path)
    const wasmBuffer = this.#lz4.U8(0, 1).buffer
    if (packed.buffer === wasmBuffer) {
      // Data already at correct position in WASM — just advance
      this.#msgBufLen += packed.length
      return
    }

    // Heap fallback — need to copy into WASM
    if (this.#msgBufLen + packed.length > this.#srcCap) {
      if (batchMode) {
        // BATCH MODE: grow WASM buffer instead of flushing
        // This preserves batching so writeV creates one large block, not many small ones
        const newCap = Math.max(this.#srcCap * 2, this.#msgBufLen + packed.length * 2)

        // Copy existing WASM data to JS Buffer before realloc (WASM memory may grow)
        const existing = this.#msgBufLen > 0
          ? Buffer.from(this.#lz4.U8(this.#srcPtr, this.#msgBufLen))
          : null

        this.#lz4.Free(this.#srcPtr, this.#srcCap)
        this.#srcCap = newCap
        this.#srcPtr = this.#lz4.Alloc(this.#srcCap)
        if (!this.#srcPtr) {
          throw new Error('WASM allocation failed: out of memory')
        }

        // Restore existing data at new location
        if (existing) {
          this.#lz4.U8(this.#srcPtr, existing.length).set(existing)
        }
      } else {
        // NORMAL MODE: flush existing buffer first, then start fresh
        if (this.#msgBufLen > 0) {
          await this.flush()
          // After flush: #msgBufLen = 0, WASM memory may have grown
        }

        // If single message exceeds srcCap, grow the buffer
        if (packed.length > this.#srcCap) {
          this.#lz4.Free(this.#srcPtr, this.#srcCap)
          this.#srcCap = packed.length * 2
          this.#srcPtr = this.#lz4.Alloc(this.#srcCap)
          if (!this.#srcPtr) {
            throw new Error('WASM allocation failed: out of memory')
          }
        }
      }
    }

    // Copy packed data to WASM at current position
    this.#lz4.U8(this.#srcPtr + this.#msgBufLen, packed.length).set(packed)
    this.#msgBufLen += packed.length
  }

  /**
   * Write data as frame — encode + buffer; auto-flushes if blockSize reached
   * @param {*} obj - Object to serialize
   * @returns {Promise<void>}
   */
  async write(obj) {
    const remaining = this.#srcCap - this.#msgBufLen
    const wasmView = this.#lz4.U8(this.#srcPtr + this.#msgBufLen, remaining)
    const bufForPackr = Buffer.from(wasmView.buffer, wasmView.byteOffset, remaining)

    this.#packr.useBuffer(bufForPackr)
    const packed = this.#packr.pack(obj)

    await this.#_packAndAccumulate(packed)

    this.#_resetFlushTimer()
    if (this.#msgBufLen >= this.#blockSize) {
      await this.flush()
    }
  }

  /**
   * Write multiple messages in batch
   * @param {Array} dataArray - Array of data objects
   * @returns {Promise<void>}
   */
  async writeV(dataArray) {
    for (const data of dataArray) {
      const remaining = this.#srcCap - this.#msgBufLen
      const wasmView = this.#lz4.U8(this.#srcPtr + this.#msgBufLen, remaining)
      const bufForPackr = Buffer.from(wasmView.buffer, wasmView.byteOffset, remaining)

      this.#packr.useBuffer(bufForPackr)
      const packed = this.#packr.pack(data)

      await this.#_packAndAccumulate(packed, true)  // batchMode=true for writeV
    }
    this.#_resetFlushTimer()
    if (this.#msgBufLen >= this.#blockSize) {
      await this.flush()
    }
  }

  /**
   * Explicit flush — compress and send what's buffered
   * @returns {Promise<void>}
   */
  async flush() {
    if (this.#flushTimer) { clearTimeout(this.#flushTimer); this.#flushTimer = null }
    if (this.#msgBufLen === 0) return

    const decompressedLen = this.#msgBufLen
    this.#msgBufLen = 0

    const compressBound = decompressedLen * 2 + 256
    const lz4 = this.#lz4

    // Grow pre-allocated dst buffer if needed (rare: only when block exceeds initial cap)
    const needed = 8 + compressBound
    if (needed > this.#dstCap) {
      lz4.Free(this.#dstPtr, this.#dstCap)
      this.#dstCap = needed * 2
      this.#dstPtr = lz4.Alloc(this.#dstCap)
    }

    const written = lz4.CompressRawInto(this.#srcPtr, decompressedLen, this.#dstPtr + 8, compressBound)

    if (written === 0) {
      throw new Error('LZ4 raw compression failed')
    }

    const headerView = lz4.U8(this.#dstPtr, 8)
    headerView[0] = decompressedLen & 0xFF
    headerView[1] = (decompressedLen >>> 8) & 0xFF
    headerView[2] = (decompressedLen >>> 16) & 0xFF
    headerView[3] = (decompressedLen >>> 24) & 0xFF
    headerView[4] = written & 0xFF
    headerView[5] = (written >>> 8) & 0xFF
    headerView[6] = (written >>> 16) & 0xFF
    headerView[7] = (written >>> 24) & 0xFF

    const output = Buffer.from(lz4.U8(this.#dstPtr, 8 + written))

    return new Promise((resolve, reject) => {
      this.#stream.write(output, (err) => err ? reject(err) : resolve())
    })
  }

  /**
   * Reset idle flush timer
   */
  #_resetFlushTimer() {
    if (this.#flushInterval <= 0) return
    if (this.#flushTimer) clearTimeout(this.#flushTimer)
    this.#flushTimer = setTimeout(() => {
      this.#flushTimer = null
      this.flush().catch(() => {})
    }, this.#flushInterval)
  }

  /**
   * Cleanup resources
   */
  destroy() {
    if (this.#flushTimer) clearTimeout(this.#flushTimer)
    if (this.#lz4) {
      if (this.#srcPtr) this.#lz4.Free(this.#srcPtr, this.#srcCap)
      if (this.#dstPtr) this.#lz4.Free(this.#dstPtr, this.#dstCap)
      if (this.#recvSrcPtr) this.#lz4.Free(this.#recvSrcPtr, this.#recvSrcCap)
      if (this.#recvDstPtr) this.#lz4.Free(this.#recvDstPtr, this.#recvDstCap)
    }
    this.#recvSrcPtr = 0
    this.#recvSrcCap = 0
    this.#recvDstPtr = 0
    this.#recvDstCap = 0
    this.#lz4 = null
    this.#srcPtr = 0
    this.#srcCap = 0
    this.#dstPtr = 0
    this.#dstCap = 0
    this.#msgBufLen = 0
    this.#readBuffer = []
    this.#readResolvers = []
    this.#recvChunks = []
    this.#recvChunksHead = 0
    this.#recvLen = 0
  }

  /**
   * Return underlying stream
   * @returns {Duplex}
   */
  unwrap() {
    return this.#stream
  }
}

module.exports = {
  loadStructures,
  saveStructures,
  FrameStream,
  BlockFrameStream
}
