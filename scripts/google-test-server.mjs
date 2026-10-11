// Closed-loop Google wire fixture; never used outside explicit APP_ENV=test.
import http from 'node:http'
import { createHash } from 'node:crypto'
if (process.env.APP_ENV !== 'test') throw new Error('Google fixture requires APP_ENV=test')
const events = new Map(),
  codes = new Map()
let revision = 0
const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://127.0.0.1:7996')
  const reply = (status, body) => {
    res.writeHead(status, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(body))
  }
  if (u.pathname === '/authorize') {
    const code = `fixture-code-${++revision}`
    codes.set(code, {
      challenge: u.searchParams.get('code_challenge'),
      email:
        u.searchParams.get('login_hint') === 'mentor-a@example.test'
          ? 'fictional-mentor@example.test'
          : u.searchParams.get('login_hint') || 'fictional-mentor@example.test',
    })
    const callback = new URL(u.searchParams.get('redirect_uri'))
    if (callback.origin !== 'http://127.0.0.1:5174')
      return reply(400, { error: 'invalid_redirect_uri' })
    callback.searchParams.set('state', u.searchParams.get('state'))
    callback.searchParams.set('code', code)
    res.writeHead(302, { Location: callback.toString() })
    return res.end()
  }
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  const raw = Buffer.concat(chunks).toString()
  if (u.pathname === '/token') {
    const p = new URLSearchParams(raw)
    let email
    if (p.get('grant_type') === 'authorization_code') {
      const expected = codes.get(p.get('code'))
      codes.delete(p.get('code'))
      if (
        !expected ||
        expected.challenge !==
          createHash('sha256')
            .update(p.get('code_verifier') ?? '')
            .digest('base64url')
      )
        return reply(400, { error: 'invalid_grant' })
      email = expected.email
    } else if (!p.get('refresh_token')?.startsWith('fixture-refresh:'))
      return reply(400, { error: 'invalid_grant' })
    else email = p.get('refresh_token').slice('fixture-refresh:'.length)
    return reply(200, {
      access_token: `fixture-access:${email}`,
      refresh_token: `fixture-refresh:${email}`,
      expires_in: 3600,
      token_type: 'Bearer',
      scope:
        'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/userinfo.email',
    })
  }
  if (u.pathname === '/revoke') return reply(200, {})
  if (!req.headers.authorization?.startsWith('Bearer fixture-access:'))
    return reply(401, { error: 'invalid_token' })
  if (u.pathname === '/userinfo')
    return reply(200, {
      email: req.headers.authorization.slice('Bearer fixture-access:'.length),
      verified_email: true,
    })
  const host = req.headers.authorization
  const root = '/calendar/v3/calendars/primary/events'
  if (u.pathname === root && req.method === 'GET') {
    if (u.searchParams.get('fields') === 'kind') return reply(200, { kind: 'calendar#events' })
    const start = Date.parse(u.searchParams.get('timeMin')),
      end = Date.parse(u.searchParams.get('timeMax'))
    return reply(200, {
      items: [...events.values()].filter(
        (e) =>
          e.fixtureHost === host &&
          Date.parse(e.start.dateTime) < end &&
          Date.parse(e.end.dateTime) > start,
      ),
    })
  }
  if (u.pathname === root && req.method === 'POST') {
    const e = JSON.parse(raw)
    if (events.has(e.id)) return reply(409, { error: 'conflict' })
    if (u.searchParams.get('conferenceDataVersion') !== '1')
      return reply(400, { error: 'conference_required' })
    e.etag = `"fixture-${++revision}"`
    e.fixtureHost = host
    e.status = 'confirmed'
    e.conferenceData.createRequest.status = { statusCode: 'success' }
    e.conferenceData.entryPoints = [
      { entryPointType: 'video', uri: 'https://meet.google.com/abc-defg-hij' },
    ]
    e.conferenceData.conferenceId = 'abc-defg-hij'
    events.set(e.id, e)
    return reply(200, e)
  }
  if (u.pathname.startsWith(root + '/')) {
    const id = decodeURIComponent(u.pathname.slice(root.length + 1)),
      e = events.get(id)
    if (!e || e.fixtureHost !== host) return reply(404, { error: 'not_found' })
    if (req.method === 'GET') return reply(200, e)
    if (req.headers['if-match'] !== e.etag) return reply(412, { error: 'precondition_failed' })
    if (req.method === 'PATCH') {
      Object.assign(e, JSON.parse(raw))
      e.etag = `"fixture-${++revision}"`
      return reply(200, e)
    }
    if (req.method === 'DELETE') {
      events.delete(id)
      res.writeHead(204)
      return res.end()
    }
  }
  reply(404, { error: 'not_found' })
})
server.listen(7996, '127.0.0.1', () => console.log('Closed-loop Google Calendar fixture ready'))
