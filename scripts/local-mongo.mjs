// Optional development/test process launcher. The app API is exclusively Go.
// Runs a real MongoDB replica set using WiredTiger on disk; never an app fallback.
import { MongoMemoryReplSet } from 'mongodb-memory-server-core'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
if (process.env.APP_ENV === 'production')
  throw new Error('Local test database is prohibited in production')
const dbPath = resolve('.local/mongo')
await mkdir(dbPath, { recursive: true })
const rs = await MongoMemoryReplSet.create({
  binary: { version: '8.2.6' },
  instanceOpts: [{ port: 27017, dbPath }],
  replSet: { name: 'rs0', count: 1, storageEngine: 'wiredTiger', ip: '127.0.0.1' },
})
console.log(
  'Local development MongoDB replica set ready at 127.0.0.1:27017. Data persists in .local/mongo.',
)
let closing = false
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, async () => {
    if (closing) return
    closing = true
    await rs.stop({ doCleanup: false, force: false })
    process.exit(0)
  })
setInterval(() => {}, 60_000)
