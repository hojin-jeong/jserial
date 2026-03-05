# jserial

[![GitHub](https://img.shields.io/github/license/hojin-jeong/jserial)](https://github.com/hojin-jeong/jserial/blob/master/license.md)
[![npm](https://img.shields.io/npm/v/jserial)](https://badge.fury.io/js/jserial)

> Compressed and Fast JSON Serializer

### Using Libraries

> msgpackr, @evan/wasm/lz4

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
| `frame.write(data)` | Write single message (Promise) |
| `frame.writeV(dataArray)` | Write multiple messages in batch - more efficient (Promise) |
| `frame.unwrap()` | Get underlying stream (Node.js only) |
| `frame.close()` | Release stream resources (Browser only) |
| `serializeView(data)` | Zero-copy serialize — returns Uint8Array view into WASM memory |
| `deserializeView(buffer)` | Zero-copy deserialize — accepts Uint8Array directly, skips Buffer wrapping |

## Benchmark

```bash
Node Version: v24.11.1
Benchmark JSON Size: 471,310 bytes
Repeated 50 times
--------------------------------------------------------------------------------
| Library | Size | Ratio | Serialize | Deserialize |
| :--- | ---: | ---: | ---: | ---: |
| JSON.stringify | 471,310 B | 100.00% | 1.89 ms | 1.66 ms |
| @msgpack/msgpack | 420,399 B | 89.20% | 2.87 ms | 1.67 ms |
| Msgpackr | 424,399 B | 90.05% | 0.94 ms | 1.33 ms |
| JSON + Gzip | 21,123 B | 4.48% | 4.15 ms | 2.13 ms |
| JSON + Brotli | 13,444 B | 2.85% | 951.27 ms | 2.16 ms |
| JSON + Zstd (Native) | 17,862 B | 3.79% | 1.86 ms | 1.99 ms |
| JSON + Inflate | 21,111 B | 4.48% | 3.94 ms | 1.93 ms |
| **jserial** | **24,149 B** | **5.12%** | **0.97 ms** | **0.87 ms** |
| **jserial (view)** | **24,149 B** | **5.12%** | **0.86 ms** | **0.04 ms** |
```

### Summary
*   **Compression Ratio**: Brotli (2.85%) > Zstd (3.79%) > Gzip/Inflate (4.48%) > **jserial (5.12%)**
    *   `jserial` provides excellent compression close to Gzip level while being dramatically faster.
*   **Deserialization Speed**: **jserial view (0.04 ms)** > jserial (0.87 ms) > Msgpackr (1.33 ms) > JSON.parse (1.66 ms)
    *   `jserial (view)` is **41x faster** than JSON.parse — zero-copy deserialization eliminates buffer allocation entirely.
*   **Serialization Speed**: **jserial view (0.86 ms)** > Msgpackr (0.94 ms) > jserial (0.97 ms) > JSON.stringify (1.89 ms)
    *   `jserial (view)` is the fastest serializer, beating even Msgpackr while achieving 19x better compression.
