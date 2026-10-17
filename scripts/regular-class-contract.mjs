import { readFile, writeFile } from 'node:fs/promises'

const file = 'contracts/openapi.yaml'
const doc = JSON.parse(await readFile(file, 'utf8'))
const schemas = doc.components.schemas
const str = { type: 'string' },
  integer = { type: 'integer' }
const ref = (name) => ({ $ref: `#/components/schemas/${name}` })
const obj = (properties, required = Object.keys(properties)) => ({
  type: 'object',
  additionalProperties: false,
  properties,
  required,
})
schemas.MessageAttachment = obj({ id: str, name: str, contentType: str, size: integer })
schemas.Message.properties.attachments = {
  type: 'array',
  items: ref('MessageAttachment'),
  maxItems: 3,
}
schemas.MessageInput = obj(
  {
    body: { type: 'string', maxLength: 3000 },
    attachmentIds: { type: 'array', items: str, maxItems: 3, uniqueItems: true },
  },
  [],
)
schemas.HandoverInput = obj({
  reason: { type: 'string', minLength: 10, maxLength: 1000 },
  consent: { const: true },
})
schemas.HandoverAction.properties.action.enum = ['prepare', 'reject', 'cancel', 'decline', 'accept']
schemas.HandoverAction.properties.tutorId = str
schemas.EnrollmentAction.properties.action.enum =
  schemas.EnrollmentAction.properties.action.enum.filter((action) => action !== 'pause')
schemas.TutorChangeReview = obj({
  request: ref('Handover'),
  learnerName: str,
  tutorName: str,
  class: integer,
  subjects: { type: 'array', items: str },
  mode: str,
  bookingStatus: str,
})
schemas.TutorChangePage = obj({
  items: { type: 'array', items: ref('TutorChangeReview') },
  nextCursor: str,
})
for (const path of ['/admin/tutor-changes', '/admin/tutor-changes/{id}']) {
  const operation = structuredClone(doc.paths['/admin/study-materials'].get)
  operation.operationId = path.endsWith('{id}') ? 'adminTutorChange' : 'adminTutorChanges'
  operation.parameters = path.endsWith('{id}')
    ? [{ name: 'id', in: 'path', required: true, schema: str }]
    : ['status', 'cursor'].map((name) => ({ name, in: 'query', schema: str }))
  operation.responses['200'].content['application/json'].schema = ref('TutorChangePage')
  doc.paths[path] = { get: operation }
}
for (const [suffix, template] of [
  ['/upload-intent', '/enrollments/{id}/files/upload-intent'],
  ['', '/enrollments/{id}/files'],
]) {
  doc.paths[`/enrollments/{id}/messages/files${suffix}`] = {
    post: structuredClone(doc.paths[template].post),
  }
}
const files = doc.paths['/enrollments/{id}/files'].get
files.parameters = files.parameters.filter((p) => p.name !== 'unlinked')
files.parameters.push({
  name: 'unlinked',
  in: 'query',
  schema: { type: 'string', enum: ['1'] },
  description: 'Only shared files outside messages; unsent message drafts are excluded.',
})
await writeFile(file, JSON.stringify(doc, null, 2) + '\n')
