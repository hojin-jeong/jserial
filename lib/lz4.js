
class LZ4Wasm {
    #wasm

    constructor(wasmString) {
        const buffer = Uint8Array.from(
            atob(wasmString),
            (m) => m.codePointAt(0)
        )
        const module = new WebAssembly.Module(buffer)
        const instance = new WebAssembly.Instance(module)
        this.#wasm = instance.exports
    }

    Test() { 
        const ptr = this.Alloc(1) 
        this.Free(ptr, 1)
    }
    Length() { return this.#wasm.wlen() }
    Alloc(size) { return this.#wasm.walloc(size) }
    Free(ptr, size) { return this.#wasm.wfree(ptr, size) }
    U8(ptr, size) { return new Uint8Array(this.#wasm.memory.buffer, ptr, size) }
    U32(ptr, size) { return new Uint32Array(this.#wasm.memory.buffer, ptr, size) }

    CopyAndFree(ptr, size) {
        let slice = this.U8(ptr, size).slice()
        return (this.#wasm.wfree(ptr, size), slice)
    }
    DecompressWith(buffer, transform) {
        const ptr = this.#wasm.Alloc(buffer.length)
        this.U8(ptr, buffer.length).set(buffer)
        const x = this.#wasm.decompress(ptr, buffer.length)
        if(0 === x) throw new Error('lz4: failed to decompress')

        const u8 = this.U8(x, this.Length())

        const value = transform(u8)
        return (this.Free(x, u8.length), value)
    }
    DecompressRawWith(size, buffer, transform) {
        const ptr = this.Alloc(buffer.length)
        this.U8(ptr, buffer.length).set(buffer)
        const x = this.#wasm.decompress_raw(size, ptr, buffer.length)
        if(0 === x) throw new Error('lz4: failed to decompress (raw)')

        const u8 = this.U8(x, this.Length())

        const value = transform(u8)
        return (this.Free(x, u8.length), value)
    }
    Compress(buffer) {
        const ptr = this.Alloc(buffer.length)
        this.U8(ptr, buffer.length).set(buffer)
        return this.CopyAndFree(this.#wasm.compress(ptr, buffer.length), this.Length())
    }
    CompressRaw(buffer) {
        const ptr = this.Alloc(buffer.length)
        this.U8(ptr, buffer.length).set(buffer)
        return this.CopyAndFree(this.#wasm.compress_raw(ptr, buffer.length), this.Length())
    }
}

class LZ4 {
    static #lz4Wasm

    static #_loadWasm() {
        try {
            const wasm = new LZ4Wasm(require('./lz4.wasm.simd'))
            wasm.Test()
            return this.#lz4Wasm = wasm
        } catch(e) {
            console.warn('this system is SIMD unsupported. fallback generic wasm')
            return this.#lz4Wasm = new LZ4Wasm(require('./lz4.wasm'))
        }
    }

    static Compress(buffer) {
        if(!this.#lz4Wasm) this.#_loadWasm()
        return this.#lz4Wasm.Compress(buffer)
    }
    static CompressRaw(buffer) {
        if(!this.#lz4Wasm) this.#_loadWasm()
        return this.#lz4Wasm.CompressRaw(buffer)
    }
    static Decompress(buffer) {
        if(!this.#lz4Wasm) this.#_loadWasm()
        return this.#lz4Wasm.DecompressWith(buffer, x => x.slice())
    }
    static DecompressRaw(size, buffer) {
        if(!this.#lz4Wasm) this.#_loadWasm()
        return this.#lz4Wasm.DecompressRawWith(size, buffer, x => x.slice())
    }
}

module.exports = LZ4