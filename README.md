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

## Using simple En-Decoding (simple internal logic, sometimes fast than serialize)

```javascript
const JSONSerializer = require("jserial");
const serializer = new JSONSerializer();

const json = {
  hello: "world",
};
const serialized = serializer.serializeSimple(json);
const deserialized = serializer.deserializeSimple(serialized);
```

## Benchmark

```bash
Node Version: v24.11.1
Benchmark JSON Size: 471,349 bytes
Repeated 50 times
--------------------------------------------------------------------------------
| Library | Size | Ratio | Serialize | Deserialize |
| :--- | ---: | ---: | ---: | ---: |
| JSON.stringify | 471,349 B | 100.00% | 1.84 ms | 1.61 ms |
| @msgpack/msgpack | 420,399 B | 89.19% | 2.47 ms | 1.53 ms |
| msgpack5 | 420,399 B | 89.19% | 13.54 ms | 7.70 ms |
| msgpack-lite | 420,399 B | 89.19% | 2.21 ms | 6.38 ms |
| Msgpackr | 424,399 B | 90.04% | 0.86 ms | 1.28 ms |
| JSON + Snappy | 51,467 B | 10.92% | 2.01 ms | 1.65 ms |
| Msgpackr + Snappy | 40,083 B | 8.50% | 0.89 ms | 1.43 ms |
| JSON + Gzip | 21,120 B | 4.48% | 4.00 ms | 2.23 ms |
| JSON + Brotli | 13,461 B | 2.86% | 945.98 ms | 2.06 ms |
| JSON + Zstd (Native) | 17,823 B | 3.78% | 1.93 ms | 1.87 ms |
| JSON + Inflate | 21,108 B | 4.48% | 4.03 ms | 1.76 ms |
| Encodr MSGPACK | 420,399 B | 89.19% | 2.01 ms | 6.34 ms |
| **jserial** | **27,921 B** | **5.92%** | **1.59 ms** | **0.53 ms** |
| **jserial simple** | **28,749 B** | **6.10%** | **1.56 ms** | **0.48 ms** |
```

### Summary
*   **Compression Ratio**: Brotli (2.86%) > Zstd (3.78%) > Gzip (4.48%) > **jserial (5.92%)** > Snappy (10.92%)
    *   `jserial` provides excellent compression, outperforming Snappy significantly and coming close to Gzip.
*   **Deserialization Speed**: **jserial (0.53 ms)** > Msgpackr (1.28 ms) > Zstd (1.87 ms) > Gzip (2.23 ms)
    *   `jserial` is **3x faster** than Zstd/Gzip and **2.4x faster** than Msgpackr in reading data.
*   **Serialization Speed**: Msgpackr (0.86 ms) > **jserial (1.59 ms)** > Zstd (1.93 ms) > Gzip (4.00 ms)
    *   `jserial` offers balanced write performance, faster than native Zstd and Gzip.

