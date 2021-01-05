
const FS = require('fs')
const OS = require('os')
const PATH = require('path')

const getCacheStoragePath = (...optionalPaths) => {
    const cacheStorageList = [
        '/dev/shm',
        '/run/shm',
        OS.tmpdir()
    ]

    let tmpDir
    for(const dir of cacheStorageList) {
        if(FS.existsSync(dir)) {
            tmpDir = dir
            break
        }
    }
    tmpDir = PATH.join(tmpDir, 'jserial')
    if(!FS.existsSync(tmpDir)) FS.mkdirSync(tmpDir, {recursive: true})
    return PATH.join(tmpDir, ...optionalPaths.filter(path => path).map(path => String(path)))
}

module.exports = {
    getCacheStoragePath
}