pub mod mem {
    pub fn alloc(size: usize) -> *mut u8 {
        if size == 0 {
            return std::ptr::null_mut();
        }
        let layout = match std::alloc::Layout::from_size_align(size, 1) {
            Ok(l) => l,
            Err(_) => return std::ptr::null_mut(),
        };
        unsafe { std::alloc::alloc(layout) }
    }
    pub fn free(ptr: *mut u8, size: usize) {
        if ptr.is_null() || size == 0 {
            return;
        }
        let layout = match std::alloc::Layout::from_size_align(size, 1) {
            Ok(l) => l,
            Err(_) => return,
        };
        unsafe {
            std::alloc::dealloc(ptr, layout);
        }
    }
}
#[no_mangle]
pub fn walloc(size: usize) -> *mut u8 {
    mem::alloc(size)
}
#[no_mangle]
pub fn wfree(ptr: *mut u8, size: usize) {
    mem::free(ptr, size)
}
