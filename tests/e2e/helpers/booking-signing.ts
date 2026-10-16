import type { APIRequestContext } from '@playwright/test'
import { createDecipheriv } from 'node:crypto'
import { signupDatabase } from '../signup-fixture'

// Actual signing endpoints; only the OTP delivery is read from the isolated fixture outbox.
export async function acceptFixtureBooking(request: APIRequestContext, id: string) {
  const me = await (await request.get('/api/v1/me')).json()
  const headers = { Origin: 'http://127.0.0.1:5174', 'X-CSRF-Token': me.csrf }
  const { enrollment } = await (await request.get(`/api/v1/enrollments/${id}`)).json()
  const requested = await request.post(`/api/v1/enrollments/${id}/signing-code`, {
    headers,
    data: {
      version: enrollment.version,
      documentHash: enrollment.tutorAgreement.documentHash,
      accepted: true,
    },
  })
  if (requested.status() !== 202)
    throw new Error(`Fixture signing code failed: ${requested.status()}`)
  const { challengeId } = await requested.json()
  const { client, database } = await signupDatabase()
  let code: string
  try {
    const job = await database
      .collection('outbox')
      .findOne({ _id: `email-code:${challengeId}` as never })
    if (!job?.payload.encryptedCode) throw new Error('Missing encrypted signing fixture')
    const encrypted = Buffer.from(job.payload.encryptedCode, 'base64')
    const decrypt = createDecipheriv('aes-256-gcm', Buffer.alloc(32), encrypted.subarray(0, 12))
    decrypt.setAAD(Buffer.from(challengeId))
    decrypt.setAuthTag(encrypted.subarray(-16))
    code = Buffer.concat([decrypt.update(encrypted.subarray(12, -16)), decrypt.final()]).toString()
  } finally {
    await client.close()
  }
  const signed = await request.post(`/api/v1/enrollments/${id}/signature`, {
    headers,
    data: {
      version: enrollment.version,
      documentHash: enrollment.tutorAgreement.documentHash,
      accepted: true,
      challengeId,
      code,
    },
  })
  if (signed.status() !== 200)
    throw new Error(`Fixture agreement signing failed: ${signed.status()}`)
  const latest = await (await request.get(`/api/v1/enrollments/${id}`)).json()
  const accepted = await request.post(`/api/v1/enrollments/${id}/action`, {
    headers,
    data: { version: latest.enrollment.version, action: 'accept_booking' },
  })
  if (accepted.status() !== 200)
    throw new Error(`Fixture booking acceptance failed: ${accepted.status()}`)
}
