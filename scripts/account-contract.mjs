export function accountContract(schemas, route) {
  const s = { type: 'string' },
    i = { type: 'integer' },
    b = { type: 'boolean' }
  const ref = (name) => ({ $ref: `#/components/schemas/${name}` })
  const obj = (properties) => ({
    type: 'object',
    additionalProperties: false,
    required: Object.keys(properties),
    properties,
  })
  Object.assign(schemas, {
    Preferences: {
      type: 'object',
      additionalProperties: false,
      required: ['language', 'version'],
      properties: {
        language: { type: 'string', enum: ['en', 'hi'] },
        location: { anyOf: [ref('LocationPoint'), { type: 'null' }] },
        version: i,
      },
    },
    Account: obj({ name: s, email: s, preferences: ref('Preferences') }),
    AccountInput: {
      type: 'object',
      additionalProperties: false,
      required: ['name', 'language', 'version'],
      properties: {
        name: s,
        language: { type: 'string', enum: ['en', 'hi'] },
        location: { anyOf: [ref('LocationPoint'), { type: 'null' }] },
        version: i,
      },
    },
    PasswordChange: obj({
      currentPassword: { type: 'string', writeOnly: true },
      newPassword: { type: 'string', minLength: 8, maxLength: 128, writeOnly: true },
    }),
    AccountSession: obj({ id: s, current: b, expiresAt: { type: 'string', format: 'date-time' } }),
    AccountSessions: obj({ items: { type: 'array', items: ref('AccountSession') }, nextCursor: s }),
  })
  route('/account', 'get', 'Account')
  route('/account', 'put', 'OK', 'AccountInput')
  route('/account/password', 'post', 'Auth', 'PasswordChange')
  route('/account/sessions', 'get', 'AccountSessions')
  route('/account/sessions/{id}/revoke', 'post', 'OK')
}
