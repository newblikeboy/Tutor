// Read-only release check. Never print secret values or matching file contents.
import { execFileSync } from 'node:child_process'
import { readFile, readdir } from 'node:fs/promises'
import { resolve, relative, join } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const git = (args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' })
const tracked = git(['ls-files', '-z']).split('\0').filter(Boolean)
const envFiles = tracked.filter(
  (name) => /(^|\/)\.env(?:\.|$)/.test(name) && !name.endsWith('.env.example'),
)
const findings = envFiles.map((file) => ({ file, check: 'private environment file tracked' }))
let privateEnv = ''
try {
  privateEnv = await readFile(join(root, '.env'), 'utf8')
} catch (error) {
  if (error.code !== 'ENOENT') throw new Error('Private configuration could not be read')
}
const sensitive = new Map()
for (const line of privateEnv.replace(/^\uFEFF/, '').split(/\r?\n/)) {
  const match = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/)
  if (!match || !/(?:URI|SECRET|PASSWORD|TOKEN|ACCESS_KEY|PRIVATE_KEY)$/.test(match[1])) continue
  const value = match[2].replace(/^(['"])(.*)\1$/, '$2')
  if (value.length >= 12) sensitive.set(match[1], value)
}
const files = new Set(
  git(['ls-files', '-z', '--cached', '--others', '--exclude-standard']).split('\0').filter(Boolean),
)
async function visit(dir) {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch (error) {
    if (error.code === 'ENOENT') return
    throw new Error('Build artifacts could not be inspected')
  }
  for (const entry of entries) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) await visit(path)
    else if (entry.isFile()) files.add(relative(root, path))
  }
}
await visit(join(root, 'apps/web/dist'))
let inspected = 0
for (const file of files) {
  // The environment file itself is checked for tracking above, never echoed/scanned.
  if (envFiles.includes(file)) continue
  let data
  try {
    data = await readFile(join(root, file))
  } catch (error) {
    if (error.code === 'ENOENT') continue // Deleted tracked files have no publishable content.
    throw new Error('A source file could not be inspected')
  }
  if (data.includes(0)) continue
  const text = data.toString('utf8')
  inspected++
  for (const [key, value] of sensitive) {
    if (text.includes(value)) findings.push({ file, check: `contains private ${key} value` })
  }
}
console.log(
  JSON.stringify(
    { inspectedTextFiles: inspected, privateValuesChecked: sensitive.size, findings },
    null,
    2,
  ),
)
if (findings.length) process.exitCode = 1
if (!privateEnv)
  console.log(
    'No local .env: only environment-file tracking was checked. This is not a general secret scanner.',
  )
