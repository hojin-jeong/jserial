# jserial

[![GitHub](https://img.shields.io/github/license/hojin-jeong/jserial)](https://github.com/hojin-jeong/jserial/blob/master/license.md)
[![npm](https://img.shields.io/npm/v/jserial)](https://badge.fury.io/js/jserial)

> Compressed and Fast JSON Serializer

### Using Libraries

> msgpackr, lz4

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

## with HighCompression

```javascript
const JSONSerializer = require("jserial");
const serializer = new JSONSerializer();

const json = {
  hello: "world",
};
const serialized = serializer.serializeHC(json);
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
Node Version: v14.17.0
Repeated 50 times
-----------------------Benchmark JSON Size: 488,002 bytes-----------------------
JSON.stringify                / CompressedSize:  488,002bytes (100.00%), Serialize:   1.86 ms, Deserialize:  1.82 ms
@msgpack/msgpack              / CompressedSize:  424,096bytes  (86.90%), Serialize:    3.3 ms, Deserialize:  5.02 ms
msgpack5                      / CompressedSize:  424,096bytes  (86.90%), Serialize:  21.32 ms, Deserialize: 15.94 ms
Msgpackr                      / CompressedSize:  426,579bytes  (87.41%), Serialize:   1.92 ms, Deserialize:  3.24 ms
JSON.stringify with Snappy    / CompressedSize:  155,540bytes  (31.87%), Serialize:   4.18 ms, Deserialize:  4.04 ms
Msgpackr with Snappy          / CompressedSize:  150,904bytes  (30.92%), Serialize:   2.68 ms, Deserialize:  3.62 ms
JSON.stringify with Brotli    / CompressedSize:   15,537bytes   (3.18%), Serialize: 132.34 ms, Deserialize:  4.56 ms
JSON.stringify with Inflate   / CompressedSize:   98,058bytes  (20.09%), Serialize:  11.62 ms, Deserialize:  4.52 ms
JSON.stringify with Gzip      / CompressedSize:   98,070bytes  (20.10%), Serialize:   11.6 ms, Deserialize:  4.56 ms
CBOR                          / CompressedSize:  423,927bytes  (86.87%), Serialize:  27.48 ms, Deserialize: 62.64 ms
Encodr MSGPACK                / CompressedSize:  424,096bytes  (86.90%), Serialize:   6.46 ms, Deserialize: 13.66 ms
Encodr JSON                   / CompressedSize:  488,002bytes (100.00%), Serialize:   1.88 ms, Deserialize:  1.78 ms
jserial                       / CompressedSize:   28,564bytes   (5.85%), Serialize:      2 ms, Deserialize:  1.36 ms
jserial - with comp           / CompressedSize:   24,466bytes   (5.01%), Serialize:   2.02 ms, Deserialize:  0.66 ms
jserial simple - without comp / CompressedSize:   28,576bytes   (5.86%), Serialize:   1.74 ms, Deserialize:  1.48 ms
jserial simple - with comp    / CompressedSize:   24,478bytes   (5.02%), Serialize:   2.34 ms, Deserialize:  1.42 ms
--------------------------------------------------------------------------------
```
