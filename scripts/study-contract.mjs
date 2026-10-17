import { readFile, writeFile } from 'node:fs/promises'

const file = 'contracts/openapi.yaml'
const doc = JSON.parse(await readFile(file, 'utf8'))
const s = { type: 'string' },
  i = { type: 'integer' },
  b = { type: 'boolean' }
const date = { type: 'string', format: 'date-time' }
const ref = (name) => ({ $ref: `#/components/schemas/${name}` })
const arr = (name) => ({ type: 'array', items: ref(name) })
const obj = (properties, required = Object.keys(properties)) => ({
  type: 'object',
  additionalProperties: false,
  required,
  properties,
})
const kind = { type: 'string', enum: ['unit_test', 'mid_term', 'monthly_test', 'quiz', 'notes'] }
const status = { type: 'string', enum: ['draft', 'published', 'archived'] }
const schemas = doc.components.schemas
schemas.StudyQuestion = obj(
  {
    prompt: s,
    options: { type: 'array', items: s, minItems: 2, maxItems: 6 },
    correctOption: {
      type: 'integer',
      minimum: 0,
      maximum: 5,
      description: 'Admin-only answer key. Never included in parent responses.',
    },
  },
  ['prompt', 'options'],
)
schemas.StudyMaterial = obj(
  {
    id: s,
    title: s,
    description: s,
    kind,
    class: i,
    board: s,
    subject: s,
    status,
    fileId: s,
    questions: arr('StudyQuestion'),
    version: i,
    updatedAt: date,
  },
  [
    'id',
    'title',
    'description',
    'kind',
    'class',
    'board',
    'subject',
    'status',
    'version',
    'updatedAt',
  ],
)
schemas.StudyMaterialInput = obj({
  title: s,
  description: s,
  kind,
  class: { type: 'integer', minimum: 1, maximum: 12 },
  board: { type: 'string', enum: ['All', 'CBSE', 'BSEB', 'ICSE'] },
  subject: s,
  status,
  fileId: s,
  questions: arr('StudyQuestion'),
  expectedVersion: { type: 'integer', minimum: 0 },
})
schemas.StudyAccess = obj(
  { id: s, learnerId: s, intentId: s, startsAt: date, expiresAt: date, simulated: b, version: i },
  ['id', 'learnerId', 'startsAt', 'expiresAt', 'simulated', 'version'],
)
schemas.StudyAttempt = obj({
  id: s,
  learnerId: s,
  materialId: s,
  title: s,
  materialVersion: i,
  score: i,
  total: i,
  answers: { type: 'array', items: i },
  createdAt: date,
})
for (const [name, item] of [
  ['StudyMaterialPage', 'StudyMaterial'],
  ['StudyAttemptPage', 'StudyAttempt'],
])
  schemas[name] = obj({ items: arr(item), nextCursor: s })
schemas.StudyLibrary = obj({
  student: ref('Learner'),
  subscription: ref('StudyAccess'),
  active: b,
  pricePaise: { type: 'integer', const: 9900 },
  materials: ref('StudyMaterialPage'),
  attempts: ref('StudyAttemptPage'),
  pendingPayment: { anyOf: [ref('PaymentIntent'), { type: 'null' }] },
})
schemas.StudyQuizInput = obj({
  learnerId: s,
  version: i,
  answers: {
    type: 'array',
    items: { type: 'integer', minimum: 0, maximum: 5 },
    minItems: 1,
    maxItems: 50,
  },
})
schemas.StudyPaymentInput = obj({})
Object.assign(schemas.PaymentIntent.properties, { purpose: s, learnerId: s, accessUntil: date })
const add = (path, method, output, input, idempotent = false) => {
  const parameters = []
  if (path.includes('{id}')) parameters.push({ name: 'id', in: 'path', required: true, schema: s })
  if (method !== 'get')
    parameters.push({ name: 'X-CSRF-Token', in: 'header', required: true, schema: s })
  if (idempotent)
    parameters.push({
      name: 'Idempotency-Key',
      in: 'header',
      required: true,
      schema: { type: 'string', minLength: 8, maxLength: 100 },
    })
  const code =
    method === 'post' && ['/admin/study-materials', '/study/materials/{id}/attempts'].includes(path)
      ? '201'
      : '200'
  const operation = {
    operationId: `${method}${path.replace(/[^a-zA-Z]/g, '_')}`,
    summary:
      'Student study subscription and admin-managed materials; ownership, consent and entitlement checked on the server',
    security: [{ session: [] }],
    parameters,
    responses: {
      [code]: { description: 'Success', content: { 'application/json': { schema: ref(output) } } },
      default: {
        description: 'Authentication, permission, validation, payment or version error',
        content: { 'application/json': { schema: ref('Error') } },
      },
    },
  }
  if (input)
    operation.requestBody = {
      required: true,
      content: { 'application/json': { schema: ref(input) } },
    }
  doc.paths[path] ??= {}
  doc.paths[path][method] = operation
  return operation
}
const library = add('/study', 'get', 'StudyLibrary')
for (const name of ['learner', 'kind', 'cursor', 'attemptCursor'])
  library.parameters.push({ name, in: 'query', required: name === 'learner', schema: s })
add('/study/materials/{id}', 'get', 'StudyMaterial').parameters.push({
  name: 'learner',
  in: 'query',
  required: true,
  schema: s,
})
add('/study/materials/{id}/attempts', 'post', 'StudyAttempt', 'StudyQuizInput', true)
add('/learners/{id}/study-payment', 'post', 'Checkout', 'StudyPaymentInput', true)
const admin = add('/admin/study-materials', 'get', 'StudyMaterialPage')
for (const name of ['status', 'cursor']) admin.parameters.push({ name, in: 'query', schema: s })
add('/admin/study-materials', 'post', 'StudyMaterial', 'StudyMaterialInput')
add('/admin/study-materials/{id}', 'get', 'StudyMaterial')
add('/admin/study-materials/{id}', 'put', 'StudyMaterial', 'StudyMaterialInput')
add(
  '/admin/study-materials/{id}/files/upload-intent',
  'post',
  'DirectUpload',
  'DirectFileInput',
  true,
)
// A parent must identify the licensed student even for direct file URLs.
for (const action of ['view', 'download', 'play']) {
  const operation = doc.paths[`/files/{id}/${action}`]?.get
  if (!operation) continue
  operation.parameters = (operation.parameters ?? []).filter((p) => p.name !== 'learner')
  operation.parameters.push({
    name: 'learner',
    in: 'query',
    schema: s,
    description:
      'Required for parent study-resource access. Must be the owned, consented student with an active eligible subscription.',
  })
}
await writeFile(file, JSON.stringify(doc, null, 2) + '\n')
