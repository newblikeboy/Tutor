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
    status: { type: 'string', enum: ['uploading', 'quarantined', 'clean', 'rejected', 'archived'] },
    createdAt: date,
  })
  schemas.PrivateFile.properties.scannedAt = date
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
  route('/files/{id}/scan', 'post', 'OK')
}
