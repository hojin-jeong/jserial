class Utility {
  static getUIntBound (integer) {
    let i = integer
    let counter = 0
    while (i !== 0) {
      i >>= 8
      counter++
    }
    return counter
  }

  static globalAtob (str) {
    if (typeof atob === 'function') return atob(str)
    if (typeof Buffer !== 'undefined' && Buffer.from) {
      return Buffer.from(str, 'base64').toString('binary')
    }
    throw new Error('atob is not supported')
  }

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

  static writeUIntBE (uint8Array, value, offset, byteLength) {
    for (let i = byteLength - 1; i >= 0; i--) {
      uint8Array[offset + i] = value & 0xff
      value >>>= 8
    }
    return offset + byteLength
  }

  static readUIntBE (uint8Array, offset, byteLength) {
    let value = 0
    for (let i = 0; i < byteLength; i++) {
      value = (value * 256) + uint8Array[offset + i]
    }
    return value
  }

  static toBuffer (uint8Array) {
    if (typeof Buffer !== 'undefined' && typeof Buffer.from === 'function') {
      return Buffer.from(uint8Array.buffer, uint8Array.byteOffset, uint8Array.byteLength)
    }
    return uint8Array
  }
}

module.exports = Utility