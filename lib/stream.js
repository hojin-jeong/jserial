const Utility = require('./utility')

class BaseFrameProcessor {
    #chunks = []
    #totalLen = 0
    #serializer
    #minHeaderSize = 2

    /** Maximum allowed frame payload size (64MB) */
    static MAX_FRAME_SIZE = 64 * 1024 * 1024

    constructor(serializer) {
        this.#serializer = serializer
    }

    /**
     * Parse jserial header: [n0][n1][s0...][s1...][data]
     * Returns totalSize or null if incomplete
     */
    parseHeader(buffer) {
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
        const MAX_FRAME_SIZE = BaseFrameProcessor.MAX_FRAME_SIZE
        if (dataSize > MAX_FRAME_SIZE) {
            throw new RangeError(`Frame payload too large: ${dataSize} bytes (max ${MAX_FRAME_SIZE})`)
        }

        return 2 + n0 + n1 + dataSize
    }

    /**
     * Flatten chunks into a single buffer
     * Returns the flattened buffer
     */
    #_flatten() {
        if (this.#chunks.length === 0) {
            return new Uint8Array(0)
        }
        if (this.#chunks.length === 1) {
            return this.#chunks[0]
        }
        const result = Utility.concat(this.#chunks)
        this.#chunks = [result]
        return result
    }

    /**
     * Process incoming chunk, extract complete frames
     * Returns array of deserialized objects
     */
    processChunk(chunk) {
        // Fast-path: if chunks is empty and new chunk alone contains all data, use directly
        if (chunk && this.#chunks.length === 0) {
            const frames = []
            let offset = 0

            while (offset + this.#minHeaderSize <= chunk.length) {
                const totalSize = this.parseHeader(chunk.subarray(offset))

                if (!totalSize) {
                    // Incomplete header, wait for more data
                    break
                }

                if (offset + totalSize > chunk.length) {
                    // Incomplete frame, wait for more data
                    break
                }

                // Extract complete frame
                const frameBuffer = chunk.subarray(offset, offset + totalSize)
                const deserialized = this.#serializer.deserializeView(frameBuffer)

                if (deserialized instanceof Error) {
                    throw deserialized
                }
                frames.push(deserialized)

                offset += totalSize
            }

            // If there's leftover, store it
            if (offset < chunk.length) {
                const remainLen = chunk.length - offset
                const leftover = new Uint8Array(remainLen)
                leftover.set(chunk.subarray(offset))
                this.#chunks = [leftover]
                this.#totalLen = leftover.length
            }

            return frames
        }

        // Normal path: accumulate chunks
        if (chunk) {
            this.#chunks.push(chunk)
            this.#totalLen += chunk.length
        }

        const frames = []
        const buffer = this.#_flatten()
        let offset = 0

        while (offset + this.#minHeaderSize <= buffer.length) {
            const totalSize = this.parseHeader(buffer.subarray(offset))

            if (!totalSize) {
                // Incomplete header, wait for more data
                break
            }

            if (offset + totalSize > buffer.length) {
                // Incomplete frame, wait for more data
                break
            }

            // Extract complete frame
            const frameBuffer = buffer.subarray(offset, offset + totalSize)
            const deserialized = this.#serializer.deserializeView(frameBuffer)

            if (deserialized instanceof Error) {
                throw deserialized
            }
            frames.push(deserialized)

            offset += totalSize
        }

        // Handle remaining data - copy into fresh Uint8Array to break slab reference
        if (offset < buffer.length) {
            const remainLen = buffer.length - offset
            const leftover = new Uint8Array(remainLen)
            leftover.set(buffer.subarray(offset))
            this.#chunks = [leftover]
            this.#totalLen = leftover.length
        } else {
            this.#chunks = []
            this.#totalLen = 0
        }

        return frames
    }
}

module.exports = BaseFrameProcessor
