import { readFileSync, writeFileSync } from 'node:fs'
const path = 'contracts/openapi.yaml'
const spec = JSON.parse(readFileSync(path, 'utf8'))
const schemas = spec.components.schemas
Object.assign(schemas.Config.properties, {
  videoUploadsEnabled: { type: 'boolean' },
  videoProvider: { type: 'string' },
  meetingsEnabled: { type: 'boolean' },
})
for (const key of ['videoUploadsEnabled', 'videoProvider', 'meetingsEnabled'])
  if (!schemas.Config.required.includes(key)) schemas.Config.required.push(key)
Object.assign(schemas.Interview.properties, {
  provider: { type: 'string', enum: ['zoom'] },
  syncStatus: { type: 'string', enum: ['pending', 'ready', 'failed'] },
})
schemas.PrivateFile.properties.provider = { type: 'string' }
spec.paths['/files/{id}/play'] = structuredClone(spec.paths['/files/{id}/download'])
spec.paths['/files/{id}/play'].get.summary =
  'Play a scanned private MP4 with current ownership/assignment checks'
const playback = spec.paths['/files/{id}/play'].get
playback.parameters.push({ name: 'Range', in: 'header', schema: { type: 'string' } })
playback.responses['200'].content = {
  'video/mp4': { schema: { type: 'string', format: 'binary' } },
}
playback.responses['206'] = {
  description: 'Requested video byte range',
  headers: { 'Content-Range': { schema: { type: 'string' } } },
  content: { 'video/mp4': { schema: { type: 'string', format: 'binary' } } },
}
playback.responses['416'] = { description: 'Requested byte range is not satisfiable' }
spec.paths['/staff/applications/{id}/meeting/retry'] = {
  post: {
    summary: 'Retry or reconcile a failed Zoom meeting operation',
    security: [{ cookieAuth: [] }],
    parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            additionalProperties: false,
            required: ['version'],
            properties: { version: { type: 'integer', minimum: 0 } },
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Operation queued for confirmation',
        content: {
          'application/json': {
            schema: { type: 'object', required: ['ok'], properties: { ok: { type: 'boolean' } } },
          },
        },
      },
      403: { description: 'Not the assigned reviewer or admin' },
      409: { description: 'Stale application or operation is not failed' },
      503: { description: 'Zoom is not configured' },
    },
  },
}
writeFileSync(path, JSON.stringify(spec, null, 2) + '\n')
