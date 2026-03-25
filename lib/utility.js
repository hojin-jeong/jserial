const HAS_BUFFER = typeof Buffer !== 'undefined' && typeof Buffer.from === 'function'

class Utility {


  static concat (list) {
    const length = list.reduce((acc, curr) => acc + curr.length, 0)
    const result = new Uint8Array(length)
    let offset = 0
    for (const item of list) {
      result.set(item, offset)
      offset += item.length
    }
    return result
  }


  static readUIntBE (uint8Array, offset, byteLength) {
    if (byteLength === 1) return uint8Array[offset]
    if (byteLength === 2) return (uint8Array[offset] << 8) | uint8Array[offset + 1]
    if (byteLength === 3) {
      return ((uint8Array[offset] << 16) | (uint8Array[offset + 1] << 8) | uint8Array[offset + 2]) >>> 0
    }
    if (byteLength === 4) {
      return ((uint8Array[offset] << 24) | (uint8Array[offset + 1] << 16) |
              (uint8Array[offset + 2] << 8) | uint8Array[offset + 3]) >>> 0
    }
    // generic fallback for other lengths
    let value = 0
    for (let i = 0; i < byteLength; i++) {
      value = (value * 256) + uint8Array[offset + i]
    }
    return value
  }

  static toBuffer (uint8Array) {
    if (HAS_BUFFER) {
      return Buffer.from(uint8Array.buffer, uint8Array.byteOffset, uint8Array.byteLength)
    }
    return uint8Array
  }
}

module.exports = Utility