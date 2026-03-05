const { attempt } = require('./utils/common')


class LZ4Wasm {
  #wasm
  #memBuf = null
  #memView = null

  constructor (wasmString) {
    const buffer = typeof Buffer !== 'undefined'
      ? Buffer.from(wasmString, 'base64')
      : Uint8Array.from(atob(wasmString), (m) => m.charCodeAt(0))
    const module = new WebAssembly.Module(buffer)
    const instance = new WebAssembly.Instance(module)
    this.#wasm = instance.exports
  }

  Test () {
    const ptr = this.Alloc(1)
    this.Free(ptr, 1)
  }

  Length () { return this.#wasm.wlen() }
  Alloc (size) { return size > 0 ? this.#wasm.walloc(size) : 0 }
  Free (ptr, size) { return this.#wasm.wfree(ptr, size) }
  U8 (ptr, size) {
    const buf = this.#wasm.memory.buffer
    if (buf !== this.#memBuf) {
      this.#memBuf = buf
      this.#memView = new Uint8Array(buf)
    }
    return this.#memView.subarray(ptr, ptr + size)
  }

  /**
   * 압축 해제를 호출자 제공 버퍼에 직접 수행 (할당/복사 없음)
   * @param {number} srcPtr - 압축된 데이터 포인터
   * @param {number} srcLen - 압축된 데이터 바이트 수
   * @param {number} dstPtr - 대상 버퍼 포인터
   * @param {number} dstLen - 대상 버퍼 크기
   * @returns {number} 실제 압축 해제된 바이트 수, 실패 시 0
   */
  DecompressRawInto (srcPtr, srcLen, dstPtr, dstLen) {
    return this.#wasm.decompress_raw_into(srcPtr, srcLen, dstPtr, dstLen)
  }

  /**
   * 압축 + 헤더 조립을 단일 WASM 호출로 처리
   * @param {number} srcPtr - 소스 포인터
   * @param {number} srcLen - 소스 바이트 수
   * @param {number} dstPtr - 대상 포인터 (헤더 공간 포함)
   * @param {number} dstLen - 대상 버퍼 크기
   * @returns {number} 패킹된 정수. 실패 시 0. (headerStart = rv & 0x1F, totalSize = rv >>> 5)
   */
  CompressWithHeader (srcPtr, srcLen, dstPtr, dstLen) {
    return this.#wasm.compress_with_header(srcPtr, srcLen, dstPtr, dstLen)
  }
}

class LZ4 {
  static #lz4Wasm

  static #_loadWasm () {
    const trySimd = attempt(() => {
      const wasm = new LZ4Wasm(require('./lz4.wasm.simd'))
      wasm.Test()
      return wasm
    })

    if (!(trySimd instanceof Error)) {
      this.#lz4Wasm = trySimd
      return this.#lz4Wasm
    }

    console.warn('this system is SIMD unsupported. fallback generic wasm')
    this.#lz4Wasm = new LZ4Wasm(require('./lz4.wasm'))
    return this.#lz4Wasm
  }

  /**
   * 격리된 새 LZ4Wasm 인스턴스 생성 (zero-copy 등 전용 힙 관리용)
   * 싱글톤과 힙을 공유하지 않으므로 외부 메모리 누수로부터 보호됨
   * @returns {LZ4Wasm}
   */
  static createInstance () {
    const trySimd = attempt(() => {
      const wasm = new LZ4Wasm(require('./lz4.wasm.simd'))
      wasm.Test()
      return wasm
    })
    if (!(trySimd instanceof Error)) return trySimd
    return new LZ4Wasm(require('./lz4.wasm'))
  }
}

module.exports = LZ4