'use strict'

const assert = require('assert')
const JsonSerializer = require('../lib/jserial')

const serializer = new JsonSerializer()

const sizes = [61441, 953552, 965536, 1040385, 1908737, 2084865, 3813377, 4173825]

for (const size of sizes) {
    const payload = Buffer.alloc(size, 0x61)
    const encoded = serializer.serialize(payload)

    assert.ok(!(encoded instanceof Error), `serialize failed for size ${size}: ${encoded}`)

    const decoded = serializer.deserialize(encoded)

    assert.ok(decoded instanceof Buffer, `deserialized is not Buffer for size ${size}`)
    assert.ok(decoded.equals(payload), `payload mismatch for size ${size}`)

    console.log(`PASS size=${size}`)
}

if (serializer.destroy) {
    serializer.destroy()
}

console.log('SUCCESS')
