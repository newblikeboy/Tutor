// Explicit test-only provider fixture. Real Go, browser uploads and MongoDB are
// exercised without sending any files or credentials to an external account.
import http from 'node:http'
import { createHash, timingSafeEqual } from 'node:crypto'
if (process.env.APP_ENV !== 'test') throw new Error('Cloudinary fixture is test-only')
const secret = 'fixture-cloudinary-secret'
const assets = new Map()
const signature = (fields) =>
  createHash('sha256')
    .update(
      Object.keys(fields)
        .sort()
        .map((k) => `${k}=${fields[k]}`)
        .join('&') + secret,
    )
    .digest('hex')
const validSignature = (fields, actual) => {
  const expected = signature(fields)
  return (
    typeof actual === 'string' &&
    expected.length === actual.length &&
    timingSafeEqual(Buffer.from(expected), Buffer.from(actual))
  )
}
http
  .createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', 'http://127.0.0.1:5174')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    res.setHeader('Cache-Control', 'no-store')
    if (req.method === 'OPTIONS') {
      res.writeHead(204).end()
      return
    }
    const url = new URL(req.url, 'http://127.0.0.1:7998')
    try {
      if (req.method === 'POST' && /^\/(image|raw|video)\/upload$/.test(url.pathname)) {
        const form = await new Request(url, {
          method: 'POST',
          headers: req.headers,
          body: req,
          duplex: 'half',
        }).formData()
        const fields = Object.fromEntries(
          [...form.entries()].filter(([k]) => !['file', 'api_key', 'signature'].includes(k)),
        )
        if (
          !validSignature(fields, form.get('signature')) ||
          form.get('api_key') !== 'fixture-cloudinary-key' ||
          fields.type !== 'authenticated' ||
          fields.overwrite !== 'false'
        ) {
          res.writeHead(401).end()
          return
        }
        const resource = url.pathname.split('/')[1],
          file = form.get('file')
        const key = `${resource}/${fields.public_id}`
        if (!assets.has(key)) {
          const bytes = Buffer.from(await file.arrayBuffer())
          const format = resource === 'raw' ? '' : fields.allowed_formats
          assets.set(key, {
            data: bytes,
            metadata: {
              public_id: fields.public_id,
              resource_type: resource,
              type: 'authenticated',
              format,
              bytes: bytes.length,
              version: 1,
              asset_id: createHash('sha256').update(key).digest('hex'),
              etag: createHash('md5').update(bytes).digest('hex'),
            },
          })
        }
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify(assets.get(key).metadata))
        return
      }
      if (req.method === 'GET' && url.pathname.startsWith('/resources/')) {
        if (
          req.headers.authorization !==
          `Basic ${Buffer.from(`fixture-cloudinary-key:${secret}`).toString('base64')}`
        ) {
          res.writeHead(401).end()
          return
        }
        const parts = url.pathname.split('/'),
          key = `${parts[2]}/${decodeURIComponent(parts.slice(4).join('/'))}`
        const asset = assets.get(key)
        if (!asset) {
          res.writeHead(404).end()
          return
        }
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify(asset.metadata))
        return
      }
      if (req.method === 'GET' && /^\/(image|raw|video)\/download$/.test(url.pathname)) {
        const params = Object.fromEntries(url.searchParams),
          actual = params.signature
        delete params.signature
        delete params.api_key
        if (!validSignature(params, actual) || Number(params.expires_at) < Date.now() / 1000) {
          res.writeHead(401).end()
          return
        }
        const resource = url.pathname.split('/')[1],
          asset = assets.get(`${resource}/${params.public_id}`)
        if (!asset) {
          res.writeHead(404).end()
          return
        }
        const type = {
          png: 'image/png',
          jpg: 'image/jpeg',
          pdf: 'application/pdf',
          mp4: 'video/mp4',
        }[params.format]
        res.setHeader('Content-Type', type || 'application/octet-stream')
        res.setHeader('Content-Disposition', params.attachment === 'true' ? 'attachment' : 'inline')
        res.setHeader('Accept-Ranges', 'bytes')
        const match = req.headers.range?.match(/^bytes=(\d+)-(\d*)$/)
        if (match) {
          const start = Number(match[1]),
            end = match[2] ? Number(match[2]) : asset.data.length - 1
          res.setHeader('Content-Range', `bytes ${start}-${end}/${asset.data.length}`)
          res.writeHead(206).end(asset.data.subarray(start, end + 1))
          return
        }
        res.end(asset.data)
        return
      }
      res.writeHead(404).end()
    } catch {
      res.writeHead(500).end('Test provider error')
    }
  })
  .listen(7998, '127.0.0.1', () =>
    console.log('Test-only Cloudinary fixture listening on loopback 7998'),
  )
