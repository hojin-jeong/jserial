#!/usr/bin/env node
/**
 * WASM 빌드 스크립트
 * Rust LZ4 모듈을 WASM으로 빌드하고 base64 JS 래퍼 파일을 생성합니다.
 */

import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// 경로 설정
const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(__dirname, '..')
const lz4Dir = resolve(projectRoot, 'src/lz4')
const wasmOutputPath = resolve(lz4Dir, 'target/wasm32-unknown-unknown/release/lz4.wasm')
const libDir = resolve(projectRoot, 'lib')
const jsOutputPath = resolve(libDir, 'lz4.wasm.js')
const jsSimdOutputPath = resolve(libDir, 'lz4.wasm.simd.js')

/**
 * 파일 크기를 읽기 좋은 형식으로 변환
 */
function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

/**
 * 쉘 명령 실행
 */
function runCommand(command, options = {}) {
  try {
    return execSync(command, { 
      stdio: 'inherit',
      ...options 
    })
  } catch (error) {
    throw new Error(`Command failed: ${command}\n${error.message}`)
  }
}

/**
 * 명령어 존재 여부 확인
 */
function commandExists(command) {
  try {
    execSync(`which ${command}`, { stdio: 'pipe' })
    return true
  } catch {
    return false
  }
}

console.log('🔨 WASM 빌드 시작\n')

try {
  // 1. 사전 요구사항 확인
  console.log('📋 1. 사전 요구사항 확인 중...')
  
  if (!commandExists('cargo')) {
    throw new Error('cargo가 설치되어 있지 않습니다. Rust를 먼저 설치해주세요.')
  }
  console.log('   ✓ cargo 확인됨')

  // wasm32-unknown-unknown 타겟 확인
  try {
    execSync('rustup target list --installed | grep -q wasm32-unknown-unknown', { stdio: 'pipe' })
    console.log('   ✓ wasm32-unknown-unknown 타겟 확인됨')
  } catch {
    console.log('   ⚠ wasm32-unknown-unknown 타겟이 없습니다. 설치 중...')
    runCommand('rustup target add wasm32-unknown-unknown')
    console.log('   ✓ wasm32-unknown-unknown 타겟 설치 완료')
  }

  // 2. WASM 빌드
  console.log('\n📦 2. WASM 빌드 중...')
  runCommand('cargo build --target wasm32-unknown-unknown --release', { cwd: lz4Dir })
  
  if (!existsSync(wasmOutputPath)) {
    throw new Error(`WASM 파일이 생성되지 않았습니다: ${wasmOutputPath}`)
  }
  console.log('   ✓ WASM 빌드 완료')

  // 3. WASM 최적화 (선택적)
  console.log('\n⚡ 3. WASM 최적화 중...')
  
  if (commandExists('wasm-opt')) {
    runCommand(`wasm-opt -O3 "${wasmOutputPath}" -o "${wasmOutputPath}"`)
    console.log('   ✓ wasm-opt 최적화 완료')
  } else {
    console.log('   ⚠ wasm-opt를 찾을 수 없습니다. 최적화를 건너뜁니다.')
    console.warn('   💡 wasm-opt 설치: npm install -g wasm-opt 또는 binaryen 패키지')
  }

  // 4-1. Non-SIMD Base64 JS 파일 생성
  console.log('\n📝 4-1. Non-SIMD Base64 JS 파일 생성 중...')
  
  const wasmBinary = readFileSync(wasmOutputPath)
  const base64String = wasmBinary.toString('base64')
  const jsContent = `module.exports = '${base64String}'\n`
  
  // lib 디렉토리 확인
  if (!existsSync(libDir)) {
    throw new Error(`lib 디렉토리가 없습니다: ${libDir}`)
  }
  
  writeFileSync(jsOutputPath, jsContent)
  console.log(`   ✓ ${jsOutputPath} (non-SIMD)`)
  // 4-2. SIMD WASM 빌드
  console.log('\n📦 4-2. SIMD WASM 빌드 중...')
  runCommand('cargo build --target wasm32-unknown-unknown --release', { 
    cwd: lz4Dir,
    env: { ...process.env, RUSTFLAGS: '-C target-feature=+simd128' }
  })
  console.log('   ✓ SIMD WASM 빌드 완료')

  // SIMD wasm-opt 최적화 (선택적)
  if (commandExists('wasm-opt')) {
    runCommand(`wasm-opt -O3 --enable-simd "${wasmOutputPath}" -o "${wasmOutputPath}"`)
    console.log('   ✓ SIMD wasm-opt 최적화 완료')
  }

  // SIMD Base64 JS 파일 생성
  const wasmSimdBinary = readFileSync(wasmOutputPath)
  const simdBase64String = wasmSimdBinary.toString('base64')
  const jsSimdContent = `module.exports = '${simdBase64String}'\n`
  writeFileSync(jsSimdOutputPath, jsSimdContent)
  console.log(`   ✓ ${jsSimdOutputPath} (SIMD)`)

  // 5. 빌드 아티팩트 정리
  console.log('\n🧹 5. 빌드 아티팩트 정리 중...')
  
  const targetDir = resolve(lz4Dir, 'target')
  const lockFile = resolve(lz4Dir, 'Cargo.lock')
  if (existsSync(targetDir)) {
    rmSync(targetDir, { recursive: true })
    console.log('   ✓ target/ 디렉토리 삭제 완료')
  }
  if (existsSync(lockFile)) {
    rmSync(lockFile)
    console.log('   ✓ Cargo.lock 삭제 완료')
  }

  // 6. 결과 보고
  console.log('\n✅ 빌드 완료!\n')
  console.log('📊 파일 크기:')
  console.log(`   WASM (non-SIMD): ${formatBytes(wasmBinary.length)}`)
  console.log(`   WASM (SIMD):     ${formatBytes(wasmSimdBinary.length)}`)
  console.log(`   Base64 JS:       ${formatBytes(Buffer.byteLength(jsContent))}`)
  console.log(`   Base64 SIMD JS:  ${formatBytes(Buffer.byteLength(jsSimdContent))}`)
  console.log(`   압축 비율: ${((Buffer.byteLength(jsContent) / wasmBinary.length) * 100).toFixed(1)}%\n`)

} catch (error) {
  console.error('\n❌ 빌드 실패:', error.message)
  process.exit(1)
}
