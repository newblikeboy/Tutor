import { readFile, writeFile } from 'node:fs/promises'
const file = 'contracts/openapi.yaml'
const doc = JSON.parse(await readFile(file, 'utf8'))
const s = { type: 'string' },
  i = { type: 'integer' }
const ref = (name) => ({ $ref: `#/components/schemas/${name}` })
const obj = (properties) => ({
  type: 'object',
  additionalProperties: false,
  required: Object.keys(properties),
  properties,
})
doc.components.schemas.Subject = obj({
  id: s,
  name: s,
  active: { type: 'boolean' },
  sortOrder: i,
  system: { type: 'boolean' },
  version: i,
  updatedAt: { type: 'string', format: 'date-time' },
})
doc.components.schemas.SubjectCatalog = obj({
  items: { type: 'array', items: ref('Subject'), maxItems: 200 },
})
doc.components.schemas.SubjectInput = obj({
  name: { type: 'string', minLength: 2, maxLength: 80 },
  active: { type: 'boolean' },
  sortOrder: { type: 'integer', minimum: 0, maximum: 999 },
  expectedVersion: { type: 'integer', minimum: 0 },
})
doc.components.schemas.RequirementInput.properties.subject = {
  type: 'string',
  maxLength: 80,
  description:
    'Optional explicit master subject. Subjectless callback requests never assume a teaching subject.',
}
const route = (path, method, output, input) => {
  const parameters = []
  if (path.includes('{id}'))
    parameters.push({
      name: 'id',
      in: 'path',
      required: true,
      schema: s,
      description: 'Immutable subject reference; display-name edits never rewrite records.',
    })
  if (method !== 'get')
    parameters.push({ name: 'X-CSRF-Token', in: 'header', required: true, schema: s })
  const op = {
    operationId: `${method}${path.replace(/[^a-zA-Z]/g, '_')}`,
    summary: 'Shared subject catalog; only admins change names, order or active state',
    security: method === 'get' ? [] : [{ session: [] }],
    parameters,
    responses: {
      [method === 'post' ? '201' : '200']: {
        description: 'Success',
        content: { 'application/json': { schema: ref(output) } },
      },
      default: {
        description: 'Permission, validation, conflict or catalog error',
        content: { 'application/json': { schema: ref('Error') } },
      },
    },
  }
  if (input)
    op.requestBody = { required: true, content: { 'application/json': { schema: ref(input) } } }
  doc.paths[path] ??= {}
  doc.paths[path][method] = op
}
route('/subjects', 'get', 'SubjectCatalog')
route('/admin/subjects', 'post', 'Subject', 'SubjectInput')
route('/admin/subjects/{id}', 'put', 'Subject', 'SubjectInput')
await writeFile(file, JSON.stringify(doc, null, 2) + '\n')
