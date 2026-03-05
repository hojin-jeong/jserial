mod ffi;

#[cfg(target_arch = "wasm32")]
#[global_allocator]
static ALLOC: wee_alloc::WeeAlloc = wee_alloc::WeeAlloc::INIT;

// ─── 기존 함수들 (Reference lz4.rs 기반) ────────────────────────────────────

/// LZ4 블록 압축 (입력 소유권 이전 → WASM 내부에서 해제됨)
#[no_mangle]
pub extern "C" fn compress_raw(ptr: ffi::mem::buf, len: usize) -> ffi::mem::buf {
    ffi::io::store(lz4_flex::compress(&ffi::io::load(ptr, len)))
}

/// LZ4 블록 해제 (size = 원본 크기)
#[no_mangle]
pub extern "C" fn decompress_raw(size: usize, ptr: ffi::mem::buf, len: usize) -> ffi::mem::buf {
    match lz4_flex::decompress(&ffi::io::load(ptr, len), size) {
        Err(_) => ffi::ptr::err(0),
        Ok(buf) => ffi::io::store(buf),
    }
}

// ─── 신규 제로카피 함수들 ──────────────────────────────────────────────────────

/// 입력 소유권 없이 src_ptr → dst_ptr 로 직접 압축
/// - src_ptr : JS 가 WASM 에 복사한 입력 (호출자가 wfree 책임)
/// - dst_ptr : 미리 할당한 출력 버퍼 (영구 재사용 가능)
/// - 반환값  : 실제 압축된 바이트 수, 실패 시 0
#[no_mangle]
pub unsafe extern "C" fn compress_raw_into(
    src_ptr: *const u8,
    src_len: usize,
    dst_ptr: *mut u8,
    dst_len: usize,
) -> usize {
    if src_len > 0 && src_ptr.is_null() {
        return 0;
    }
    if dst_len > 0 && dst_ptr.is_null() {
        return 0;
    }
    let src = std::slice::from_raw_parts(src_ptr, src_len);
    let dst = std::slice::from_raw_parts_mut(dst_ptr, dst_len);
    match lz4_flex::compress_into(src, dst) {
        Err(_) => 0,
        Ok(written) => written,
    }
}

/// 입력 소유권 없이 src_ptr → dst_ptr 로 직접 압축 해제
/// - src_ptr : JS 가 WASM 에 복사한 압축된 데이터
/// - dst_ptr : 호출자가 제공한 출력 버퍼 (크기는 원본 크기여야 함)
/// - 반환값  : 실제 압축 해제된 바이트 수, 실패 시 0
#[no_mangle]
pub unsafe extern "C" fn decompress_raw_into(
    src_ptr: *const u8,
    src_len: usize,
    dst_ptr: *mut u8,
    dst_len: usize,
) -> usize {
    if src_len > 0 && src_ptr.is_null() {
        return 0;
    }
    if dst_len > 0 && dst_ptr.is_null() {
        return 0;
    }
    let src = std::slice::from_raw_parts(src_ptr, src_len);
    let dst = std::slice::from_raw_parts_mut(dst_ptr, dst_len);
    match lz4_flex::decompress_into(src, dst) {
        Err(_) => 0,
        Ok(written) => written,
    }
}

// ─── jserial 헤더 포함 압축 함수 ─────────────────────────────────────────────

const MAX_HEADER_RESERVE: usize = 10;

fn uint_bound(v: usize) -> usize {
    if v == 0 {
        0
    } else if v < 256 {
        1
    } else if v < 65536 {
        2
    } else if v < 16777216 {
        3
    } else {
        4
    }
}

fn write_uint_be(buf: &mut [u8], value: usize, byte_len: usize) {
    for i in 0..byte_len {
        buf[byte_len - 1 - i] = ((value >> (i * 8)) & 0xFF) as u8;
    }
}

/// Compresses src and builds jserial header in a single WASM call.
/// Header format: [n0(1B)][n1(1B)][s0(n0 bytes BE)][s1(n1 bytes BE)][compressed data]
/// Returns packed value: (total_size << 5) | header_start
/// JS decodes: headerStart = rv & 0x1F, totalSize = rv >>> 5
/// Returns 0 on failure.
#[no_mangle]
pub unsafe extern "C" fn compress_with_header(
    src_ptr: *const u8,
    src_len: usize,
    dst_ptr: *mut u8,
    dst_len: usize,
) -> usize {
    if src_len > 0 && src_ptr.is_null() {
        return 0;
    }
    if dst_len > 0 && dst_ptr.is_null() {
        return 0;
    }
    let src = std::slice::from_raw_parts(src_ptr, src_len);
    let dst = std::slice::from_raw_parts_mut(dst_ptr, dst_len);

    if dst_len <= MAX_HEADER_RESERVE {
        return 0;
    }

    // Compress into dst after header reserve
    let s1 = match lz4_flex::compress_into(src, &mut dst[MAX_HEADER_RESERVE..]) {
        Err(_) => return 0,
        Ok(written) => written,
    };

    let s0 = src_len;
    let n0 = uint_bound(s0);
    let n1 = uint_bound(s1);
    let header_size = 2 + n0 + n1;
    let header_start = MAX_HEADER_RESERVE - header_size;

    // Write header
    dst[header_start] = n0 as u8;
    dst[header_start + 1] = n1 as u8;
    write_uint_be(&mut dst[header_start + 2..], s0, n0);
    write_uint_be(&mut dst[header_start + 2 + n0..], s1, n1);

    // Pack both values into return: (total_size << 5) | header_start
    ((header_size + s1) << 5) | header_start
}
