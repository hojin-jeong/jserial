pub mod mem {
    pub type buf = *mut u8;
    static mut LEN: usize = 0;
    pub fn length() -> usize {
        unsafe { LEN }
    }
    pub fn set_len(n: usize) {
        unsafe { LEN = n }
    }
    pub fn alloc(size: usize) -> *mut u8 {
        if size == 0 {
            return std::ptr::null_mut();
        }
        unsafe {
            let layout = std::alloc::Layout::from_size_align_unchecked(size, 1);
            std::alloc::alloc(layout)
        }
    }
    pub fn free(ptr: *mut u8, size: usize) {
        if ptr.is_null() || size == 0 {
            return;
        }
        unsafe {
            let layout = std::alloc::Layout::from_size_align_unchecked(size, 1);
            std::alloc::dealloc(ptr, layout);
        }
    }
}
pub mod ptr {
    pub fn err<T>(_code: u8) -> *mut T {
        std::ptr::null_mut()
    }
}
pub mod io {
    use super::mem;
    pub fn load(ptr: *mut u8, size: usize) -> Vec<u8> {
        unsafe {
            let boxed = Box::from_raw(std::slice::from_raw_parts_mut(ptr, size));
            boxed.into_vec()
        }
    }
    pub fn store(buf: Vec<u8>) -> *mut u8 {
        mem::set_len(buf.len());
        let boxed = buf.into_boxed_slice(); // guarantees capacity == len
        Box::into_raw(boxed) as *mut u8
    }
}
#[no_mangle]
pub fn wlen() -> usize {
    mem::length()
}
#[no_mangle]
pub fn walloc(size: usize) -> *mut u8 {
    mem::alloc(size)
}
#[no_mangle]
pub fn wfree(ptr: *mut u8, size: usize) {
    mem::free(ptr, size)
}
