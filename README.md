# jserial

[![GitHub](https://img.shields.io/github/license/hojin-jeong/jserial)](https://github.com/hojin-jeong/jserial/blob/master/license.md)
[![npm](https://img.shields.io/npm/v/jserial)](https://badge.fury.io/js/jserial)

> Compressed and Fast JSON Serializer

### Using Libraries

> [msgpackr](https://github.com/kriszyp/msgpackr) — MessagePack serialization  
> [lz4_flex](https://github.com/PSeitz/lz4_flex) (Rust → WASM) — LZ4 compression  
> *WASM memory layout inspired by [@evan/wasm](https://github.com/nicolo-ribaudo/evan-wasm)*

# Quick Start

## Installation

```shell
npm install jserial --save
# or
yarn add jserial
```

## Browser Support

This library is compatible with modern browsers and module bundlers (Webpack, Rspack, Vite, etc.).
It handles platform-specific dependencies internally, so you don't need extensive polyfill configurations.

Simply import and use it in your project:

```javascript
import JsonSerializer from 'jserial';

const serializer = new JsonSerializer();
// ...
```

## Basic Usage

```javascript
const JSONSerializer = require("jserial");
const serializer = new JSONSerializer();

const json = {
  hello: "world",
};
const serialized = serializer.serialize(json);
const deserialized = serializer.deserialize(serialized);
if (deserialized instanceof Error) {
  // Deserialize Error
}
```

## Zero-Copy API

For performance-critical paths, use the zero-copy variants that avoid buffer allocation:

```javascript
const JsonSerializer = require("jserial")
const serializer = new JsonSerializer()

const data = { hello: "world", numbers: [1, 2, 3] }

// serializeView: returns Uint8Array view into WASM memory (no copy)
const view = serializer.serializeView(data)
// ⚠️ view is invalidated on next serialize call — copy if you need to keep it:
// const copy = Buffer.from(view)

// deserializeView: accepts Uint8Array directly (skips Buffer wrapping)
const result = serializer.deserializeView(view)
console.log(result) // { hello: "world", numbers: [1, 2, 3] }
```

> **When to use**: High-throughput scenarios where you immediately consume the serialized data (e.g., writing to a socket, comparing buffers). The returned view shares WASM memory and is overwritten on the next `serialize`/`serializeView` call.

## Msgpack Custom Extension
```javascript
const JSONSerializer = require("jserial");
class CustomClass {};
JSONSerializer.addExtension({
    class: CustomClass,
    type: 1, // 1 ~ 100
    read(instance) {
        return instance.customData;
    },
    write(data) {
        const customClass = new CustomClass();
        customClass.customData = data;
        return customClass;
    }
});
```

## Using Msgpackr Dictionary

```javascript
const JSONSerializer = require("jserial");
const serializer = new JSONSerializer("namespace");
// or
const serializer = new JSONSerializer({ namespace: "namespace" });

const json = {
  hello: "world",
};
const serialized = serializer.serialize(json);
const deserialized = serializer.deserialize(serialized);
```

## Stream Framing

For TCP sockets, WebSockets, or other stream-based communication, use `FrameStream` to handle message framing automatically.

### Node.js (Native Streams)

```javascript
const JsonSerializer = require("jserial");
const net = require("net");

const serializer = new JsonSerializer();
const socket = net.connect({ port: 8080 });

// Create FrameStream from duplex stream
const frame = JsonSerializer.createFrameStream(serializer, socket);

// Read a message
const message = await frame.read();

// Write a message
await frame.write({ hello: "world" });

// Write multiple messages efficiently (batch)
await frame.writeV([
  { id: 1, data: "first" },
  { id: 2, data: "second" },
  { id: 3, data: "third" },
]);
```

### Browser (WhatWG Streams)

```javascript
import JsonSerializer from "jserial";

const serializer = new JsonSerializer();

// For WebTransport, fetch streams, etc.
const frame = JsonSerializer.createFrameStream(serializer, readable, writable);

// Same API as Node.js
const message = await frame.read();
await frame.write({ hello: "world" });
await frame.writeV([obj1, obj2, obj3]);

// Clean up
frame.close();
```

### API Reference

| Method | Description |
| :--- | :--- |
| `JsonSerializer.createFrameStream(serializer, stream)` | Create FrameStream for Node.js duplex stream |
| `JsonSerializer.createFrameStream(serializer, readable, writable)` | Create FrameStream for Browser streams |
| `frame.read()` | Read next deserialized message (Promise) |
| `frame.readV(count)` | Read multiple messages in batch - more efficient when buffered (Promise<Array>) **Node.js only** |
| `frame.write(data)` | Write single message (Promise) |
| `frame.writeV(dataArray)` | Write multiple messages in batch - more efficient (Promise) |
| `frame.unwrap()` | Get underlying stream (Node.js only) |
| `frame.close()` | Release stream resources (Browser only) |
| `serializeView(data)` | Zero-copy serialize — returns Uint8Array view into WASM memory |
| `deserializeView(buffer)` | Deserialize — accepts Uint8Array directly, returns result without output buffer allocation |

## Benchmark

```bash
Node Version: v24.11.1
Benchmark JSON Size: ~471,357 bytes
```

| Library              |      Size |   Ratio |  Serialize | Deserialize |
| :------------------- | --------: | ------: | ---------: | ----------: |
| JSON.stringify       | 471,357 B | 100.00% |    2.18 ms |     1.74 ms |
| Msgpackr             | 424,399 B |  90.04% |    1.06 ms |     1.58 ms |
| JSON + Gzip          |  21,220 B |   4.50% |    4.38 ms |     2.14 ms |
| JSON + Brotli        |  13,564 B |   2.88% |  971.79 ms |     2.22 ms |
| JSON + Zstd (Native) |  17,917 B |   3.80% |    2.10 ms |     1.95 ms |
| JSON + Inflate       |  21,208 B |   4.50% |    3.98 ms |     1.92 ms |
| **jserial**          |  24,428 B |   5.18% |    1.03 ms |     0.76 ms |
| **jserial (view)**   |  24,428 B |   5.18% |    0.95 ms | **0.04 ms** |

### Summary
*   **Compression Ratio**: Brotli (2.88%) > Zstd (3.80%) > Gzip/Inflate (4.50%) > **jserial (5.18%)**
    *   `jserial` provides excellent compression close to Gzip level while being dramatically faster.
*   **Deserialization Speed**: **jserial view (0.04 ms)** > jserial (0.76 ms) > Msgpackr (1.58 ms) > JSON.parse (1.74 ms)
    *   `jserial (view)` is **43x faster** than JSON.parse (0.04 ms vs 1.74 ms) — skips output buffer allocation by returning a WASM memory view directly.
*   **Serialization Speed**: **jserial view (0.95 ms)** > jserial (1.03 ms) > Msgpackr (1.06 ms) > JSON.stringify (2.18 ms)
    *   `jserial (view)` beats Msgpackr and JSON.stringify while achieving excellent compression (~5.18%).

## BlockFrameStream

For high-throughput scenarios where wire bandwidth matters, `BlockFrameStream` batches multiple messages into a single LZ4-compressed block using msgpackr sequential structures. This achieves dramatically smaller wire sizes at the cost of a small buffering delay.

**Wire format**: `[4B decompressed_len][4B compressed_len][LZ4(sequential msgpack...)]`

```javascript
const JsonSerializer = require("jserial");
const net = require("net");

const socket = net.connect({ port: 8080 });

const frame = JsonSerializer.createBlockFrameStream(socket, {
  blockSize: 64 * 1024,  // flush when buffer reaches 64KB (default)
  flushInterval: 10,      // auto-flush after 10ms idle (default). 0 = disabled.
  packrOptions: {},        // additional msgpackr options (optional)
});

// Write — buffered until blockSize or flushInterval
await frame.write({ id: 1, action: "update" });

// Batch write (most efficient)
await frame.writeV([{ id: 2 }, { id: 3 }]);

// Force flush
await frame.flush();

// Batch read — up to 11x faster than read()×N
const messages = await frame.readV(100);

frame.destroy();
```

### Configuration

| Option | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `blockSize` | `number` | `65536` | Flush threshold in bytes. Smaller = lower latency, less compression. |
| `flushInterval` | `number` | `10` | Auto-flush idle timeout (ms). `0` disables timer flushing. |
| `packrOptions` | `object` | `{}` | Options forwarded to msgpackr `Packr`/`Unpackr`. |

### BlockFrameStream vs FrameStream (1000 msgs)

| Metric | FrameStream | BlockFrameStream |
| :--- | :--- | :--- |
| Write (1000 msgs) | 14.59 ms | **12.37 ms** (1.18x faster) |
| `readV(N)` | 0.24 ms | **0.17 ms** (1.44x faster) |
| `read()` individual | 1.00 ms | 2.07 ms (use `readV`) |
| Wire size per message | 225.6 B | **27.9 B** (87.6% smaller) |

> **Tip**: Use `readV(count)` with BlockFrameStream for best performance. Individual `read()` waits for the entire block to decompress.

### BlockFrameStream API

| Method | Description |
| :--- | :--- |
| `JsonSerializer.createBlockFrameStream(stream, options)` | Create a BlockFrameStream |
| `frame.write(data)` | Write one message — buffered (Promise) |
| `frame.writeV(dataArray)` | Write multiple messages in batch (Promise) |
| `frame.read()` | Read next message (Promise) |
| `frame.readV(count)` | Read `count` messages in one batch — **12x faster** than `read()×N` (Promise\<Array\>) |
| `frame.flush()` | Force compress and send buffered messages (Promise) |
| `frame.destroy()` | Release WASM buffers and stream resources |
| `frame.unwrap()` | Return underlying Node.js stream |
