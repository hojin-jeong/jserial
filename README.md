
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
Node Version: v14.17.0
-----------------------Benchmark JSON Size: 488,002 bytes-----------------------
JSON.stringify                / CompressedSize:  488,002bytes (100.00%), Serialize:   5 ms, Deserialize:   6 ms
@msgpack/msgpack              / CompressedSize:  424,096bytes  (86.90%), Serialize:  62 ms, Deserialize:  77 ms
msgpack5                      / CompressedSize:  424,096bytes  (86.90%), Serialize: 175 ms, Deserialize:  97 ms
Msgpackr                      / CompressedSize:  426,579bytes  (87.41%), Serialize:  86 ms, Deserialize:  22 ms
JSON.stringify with Snappy    / CompressedSize:  155,540bytes  (31.87%), Serialize:  12 ms, Deserialize:  11 ms
Msgpackr with Snappy          / CompressedSize:  150,904bytes  (30.92%), Serialize:  54 ms, Deserialize:  23 ms
JSON.stringify with Brotli    / CompressedSize:   15,537bytes   (3.18%), Serialize: 364 ms, Deserialize:  12 ms
JSON.stringify with Inflate   / CompressedSize:   98,058bytes  (20.09%), Serialize:  30 ms, Deserialize:  12 ms
JSON.stringify with Gzip      / CompressedSize:   98,070bytes  (20.10%), Serialize:  30 ms, Deserialize:  12 ms
CBOR                          / CompressedSize:  423,927bytes  (86.87%), Serialize: 198 ms, Deserialize: 223 ms
Encodr MSGPACK                / CompressedSize:  424,096bytes  (86.90%), Serialize:  43 ms, Deserialize:  53 ms
Encodr JSON                   / CompressedSize:  488,002bytes (100.00%), Serialize:   6 ms, Deserialize:   7 ms
jserial                       / CompressedSize:   28,564bytes   (5.85%), Serialize:  44 ms, Deserialize:  14 ms
--------------------------------------------------------------------------------
```