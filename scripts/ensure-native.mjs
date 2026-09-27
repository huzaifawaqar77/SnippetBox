#!/usr/bin/env node
/**
 * Sanity check for the native SQLite binding.
 *
 * `better-sqlite3` v13 is built with Node-API and ships per-platform prebuilds,
 * so the same binary loads in both the system Node (used by Vitest) and
 * Electron. There is nothing to rebuild — this script simply proves the binding
 * loads in the runtime we are about to use and prints an actionable message if
 * it does not.
 *
 * Usage: node scripts/ensure-native.mjs <node|electron>
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const target = process.argv[2] === 'electron' ? 'electron' : 'node'

const ok = (message) => console.log(`\u001b[36m[native]\u001b[0m ${message}`)
const fail = (message) => console.error(`\u001b[31m[native]\u001b[0m ${message}`)

if (!existsSync(resolve(root, 'node_modules/better-sqlite3'))) {
  fail('better-sqlite3 is not installed. Run `npm install` first.')
  process.exit(1)
}

function electronBinary() {
  if (!existsSync(resolve(root, 'node_modules/electron/path.txt'))) return null
  const relative = readFileSync(resolve(root, 'node_modules/electron/path.txt'), 'utf8').trim()
  const binary = resolve(root, 'node_modules/electron/dist', relative)
  return existsSync(binary) ? binary : null
}

let command = process.execPath
let env = process.env

if (target === 'electron') {
  const binary = electronBinary()
  if (!binary) {
    fail('The Electron binary is missing. Run `node node_modules/electron/install.js`.')
    process.exit(1)
  }
  command = binary
  env = { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
}

const probe = spawnSync(command, ['-e', "require('better-sqlite3');process.stdout.write('ok')"], {
  cwd: root,
  env,
  encoding: 'utf8',
  timeout: 120000
})

if (probe.status === 0 && (probe.stdout ?? '').includes('ok')) {
  ok(`better-sqlite3 loads in ${target}.`)
  process.exit(0)
}

fail(`better-sqlite3 could not be loaded in ${target}.`)
if (probe.stderr?.trim()) fail(probe.stderr.trim().split('\n')[0])
fail('Reinstall it with `npm install better-sqlite3`.')
process.exit(1)
