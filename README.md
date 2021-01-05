
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
JSON.stringify                : CompressedSize: 488,002 bytes (100.00%), Serialize: 4 ms, Deserialize: 4 ms
@msgpack/msgpack              : CompressedSize: 424,096 bytes (86.90%), Serialize: 35 ms, Deserialize: 43 ms
msgpack5                      : CompressedSize: 424,096 bytes (86.90%), Serialize: 110 ms, Deserialize: 56 ms
Msgpackr                      : CompressedSize: 426,579 bytes (87.41%), Serialize: 36 ms, Deserialize: 15 ms
JSON.stringify with Snappy    : CompressedSize: 155,540 bytes (31.87%), Serialize: 8 ms, Deserialize: 6 ms
Msgpackr with Snappy          : CompressedSize: 150,904 bytes (30.92%), Serialize: 24 ms, Deserialize: 12 ms
JSON.stringify with Brotli    : CompressedSize: 15,537 bytes (3.18%), Serialize: 208 ms, Deserialize: 8 ms
JSON.stringify with Inflate   : CompressedSize: 98,058 bytes (20.09%), Serialize: 17 ms, Deserialize: 7 ms
JSON.stringify with Gzip      : CompressedSize: 98,070 bytes (20.10%), Serialize: 17 ms, Deserialize: 8 ms
CBOR                          : CompressedSize: 423,927 bytes (86.87%), Serialize: 125 ms, Deserialize: 121 ms
Encodr MSGPACK                : CompressedSize: 424,096 bytes (86.90%), Serialize: 24 ms, Deserialize: 32 ms
Encodr JSON                   : CompressedSize: 488,002 bytes (100.00%), Serialize: 3 ms, Deserialize: 4 ms
jserial                       : CompressedSize: 28,561 bytes (5.85%), Serialize: 21 ms, Deserialize: 8 ms
--------------------------------------------------------------------------------
```