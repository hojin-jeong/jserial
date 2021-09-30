
const FS = require('fs')
const OS = require('os')
const PATH = require('path')

class Utility {
    static getCacheStoragePath(...optionalPaths) {
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
    static getUIntBound(integer) {
        let i = integer
        let counter = 0
        while(i !== 0) {
            i >>= 8
            counter++
        }
        return counter
    }
}

module.exports = Utility