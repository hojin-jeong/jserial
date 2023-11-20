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
Node Version: v20.9.0
Repeated 50 times
-----------------------Benchmark JSON Size: 488,002 bytes-----------------------
JSON.stringify                / CompressedSize:  488,002bytes (100.00%), Serialize:   1.14 ms, Deserialize:  1.08 ms
@msgpack/msgpack              / CompressedSize:  424,096bytes  (86.90%), Serialize:   2.02 ms, Deserialize:  2.76 ms
msgpack5                      / CompressedSize:  424,096bytes  (86.90%), Serialize:  23.64 ms, Deserialize:   9.2 ms
Msgpackr                      / CompressedSize:  426,578bytes  (87.41%), Serialize:   1.26 ms, Deserialize:  1.84 ms
JSON.stringify with Snappy    / CompressedSize:  155,540bytes  (31.87%), Serialize:    2.5 ms, Deserialize:   1.9 ms
Msgpackr with Snappy          / CompressedSize:  150,903bytes  (30.92%), Serialize:   1.52 ms, Deserialize:  1.88 ms
JSON.stringify with Brotli    / CompressedSize:   15,537bytes   (3.18%), Serialize:  90.16 ms, Deserialize:  2.64 ms
JSON.stringify with Inflate   / CompressedSize:   98,075bytes  (20.10%), Serialize:   8.64 ms, Deserialize:  2.72 ms
JSON.stringify with Gzip      / CompressedSize:   98,087bytes  (20.10%), Serialize:   8.74 ms, Deserialize:   2.6 ms
CBOR                          / CompressedSize:  423,927bytes  (86.87%), Serialize:  16.44 ms, Deserialize: 16.68 ms
Encodr MSGPACK                / CompressedSize:  424,096bytes  (86.90%), Serialize:   2.92 ms, Deserialize:  6.42 ms
Encodr JSON                   / CompressedSize:  488,002bytes (100.00%), Serialize:   1.24 ms, Deserialize:   1.1 ms
jserial                       / CompressedSize:   49,235bytes  (10.09%), Serialize:   1.14 ms, Deserialize:  0.58 ms
jserial simple                / CompressedSize:  122,747bytes  (25.15%), Serialize:   1.22 ms, Deserialize:  0.56 ms
--------------------------------------------------------------------------------
```
