export function mediaContract(schemas, route, paths) {
  const s = { type: 'string' },
    date = { type: 'string', format: 'date-time' },
    ref = (name) => ({ $ref: `#/components/schemas/${name}` })
  const obj = (properties) => ({
    type: 'object',
    additionalProperties: false,
    required: Object.keys(properties),
    properties,
  })
  schemas.PrivateFile = obj({
    id: s,
    targetKind: s,
    targetId: s,
    uploaderName: s,
    name: s,
    contentType: s,
    size: { type: 'integer' },
    status: {
      type: 'string',
      enum: ['uploading', 'quarantined', 'clean', 'ready', 'rejected', 'archived'],
    },
    createdAt: date,
  })
  schemas.PrivateFile.properties.scannedAt = date
  schemas.DirectFileInput = obj({
    name: { type: 'string', maxLength: 180 },
    contentType: s,
    size: { type: 'integer', minimum: 1, maximum: 26214400 },
  })
  schemas.DirectUpload = obj({ file: ref('PrivateFile') })
  schemas.DirectUpload.properties.resume = { type: 'boolean' }
  schemas.DirectUpload.properties.upload = obj({
    url: s,
    fields: { type: 'object', additionalProperties: { type: 'string' } },
  })
  schemas.FilePage = obj({ items: { type: 'array', items: ref('PrivateFile') }, nextCursor: s })
  schemas.FileInput = obj({
    name: { type: 'string', maxLength: 300 },
    content: { type: 'string', format: 'byte', maxLength: 4194304 },
  })
  schemas.ApplicationFileInput = obj({
    name: { type: 'string', maxLength: 300 },
    content: { type: 'string', format: 'byte', maxLength: 34952536 },
  })
  for (const target of ['enrollments', 'applications']) {
    route(`/${target}/{id}/files`, 'get', 'FilePage')
    route(`/${target}/{id}/files/upload-intent`, 'post', 'DirectUpload', 'DirectFileInput')
    paths[`/${target}/{id}/files/upload-intent`].post.parameters.push({
      name: 'Idempotency-Key',
      in: 'header',
      required: true,
      schema: { type: 'string', minLength: 8, maxLength: 100 },
    })
    route(
      `/${target}/{id}/files`,
      'post',
      'PrivateFile',
      target === 'applications' ? 'ApplicationFileInput' : 'FileInput',
    )
  }
  route('/files/{id}/download', 'get', 'OK')
  paths['/files/{id}/download'].get.responses[200] = {
    description: 'Private attachment after live assignment and scan checks',
    content: { 'application/octet-stream': { schema: { type: 'string', format: 'binary' } } },
  }
  schemas.DirectCompleteInput = obj({})
  route('/files/{id}/complete', 'post', 'PrivateFile', 'DirectCompleteInput')
  route('/files/{id}/view', 'get', 'OK')
  delete paths['/files/{id}/view'].get.responses[200]
  for (const action of ['view', 'download']) {
    paths[`/files/{id}/${action}`].get.responses[302] = {
      description: 'Authorised, short-lived Cloudinary delivery URL',
      headers: { Location: { schema: { type: 'string' } } },
    }
  }
  route('/files/{id}/scan', 'post', 'OK')
}
