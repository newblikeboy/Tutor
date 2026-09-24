// External-provider fixture only. Go remains the application backend.
import { createServer } from 'node:http'
if (process.env.APP_ENV !== 'test') throw new Error('Zoom fixture requires APP_ENV=test')
const meetings = new Map()
let nextId = 12345678900
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1:7999')
  const json = (status, body) => {
    res.writeHead(status, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(body))
  }
  if (url.pathname === '/oauth/token') {
    if (
      req.headers.authorization !==
      'Basic ' + Buffer.from('test-client:test-secret').toString('base64')
    )
      return json(401, {})
    return json(200, { access_token: 'loopback-test-token', expires_in: 3600 })
  }
  if (req.headers.authorization !== 'Bearer loopback-test-token') return json(401, {})
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  let body = {}
  try {
    if (chunks.length) body = JSON.parse(Buffer.concat(chunks).toString())
  } catch {
    return json(400, {})
  }
  if (url.pathname === '/users/test-host/meetings') {
    if (req.method === 'POST') {
      const id = ++nextId
      const meeting = {
        id,
        topic: body.topic,
        start_time: body.start_time,
        duration: body.duration,
        join_url: `https://zoom.us/j/${id}?pwd=fictional-test-only`,
      }
      meetings.set(String(id), meeting)
      return json(201, meeting)
    }
    return json(200, { meetings: [...meetings.values()], next_page_token: '' })
  }
  const id = url.pathname.match(/^\/meetings\/(\d+)$/)?.[1]
  const meeting = meetings.get(id)
  if (!meeting) return json(404, {})
  if (req.method === 'PATCH') Object.assign(meeting, body)
  if (req.method === 'DELETE') meetings.delete(id)
  if (req.method === 'GET') return json(200, meeting)
  res.writeHead(204)
  res.end()
})
server.listen(7999, '127.0.0.1', () =>
  console.log('Zoom API fixture ready (test only, no external meetings).'),
)
