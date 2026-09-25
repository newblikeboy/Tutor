export function inboxContract(schemas, route, paths) {
  const str = { type: 'string' },
    bool = { type: 'boolean' }
  const ref = (name) => ({ $ref: `#/components/schemas/${name}` })
  const obj = (properties) => ({
    type: 'object',
    additionalProperties: false,
    required: Object.keys(properties),
    properties,
  })
  const nullable = (schema) => ({ anyOf: [schema, { type: 'null' }] })
  const person = { id: str, name: str, role: str, sample: bool }
  const publicKey = { userId: str, encryptionKey: str, signingKey: str, fingerprint: str }
  const key = {
    ...publicKey,
    version: { type: 'integer', const: 1 },
    salt: str,
    iv: str,
    vault: str,
  }
  const envelope = {
    version: { type: 'integer', const: 1 },
    nonce: { ...str, minLength: 16, maxLength: 80 },
    recipientId: str,
    enrollmentId: str,
    senderFingerprint: str,
    recipientFingerprint: str,
    iv: str,
    ciphertext: { ...str, maxLength: 18668 },
    senderWrappedKey: str,
    recipientWrappedKey: str,
    signature: str,
  }
  Object.assign(schemas, {
    InboxPublicKey: obj(publicKey),
    InboxKey: obj(key),
    InboxKeyInput: obj({ ...key, proof: str }),
    InboxKeyResponse: obj({ key: nullable(ref('InboxKey')) }),
    InboxPerson: obj(person),
    InboxRecipient: obj({ ...person, enrollmentId: str, ready: bool }),
    InboxRecipientPage: obj({
      items: { type: 'array', items: ref('InboxRecipient') },
      nextCursor: str,
    }),
    InboxEnvelope: obj(envelope),
    InboxUpdate: obj({
      ...envelope,
      id: str,
      senderId: str,
      sender: ref('InboxPerson'),
      recipient: ref('InboxPerson'),
      createdAt: { ...str, format: 'date-time' },
      readAt: nullable({ ...str, format: 'date-time' }),
      readSignature: str,
    }),
    InboxPage: obj({
      items: { type: 'array', items: ref('InboxUpdate') },
      nextCursor: str,
      keys: { type: 'object', additionalProperties: ref('InboxPublicKey') },
    }),
    InboxDetail: obj({
      message: ref('InboxUpdate'),
      senderKey: ref('InboxPublicKey'),
      recipientKey: ref('InboxPublicKey'),
    }),
    InboxReadInput: obj({ signature: str }),
    InboxStatus: obj({ unreadCount: { type: 'integer', minimum: 0 } }),
  })
  route('/inbox/key', 'get', 'InboxKeyResponse')
  route('/inbox/key', 'post', 'InboxKeyResponse', 'InboxKeyInput')
  route('/inbox/status', 'get', 'InboxStatus')
  route('/inbox/recipients', 'get', 'InboxRecipientPage')
  route('/inbox/recipients/{id}/key', 'get', 'InboxPublicKey')
  route('/inbox', 'get', 'InboxPage')
  route('/inbox', 'post', 'InboxUpdate', 'InboxEnvelope')
  route('/inbox/{id}', 'get', 'InboxDetail')
  route('/inbox/{id}/read', 'post', 'OK', 'InboxReadInput')
  paths['/inbox'].post.responses['201'] = paths['/inbox'].post.responses['200']
  delete paths['/inbox'].post.responses['200']
  paths['/inbox/key'].post.responses['201'] = paths['/inbox/key'].post.responses['200']
  for (const [path, names] of [
    ['/inbox', ['cursor', 'folder']],
    ['/inbox/recipients', ['cursor', 'search', 'role']],
    ['/inbox/recipients/{id}/key', ['enrollmentId']],
  ]) {
    for (const name of names) paths[path].get.parameters.push({ name, in: 'query', schema: str })
  }
  paths['/inbox'].post.parameters.push({
    name: 'Idempotency-Key',
    in: 'header',
    required: true,
    schema: { ...str, minLength: 8, maxLength: 100 },
  })
}
