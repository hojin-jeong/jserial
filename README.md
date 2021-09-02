
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
const JSONSerializer = require('jserial')
const serializer = new JSONSerializer

const json = {
    hello: 'world'
}
const serialized = serializer.serialize(json)
const deserialized = serializer.deserialize(serialized)
if(deserialized instanceof Error) {
    // Deserialize Error
}
```

## Using Msgpackr Dictionary
```javascript
const JSONSerializer = require('jserial')
const serializer = new JSONSerializer('namespace')
// or
const serializer = new JSONSerializer({ namespace: 'namespace' })

const json = {
    hello: 'world'
}
const serialized = serializer.serialize(json)
const deserialized = serializer.deserialize(serialized)
```

## Benchmark
```bash
-----------------------Benchmark JSON Size: 488,002 bytes-----------------------
JSON.stringify                / CompressedSize:  488,002bytes (100.00%), Serialize:   5 ms, Deserialize:   5 ms
@msgpack/msgpack              / CompressedSize:  424,096bytes  (86.90%), Serialize:  54 ms, Deserialize:  73 ms
msgpack5                      / CompressedSize:  424,096bytes  (86.90%), Serialize: 172 ms, Deserialize:  91 ms
Msgpackr                      / CompressedSize:  426,579bytes  (87.41%), Serialize:  73 ms, Deserialize:  21 ms
JSON.stringify with Snappy    / CompressedSize:  155,540bytes  (31.87%), Serialize:  10 ms, Deserialize:  10 ms
Msgpackr with Snappy          / CompressedSize:  150,904bytes  (30.92%), Serialize:  51 ms, Deserialize:  19 ms
JSON.stringify with Brotli    / CompressedSize:   15,537bytes   (3.18%), Serialize: 341 ms, Deserialize:  11 ms
JSON.stringify with Inflate   / CompressedSize:   98,058bytes  (20.09%), Serialize:  30 ms, Deserialize:  11 ms
JSON.stringify with Gzip      / CompressedSize:   98,070bytes  (20.10%), Serialize:  29 ms, Deserialize:  12 ms
CBOR                          / CompressedSize:  423,927bytes  (86.87%), Serialize: 175 ms, Deserialize: 213 ms
Encodr MSGPACK                / CompressedSize:  424,096bytes  (86.90%), Serialize:  41 ms, Deserialize:  52 ms
Encodr JSON                   / CompressedSize:  488,002bytes (100.00%), Serialize:   7 ms, Deserialize:   8 ms
jserial                       / CompressedSize:   28,565bytes   (5.85%), Serialize:  43 ms, Deserialize:  14 ms
--------------------------------------------------------------------------------
```