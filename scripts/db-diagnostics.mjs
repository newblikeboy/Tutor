// Read-only operator tooling. Never prints the URI or document contents.
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { MongoClient } from 'mongodb'
const env = { ...process.env }
for (const line of (await readFile('.env', 'utf8')).split(/\r?\n/)) {
  const match = line.match(/^([A-Z_]+)=(.*)$/)
  if (match && !env[match[1]]) env[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, '')
}
const client = new MongoClient(env.MONGODB_URI)
try {
  await client.connect()
  const result = await client.db('admin').admin().listDatabases({ nameOnly: true })
  let count = 0
  const recent = []
  const testDatabases = []
  for (const { name } of result.databases) {
    if (['admin', 'local', 'config'].includes(name)) continue
    const collections = await client.db(name).listCollections({}, { nameOnly: true }).toArray()
    count += collections.length
    if (/^tutor_(e2e_\d+|test_[a-z0-9_]+)$/.test(name) && name !== env.MONGODB_DATABASE)
      testDatabases.push({ name, collections: collections.length })
    if (/^tutor_e2e_/.test(name)) recent.push({ name, collections: collections.length })
  }
  console.log(
    JSON.stringify(
      {
        databases: result.databases.length,
        collections: count,
        recentTestDatabases: recent.sort((a, b) => a.name.localeCompare(b.name)).slice(-5),
      },
      null,
      2,
    ),
  )
  await mkdir('.local', { recursive: true })
  await writeFile(
    '.local/atlas-test-databases.json',
    JSON.stringify(
      {
        action: 'Proposed deletion of isolated automated test databases only; approval required',
        excludedDatabase: env.MONGODB_DATABASE ?? 'tutor_dev',
        databases: testDatabases,
      },
      null,
      2,
    ),
  )
  console.log(
    `Review manifest: .local/atlas-test-databases.json (${testDatabases.length} test databases, ${testDatabases.reduce((n, d) => n + d.collections, 0)} collections). No deletion performed.`,
  )
} catch (error) {
  console.error(JSON.stringify({ code: error.code, name: error.codeName }))
  process.exitCode = 1
} finally {
  await client.close()
}
