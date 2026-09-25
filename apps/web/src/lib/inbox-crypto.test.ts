import { webcrypto } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import {
  createInboxIdentity,
  unlockInbox,
  encryptUpdate,
  decryptUpdate,
  signReadReceipt,
  verifyReadReceipt,
  type InboxIdentity,
} from './inbox-crypto'
import type { Schema } from './api'

describe('encrypted one-way updates', () => {
  let sender: Awaited<ReturnType<typeof createInboxIdentity>>,
    recipient: Awaited<ReturnType<typeof createInboxIdentity>>,
    stranger: InboxIdentity
  let detail: Schema['InboxDetail']
  const phrase = 'Fictional inbox river violet school 428!'
  beforeAll(async () => {
    vi.stubGlobal('crypto', webcrypto)
    sender = await createInboxIdentity('admin-test', phrase)
    recipient = await createInboxIdentity('parent-test', phrase)
    stranger = (await createInboxIdentity('stranger-test', phrase)).identity
    const envelope = await encryptUpdate(sender.identity, recipient.identity.publicKey, '', {
      subject: 'Weekly learning update',
      body: 'Fictional private message. Fractions are progressing. ✓',
    })
    detail = {
      message: {
        ...envelope,
        id: 'fixture-update',
        senderId: 'admin-test',
        sender: { id: 'admin-test', name: 'Sample admin', role: 'admin', sample: true },
        recipient: { id: 'parent-test', name: 'Sample parent', role: 'parent', sample: true },
        createdAt: new Date().toISOString(),
        readAt: null,
        readSignature: '',
      },
      senderKey: sender.identity.publicKey,
      recipientKey: recipient.identity.publicKey,
    }
  }, 30000)
  afterAll(() => vi.unstubAllGlobals())
  it('only sender and recipient decrypt, without plaintext in the transport envelope', async () => {
    expect(JSON.stringify(detail)).not.toContain('Fractions')
    expect(JSON.stringify(sender.input)).not.toContain(phrase)
    expect(await decryptUpdate(sender.identity, detail)).toEqual(
      await decryptUpdate(recipient.identity, detail),
    )
    expect((await decryptUpdate(recipient.identity, detail)).body).toContain('✓')
    await expect(decryptUpdate(stranger, detail)).rejects.toThrow()
    expect(sender.identity.decryptKey.extractable).toBe(false)
    expect(sender.identity.signKey.extractable).toBe(false)
  })
  it(
    'unlocks the same identity on another device, rejects wrong passphrases and vault tampering',
    { timeout: 20000 },
    async () => {
      const restored = await unlockInbox(recipient.input, phrase)
      expect((await decryptUpdate(restored, detail)).subject).toBe('Weekly learning update')
      await expect(unlockInbox(recipient.input, 'incorrect passphrase')).rejects.toThrow()
      await expect(
        unlockInbox({ ...recipient.input, userId: 'swapped-user' }, phrase),
      ).rejects.toThrow()
      await expect(
        unlockInbox({ ...recipient.input, vault: sender.input.vault }, phrase),
      ).rejects.toThrow()
    },
  )
  it('rejects ciphertext, routing, identity and signature substitution', async () => {
    for (const change of [
      { ciphertext: sender.input.vault },
      { recipientId: 'stranger-test' },
      { enrollmentId: 'other-assignment' },
      { nonce: 'different-update' },
      { senderWrappedKey: detail.message.recipientWrappedKey },
      { signature: detail.message.signature.slice(4) },
    ]) {
      await expect(
        decryptUpdate(recipient.identity, { ...detail, message: { ...detail.message, ...change } }),
      ).rejects.toThrow()
    }
    await expect(
      decryptUpdate(recipient.identity, { ...detail, senderKey: stranger.publicKey }),
    ).rejects.toThrow()
  })
  it('binds a verified read receipt to the recipient and exact update', async () => {
    const signed = {
      ...detail,
      message: {
        ...detail.message,
        readSignature: await signReadReceipt(recipient.identity, detail.message),
        readAt: new Date().toISOString(),
      },
    }
    expect(await verifyReadReceipt(signed)).toBe(true)
    expect(
      await verifyReadReceipt({ ...signed, message: { ...signed.message, id: 'another-update' } }),
    ).toBe(false)
    expect(
      await verifyReadReceipt({
        ...signed,
        message: {
          ...signed.message,
          readSignature: await signReadReceipt(sender.identity, detail.message),
        },
      }),
    ).toBe(false)
  })
  it('randomizes every ciphertext and rejects changed recipient fingerprints', async () => {
    const content = { subject: 'Same', body: 'Same message' }
    const first = await encryptUpdate(sender.identity, recipient.identity.publicKey, '', content)
    const second = await encryptUpdate(sender.identity, recipient.identity.publicKey, '', content)
    expect(first.ciphertext).not.toBe(second.ciphertext)
    expect(first.iv).not.toBe(second.iv)
    await expect(
      encryptUpdate(
        sender.identity,
        { ...recipient.identity.publicKey, fingerprint: 'invalid' },
        '',
        content,
      ),
    ).rejects.toThrow()
  })
})
