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
    Preferences: obj({ language: { type: 'string', enum: ['en', 'hi'] }, version: i }),
    Account: obj({ name: s, email: s, preferences: ref('Preferences') }),
    AccountInput: obj({ name: s, language: { type: 'string', enum: ['en', 'hi'] }, version: i }),
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
