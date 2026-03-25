// WASM Module 캐시 (base64 디코딩 + 컴파일 비용 제거)
let _cachedGenericModule = null
let _cachedSimdModule = null
let _simdCheckFailed = false



class LZ4Wasm {
  #wasm
  #memBuf = null
  #memView = null

  constructor (wasmModule) {
    const instance = new WebAssembly.Instance(wasmModule)
    this.#wasm = instance.exports
  }

  Test () {
    const ptr = this.Alloc(1)
    this.Free(ptr, 1)
  }

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
   * 헤더 파싱 + 압축 해제를 단일 WASM 호출로 처리
   * JS의 헤더 파싱 로직을 WASM 내부로 이전하여 헤더 포맷 coupling 제거
   * @param {number} srcPtr - 전체 프레임 포인터 (헤더 포함)
   * @param {number} srcLen - 전체 프레임 바이트 수
   * @param {number} dstPtr - 출력 버퍼 포인터
   * @param {number} dstLen - 출력 버퍼 크기
   * @returns {number} 압축 해제된 바이트 수, 실패 시 0
   */
  DecompressWithHeader (srcPtr, srcLen, dstPtr, dstLen) {
    return this.#wasm.decompress_with_header(srcPtr, srcLen, dstPtr, dstLen)
  }

  /**
   * 헤더만 파싱하여 압축 해제 후 크기(s0)를 반환 — 실제 압축 해제 없음
   * @param {number} srcPtr - 전체 프레임 포인터
   * @param {number} srcLen - 전체 프레임 바이트 수
   * @returns {number} 압축 해제 크기(s0), 실패 시 0
   */
  GetDecompressedSize (srcPtr, srcLen) {
    return this.#wasm.get_decompressed_size(srcPtr, srcLen)
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

  /**
   * LZ4 블록 압축 (raw format, 헤더 없음)
   * @param {number} srcPtr - 소스 포인터
   * @param {number} srcLen - 소스 바이트 수
   * @param {number} dstPtr - 대상 포인터 (예측 크기 버퍼)
   * @param {number} dstLen - 대상 버퍼 크기
   * @returns {number} 실제 압축된 바이트 수, 실패 시 0
   */
  CompressRawInto (srcPtr, srcLen, dstPtr, dstLen) {
    return this.#wasm.compress_raw_into(srcPtr, srcLen, dstPtr, dstLen)
  }
}

class LZ4 {
  /**
   * 격리된 새 LZ4Wasm 인스턴스 생성 (zero-copy 등 전용 힙 관리용)
   * 싱글톤과 힙을 공유하지 않으므로 외부 메모리 누수로부터 보호됨
   * @returns {LZ4Wasm}
   */
  static createInstance () {
    if (!_cachedSimdModule && !_simdCheckFailed) {
      try {
        const simdBase64 = require('./lz4.wasm.simd')
        _cachedSimdModule = new WebAssembly.Module(
          typeof Buffer !== 'undefined'
            ? Buffer.from(simdBase64, 'base64')
            : Uint8Array.from(atob(simdBase64), (m) => m.charCodeAt(0))
        )
      } catch (e) {
        _simdCheckFailed = true
      }
    }
    if (_cachedSimdModule) {
      const inst = new LZ4Wasm(_cachedSimdModule)
      if (inst.Test()) return inst
    }

    if (!_cachedGenericModule) {
      const genericBase64 = require('./lz4.wasm')
      _cachedGenericModule = new WebAssembly.Module(
        typeof Buffer !== 'undefined'
          ? Buffer.from(genericBase64, 'base64')
          : Uint8Array.from(atob(genericBase64), (m) => m.charCodeAt(0))
      )
    }
    return new LZ4Wasm(_cachedGenericModule)
  }
}

module.exports = LZ4
