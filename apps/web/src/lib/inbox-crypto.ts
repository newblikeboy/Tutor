import type { Schema } from './api'

// Version 1: RSA-OAEP-3072/SHA-256 envelopes, AES-256-GCM content,
// ECDSA-P256/SHA-256 signatures and a PBKDF2-SHA-256 encrypted key vault.
// Private CryptoKeys and decrypted content are held in page memory only.
type PublicKey = Schema['InboxPublicKey']
export type InboxIdentity = { publicKey: PublicKey; decryptKey: CryptoKey; signKey: CryptoKey }
export type UpdateContent = { subject: string; body: string }
const enc = new TextEncoder()
const dec = new TextDecoder('utf-8', { fatal: true })
const rsa = { name: 'RSA-OAEP', hash: 'SHA-256' }
const ec = { name: 'ECDSA', namedCurve: 'P-256' }
const signatureAlgorithm = { name: 'ECDSA', hash: 'SHA-256' }
const json = (value: unknown) => enc.encode(JSON.stringify(value))
const b64 = (value: ArrayBuffer | Uint8Array<ArrayBuffer>) =>
  btoa(String.fromCharCode(...new Uint8Array(value)))
const bytes = (value: string): Uint8Array<ArrayBuffer> =>
  Uint8Array.from(atob(value), (char) => char.charCodeAt(0))
const random = (length: number) => crypto.getRandomValues(new Uint8Array(length))
async function fingerprint(key: Pick<PublicKey, 'encryptionKey' | 'signingKey'>) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest('SHA-256', enc.encode(`${key.encryptionKey}.${key.signingKey}`)),
    ),
    (v) => v.toString(16).padStart(2, '0'),
  ).join('')
}
async function checkPublic(key: PublicKey) {
  if ((await fingerprint(key)) !== key.fingerprint) throw new Error('inbox_integrity')
}
async function vaultKey(passphrase: string, salt: string) {
  const material = await crypto.subtle.importKey('raw', enc.encode(passphrase), 'PBKDF2', false, [
    'deriveKey',
  ])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: bytes(salt), iterations: 600_000, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}
const vaultAAD = (k: PublicKey) =>
  json(['gyansetu-inbox-vault-v1', k.userId, k.encryptionKey, k.signingKey])
async function sign(key: CryptoKey, value: string[]) {
  return b64(await crypto.subtle.sign(signatureAlgorithm, key, json(value)))
}
async function verify(key: string, signature: string, value: string[]) {
  const pub = await crypto.subtle.importKey('spki', bytes(key), ec, false, ['verify'])
  return crypto.subtle.verify(signatureAlgorithm, pub, bytes(signature), json(value))
}
export async function createInboxIdentity(userId: string, passphrase: string) {
  const encryption = await crypto.subtle.generateKey(
    { ...rsa, modulusLength: 3072, publicExponent: new Uint8Array([1, 0, 1]) },
    true,
    ['encrypt', 'decrypt'],
  )
  const signing = await crypto.subtle.generateKey(ec, true, ['sign', 'verify'])
  const key: Schema['InboxKey'] = {
    userId,
    version: 1,
    encryptionKey: b64(await crypto.subtle.exportKey('spki', encryption.publicKey)),
    signingKey: b64(await crypto.subtle.exportKey('spki', signing.publicKey)),
    fingerprint: '',
    salt: b64(random(32)),
    iv: b64(random(12)),
    vault: '',
  }
  key.fingerprint = await fingerprint(key)
  const privateData = json({
    encryption: b64(await crypto.subtle.exportKey('pkcs8', encryption.privateKey)),
    signing: b64(await crypto.subtle.exportKey('pkcs8', signing.privateKey)),
  })
  try {
    key.vault = b64(
      await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: bytes(key.iv), additionalData: vaultAAD(key) },
        await vaultKey(passphrase, key.salt),
        privateData,
      ),
    )
  } finally {
    privateData.fill(0)
  }
  const proof = await sign(signing.privateKey, [
    'gyansetu-inbox-key-v1',
    userId,
    key.encryptionKey,
    key.signingKey,
    key.salt,
    key.iv,
    key.vault,
  ])
  return { input: { ...key, proof }, identity: await unlockInbox(key, passphrase) }
}
export async function unlockInbox(
  key: Schema['InboxKey'],
  passphrase: string,
): Promise<InboxIdentity> {
  if (key.version !== 1) throw new Error('inbox_integrity')
  await checkPublic(key)
  const clear = new Uint8Array(
    await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: bytes(key.iv), additionalData: vaultAAD(key) },
      await vaultKey(passphrase, key.salt),
      bytes(key.vault),
    ),
  )
  try {
    const data = JSON.parse(dec.decode(clear)) as { encryption: string; signing: string }
    const decryptKey = await crypto.subtle.importKey('pkcs8', bytes(data.encryption), rsa, false, [
      'decrypt',
    ])
    const signKey = await crypto.subtle.importKey('pkcs8', bytes(data.signing), ec, false, ['sign'])
    const challenge = [crypto.randomUUID()]
    if (!(await verify(key.signingKey, await sign(signKey, challenge), challenge)))
      throw new Error('inbox_integrity')
    const publicRSA = await crypto.subtle.importKey('spki', bytes(key.encryptionKey), rsa, false, [
      'encrypt',
    ])
    const test = await crypto.subtle.encrypt(rsa, publicRSA, enc.encode(challenge[0]))
    if (dec.decode(await crypto.subtle.decrypt(rsa, decryptKey, test)) !== challenge[0])
      throw new Error('inbox_integrity')
    return {
      publicKey: {
        userId: key.userId,
        encryptionKey: key.encryptionKey,
        signingKey: key.signingKey,
        fingerprint: key.fingerprint,
      },
      decryptKey,
      signKey,
    }
  } finally {
    clear.fill(0)
  }
}
const envelopeFields = (sender: string, v: Schema['InboxEnvelope']) => [
  'gyansetu-update-v1',
  v.nonce,
  sender,
  v.recipientId,
  v.enrollmentId,
  v.senderFingerprint,
  v.recipientFingerprint,
  v.iv,
  v.ciphertext,
  v.senderWrappedKey,
  v.recipientWrappedKey,
]
const contentAAD = (sender: string, v: Schema['InboxEnvelope']) =>
  json([
    'gyansetu-update-content-v1',
    v.nonce,
    sender,
    v.recipientId,
    v.enrollmentId,
    v.senderFingerprint,
    v.recipientFingerprint,
  ])
export async function encryptUpdate(
  identity: InboxIdentity,
  recipient: PublicKey,
  enrollmentId: string,
  content: UpdateContent,
): Promise<Schema['InboxEnvelope']> {
  await checkPublic(recipient)
  if (
    !content.subject.trim() ||
    content.subject.length > 120 ||
    !content.body.trim() ||
    content.body.length > 3000
  )
    throw new Error('validation')
  const envelope: Schema['InboxEnvelope'] = {
    version: 1,
    nonce: crypto.randomUUID(),
    recipientId: recipient.userId,
    enrollmentId,
    senderFingerprint: identity.publicKey.fingerprint,
    recipientFingerprint: recipient.fingerprint,
    iv: b64(random(12)),
    ciphertext: '',
    senderWrappedKey: '',
    recipientWrappedKey: '',
    signature: '',
  }
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, [
    'encrypt',
    'decrypt',
  ])
  envelope.ciphertext = b64(
    await crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: bytes(envelope.iv),
        additionalData: contentAAD(identity.publicKey.userId, envelope),
      },
      key,
      json({ subject: content.subject.trim(), body: content.body.trim() }),
    ),
  )
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', key))
  try {
    const wrap = async (publicKey: string) =>
      b64(
        await crypto.subtle.encrypt(
          rsa,
          await crypto.subtle.importKey('spki', bytes(publicKey), rsa, false, ['encrypt']),
          raw,
        ),
      )
    envelope.senderWrappedKey = await wrap(identity.publicKey.encryptionKey)
    envelope.recipientWrappedKey = await wrap(recipient.encryptionKey)
  } finally {
    raw.fill(0)
  }
  envelope.signature = await sign(
    identity.signKey,
    envelopeFields(identity.publicKey.userId, envelope),
  )
  return envelope
}
export async function decryptUpdate(
  identity: InboxIdentity,
  detail: Schema['InboxDetail'],
): Promise<UpdateContent> {
  const { message: v, senderKey, recipientKey } = detail
  await checkPublic(senderKey)
  await checkPublic(recipientKey)
  if (
    v.version !== 1 ||
    senderKey.userId !== v.senderId ||
    recipientKey.userId !== v.recipientId ||
    senderKey.fingerprint !== v.senderFingerprint ||
    recipientKey.fingerprint !== v.recipientFingerprint ||
    !(await verify(senderKey.signingKey, v.signature, envelopeFields(v.senderId, v)))
  )
    throw new Error('inbox_integrity')
  const own = identity.publicKey
  if (
    (own.userId !== v.senderId && own.userId !== v.recipientId) ||
    own.fingerprint !== (own.userId === v.senderId ? v.senderFingerprint : v.recipientFingerprint)
  )
    throw new Error('inbox_integrity')
  const raw = new Uint8Array(
    await crypto.subtle.decrypt(
      rsa,
      identity.decryptKey,
      bytes(own.userId === v.senderId ? v.senderWrappedKey : v.recipientWrappedKey),
    ),
  )
  try {
    const key = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['decrypt'])
    const clear = new Uint8Array(
      await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: bytes(v.iv), additionalData: contentAAD(v.senderId, v) },
        key,
        bytes(v.ciphertext),
      ),
    )
    try {
      const data: unknown = JSON.parse(dec.decode(clear))
      if (
        !data ||
        typeof data !== 'object' ||
        !('subject' in data) ||
        !('body' in data) ||
        typeof data.subject !== 'string' ||
        typeof data.body !== 'string' ||
        data.subject.length > 120 ||
        data.body.length > 3000
      )
        throw new Error('inbox_integrity')
      return { subject: data.subject, body: data.body }
    } finally {
      clear.fill(0)
    }
  } finally {
    raw.fill(0)
  }
}
export const signReadReceipt = (identity: InboxIdentity, v: Schema['InboxUpdate']) =>
  sign(identity.signKey, ['gyansetu-read-v1', v.id, v.nonce, v.recipientFingerprint])
export const verifyReadReceipt = (detail: Schema['InboxDetail']) =>
  verify(detail.recipientKey.signingKey, detail.message.readSignature, [
    'gyansetu-read-v1',
    detail.message.id,
    detail.message.nonce,
    detail.message.recipientFingerprint,
  ])
