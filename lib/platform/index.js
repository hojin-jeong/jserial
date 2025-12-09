const Fs = require('fs')
const Os = require('os')
const Path = require('path')
const { attempt } = require('../utils/common')

const getCacheStoragePath = (...optionalPaths) => {
  const cacheStorageList = [
    '/dev/shm',
    '/run/shm',
    Os.tmpdir()
  ]

  let tmpDir
  for (const dir of cacheStorageList) {
    if (Fs.existsSync(dir)) {
      tmpDir = dir
      break
    }
  }
  
  if (!tmpDir) tmpDir = Os.tmpdir()

  const targetDir = Path.join(tmpDir, 'jserial', ...optionalPaths.filter(p => !!p).map(String))
  const dirPath = Path.dirname(targetDir)

  if (!Fs.existsSync(dirPath)) {
    attempt(() => Fs.mkdirSync(dirPath, { recursive: true }))
  }
  return targetDir
}

const loadStructures = (namespace) => {
  const path = getCacheStoragePath(namespace, 'SharedStructures.data')
  if (Fs.existsSync(path)) {
    const content = attempt(() => Fs.readFileSync(path))
    if (content instanceof Error) return null
    return content
  }
  return null
}

const saveStructures = (namespace, data) => {
  const path = getCacheStoragePath(namespace, 'SharedStructures.data')
  attempt(() => Fs.writeFileSync(path, data))
}

module.exports = {
  loadStructures,
  saveStructures
}
