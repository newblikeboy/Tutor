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
  const person = { id: str, name: str, role: str, sample: bool }
  const input = {
    nonce: { ...str, minLength: 16, maxLength: 80 },
    recipientId: { ...str, minLength: 1, maxLength: 200 },
    enrollmentId: { ...str, maxLength: 200 },
    subject: { ...str, minLength: 1, maxLength: 120 },
    body: { ...str, minLength: 1, maxLength: 3000 },
  }
  Object.assign(schemas, {
    InboxPerson: obj(person),
    InboxRecipient: obj({ ...person, enrollmentId: str }),
    InboxRecipientPage: obj({
      items: { type: 'array', items: ref('InboxRecipient') },
      nextCursor: str,
    }),
    InboxInput: obj(input),
    InboxUpdate: obj({
      ...input,
      id: str,
      senderId: str,
      sender: ref('InboxPerson'),
      recipient: ref('InboxPerson'),
      createdAt: { ...str, format: 'date-time' },
      readAt: { anyOf: [{ ...str, format: 'date-time' }, { type: 'null' }] },
    }),
    InboxPage: obj({ items: { type: 'array', items: ref('InboxUpdate') }, nextCursor: str }),
    InboxDetail: obj({ message: ref('InboxUpdate') }),
    InboxReadInput: obj({}),
    InboxStatus: obj({ unreadCount: { type: 'integer', minimum: 0 } }),
  })
  route('/inbox/status', 'get', 'InboxStatus')
  route('/inbox/recipients', 'get', 'InboxRecipientPage')
  route('/inbox', 'get', 'InboxPage')
  route('/inbox', 'post', 'InboxUpdate', 'InboxInput')
  route('/inbox/{id}', 'get', 'InboxDetail')
  route('/inbox/{id}/read', 'post', 'OK', 'InboxReadInput')
  paths['/inbox'].post.responses['201'] = paths['/inbox'].post.responses['200']
  delete paths['/inbox'].post.responses['200']
  for (const [path, names] of [
    ['/inbox', ['cursor', 'folder']],
    ['/inbox/recipients', ['cursor', 'search', 'role']],
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
