export function emailContract(schemas, route, paths) {
  const string = { type: 'string' }
  const date = { type: 'string', format: 'date-time' }
  const ref = (name) => ({ $ref: `#/components/schemas/${name}` })
  const obj = (properties, required = Object.keys(properties)) => ({
    type: 'object',
    additionalProperties: false,
    properties,
    required,
  })
  schemas.User.properties.emailVerifiedAt = date
  schemas.Config.properties.emailEnabled = { type: 'boolean' }
  schemas.Config.required.push('emailEnabled')
  schemas.Account.properties.emailVerifiedAt = { anyOf: [date, { type: 'null' }] }
  schemas.Preferences.properties.emailReminders = { type: 'boolean' }
  schemas.Job.properties.smtpAcceptedAt = date
  Object.assign(schemas, {
    EmailCodeRequest: obj({
      email: { ...string, format: 'email' },
      purpose: { ...string, enum: ['login', 'reset', 'signup'] },
    }),
    EmailChallenge: obj({
      challengeId: { ...string, pattern: '^[a-f0-9]{64}$' },
      expiresAt: date,
      resendAfterSeconds: { type: 'integer' },
      message: string,
    }),
    EmailCodeConfirm: obj(
      {
        challengeId: { ...string, pattern: '^[a-f0-9]{64}$' },
        code: { ...string, pattern: '^[0-9]{6}$', writeOnly: true },
        newPassword: { ...string, minLength: 8, maxLength: 128, writeOnly: true },
      },
      ['challengeId', 'code'],
    ),
    EmailCodeResult: { oneOf: [ref('Auth'), obj({ ok: { type: 'boolean' }, message: string })] },
    EmailPreferences: obj({
      reminders: { type: 'boolean' },
      version: { type: 'integer', minimum: 0 },
    }),
    EmailEmpty: obj({}),
    EmailDelivery: obj({
      id: string,
      event: string,
      recipientId: string,
      status: {
        ...string,
        enum: ['pending', 'processing', 'done', 'failed', 'uncertain', 'skipped'],
      },
      attempts: { type: 'integer' },
      lastError: string,
      availableAt: date,
      smtpAcceptedAt: { anyOf: [date, { type: 'null' }] },
    }),
    EmailDeliveries: obj({
      items: { type: 'array', items: ref('EmailDelivery') },
      nextCursor: string,
    }),
    EmailRetry: obj({
      reason: { ...string, minLength: 10, maxLength: 1000 },
      acknowledgeDuplicate: { type: 'boolean' },
    }),
  })
  route('/auth/email/request', 'post', 'EmailChallenge', 'EmailCodeRequest', true)
  route('/auth/email/confirm', 'post', 'EmailCodeResult', 'EmailCodeConfirm', true)
  route('/account/email/request', 'post', 'EmailChallenge', 'EmailEmpty')
  route('/account/email/confirm', 'post', 'EmailCodeResult', 'EmailCodeConfirm')
  route('/account/email/preferences', 'get', 'EmailPreferences')
  route('/account/email/preferences', 'put', 'OK', 'EmailPreferences')
  route('/admin/email-deliveries', 'get', 'EmailDeliveries')
  route('/admin/email-deliveries/{id}/retry', 'post', 'OK', 'EmailRetry')
  for (const path of ['/auth/email/request', '/account/email/request']) {
    paths[path].post.responses['202'] = paths[path].post.responses['200']
    delete paths[path].post.responses['200']
  }
}
