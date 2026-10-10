// Fixture tooling only: seed a known email challenge in the isolated E2E database.
// Production signup still verifies and consumes it through the real Go endpoint.
import type { APIRequestContext } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { createDecipheriv, createHmac, randomBytes } from 'node:crypto'
const { MongoClient } = createRequire(import.meta.url)('mongodb') as typeof import('mongodb')

export async function signupDatabase() {
  const runtime = JSON.parse(await readFile('.local/e2e-runtime.json', 'utf8'))
  const uri = process.env.MONGODB_URI ?? ''
  if (
    !/^tutor_e2e_\d+$/.test(runtime.databaseName) ||
    !/^mongodb:\/\/(127\.0\.0\.1|localhost):/.test(uri)
  ) {
    throw new Error('Signup fixtures require the explicit isolated local replica set')
  }
  const client = new MongoClient(uri)
  await client.connect()
  return { client, database: client.db(runtime.databaseName) }
}

export async function verifiedSignup(
  request: APIRequestContext,
  options: NonNullable<Parameters<APIRequestContext['post']>[1]>,
) {
  const input = options.data as { email: string }
  const { client, database } = await signupDatabase()
  const id = randomBytes(32).toString('hex')
  const code = '483729'
  const guardId = `fixture:${id}`
  const expiresAt = new Date(Date.now() + 600_000)
  const codeHash = createHmac('sha256', Buffer.alloc(32))
    .update(`${id}\0signup\0${code}`)
    .digest('hex')
  try {
    await database.collection('email_challenges').insertMany([
      {
        _id: guardId as never,
        userId: '',
        purpose: 'guard',
        codeHash: '',
        credentialHash: '',
        expiresAt,
        attempts: 0,
        currentId: id,
      },
      {
        _id: id as never,
        userId: '',
        email: input.email.trim().toLowerCase(),
        purpose: 'signup',
        codeHash,
        credentialHash: '',
        expiresAt,
        attempts: 0,
        consumed: false,
        guardId,
      },
    ])
    return await request.post('/api/v1/auth/signup', {
      ...options,
      data: { ...input, challengeId: id, code },
    })
  } finally {
    await client.close()
  }
}

export async function pendingEmailCode(email: string, purpose: string) {
  const { client, database } = await signupDatabase()
  try {
    const challenge = await database
      .collection('email_challenges')
      .findOne({ email: email.trim().toLowerCase(), purpose }, { sort: { expiresAt: -1 } })
    if (!challenge) throw new Error('Expected pending signup challenge')
    const job = await database
      .collection('outbox')
      .findOne({ _id: `email-code:${challenge._id}` as never })
    if (!job?.payload.encryptedCode) throw new Error('Expected encrypted fixture email code')
    const encrypted = Buffer.from(job.payload.encryptedCode, 'base64')
    const decrypt = createDecipheriv('aes-256-gcm', Buffer.alloc(32), encrypted.subarray(0, 12))
    decrypt.setAAD(Buffer.from(String(challenge._id)))
    decrypt.setAuthTag(encrypted.subarray(-16))
    return Buffer.concat([decrypt.update(encrypted.subarray(12, -16)), decrypt.final()]).toString()
  } finally {
    await client.close()
  }
}
