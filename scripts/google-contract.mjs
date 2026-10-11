import { readFileSync, writeFileSync } from 'node:fs'
const path = 'contracts/openapi.yaml'
const spec = JSON.parse(readFileSync(path, 'utf8'))
const s = { type: 'string' },
  b = { type: 'boolean' },
  date = { type: 'string', format: 'date-time' }
const ref = (name) => ({ $ref: `#/components/schemas/${name}` })
const obj = (properties, required = Object.keys(properties)) => ({
  type: 'object',
  additionalProperties: false,
  properties,
  required,
})
const schemas = spec.components.schemas
schemas.Config.properties.interviewsEnabled = b
schemas.Config.properties.interviewProvider = { ...s, enum: ['disabled', 'google'] }
for (const key of ['interviewsEnabled', 'interviewProvider'])
  if (!schemas.Config.required.includes(key)) schemas.Config.required.push(key)
Object.assign(schemas.Interview.properties, {
  provider: {
    ...s,
    description: 'Google for active interviews; other values are retained history',
  },
  mentorName: s,
  meetingCode: s,
  notes: { ...s, maxLength: 1000 },
  lastError: s,
  rescheduledAt: date,
})
schemas.InterviewAssessment = obj({
  scores: {
    type: 'array',
    items: { type: 'integer', minimum: 1, maximum: 5 },
    minItems: 4,
    maxItems: 4,
  },
  recommendation: { ...s, enum: ['approve', 'reject', 'reinterview'] },
  comments: { ...s, minLength: 10, maxLength: 1000 },
  mentorId: s,
  submittedAt: date,
})
schemas.AssessmentInput = obj({
  scores: schemas.InterviewAssessment.properties.scores,
  recommendation: schemas.InterviewAssessment.properties.recommendation,
  comments: schemas.InterviewAssessment.properties.comments,
  conducted: { const: true, type: 'boolean' },
})
schemas.Application.properties.interviewAssessment = ref('InterviewAssessment')
schemas.StaffEvent.properties.assessment = ref('InterviewAssessment')
schemas.DecisionInput.properties.assessment = ref('AssessmentInput')
if (!schemas.DecisionInput.properties.action.enum.includes('interview_assessment'))
  schemas.DecisionInput.properties.action.enum.push('interview_assessment')
schemas.GoogleConnection = obj(
  {
    enabled: b,
    status: {
      ...s,
      enum: ['unconfigured', 'disconnected', 'connected', 'reconnect_required', 'unavailable'],
    },
    email: s,
    checkedAt: date,
  },
  ['enabled', 'status'],
)
schemas.GoogleConnection.properties.revocationStatus = {
  ...s,
  enum: ['pending', 'processing', 'failed'],
}
schemas.GoogleAuthorization = obj({ url: { ...s, format: 'uri' } })
schemas.CalendarReview = obj({ etag: s, status: s, start: s, end: s, operation: s }, [
  'etag',
  'status',
  'operation',
])
schemas.CalendarReview.properties.calendarMissing = b
schemas.StaffDetail.properties.googleConnection = ref('GoogleConnection')
function route(path, method, schema, body) {
  spec.paths[path] ??= {}
  spec.paths[path][method] = {
    summary: 'Assigned host Google Calendar integration',
    security: [{ session: [] }],
    responses: {
      200: { description: 'Success', content: { 'application/json': { schema: ref(schema) } } },
      default: spec.paths['/me'].get.responses.default,
    },
  }
  if (body)
    spec.paths[path][method].requestBody = {
      required: true,
      content: { 'application/json': { schema: body } },
    }
}
route('/integrations/google', 'get', 'GoogleConnection')
route('/integrations/google/connect', 'post', 'GoogleAuthorization', obj({}))
route('/integrations/google/disconnect', 'post', 'OK', obj({}))
route('/integrations/google/revoke/retry', 'post', 'OK', obj({}))
schemas.GoogleLessonRecovery = obj({
  id: s,
  operation: s,
  lessonKind: s,
  lessonId: s,
  lastError: s,
})
schemas.GoogleLessonRecoveryList = obj({
  items: { type: 'array', items: ref('GoogleLessonRecovery') },
})
route('/integrations/google/lessons', 'get', 'GoogleLessonRecoveryList')
route('/integrations/google/lessons/{id}/calendar', 'get', 'CalendarReview')
route(
  '/integrations/google/lessons/{id}/retry',
  'post',
  'OK',
  obj({ calendarETag: s, calendarMissing: b }, []),
)
for (const path of [
  '/integrations/google/lessons/{id}/calendar',
  '/integrations/google/lessons/{id}/retry',
]) {
  const operation = Object.values(spec.paths[path])[0]
  operation.parameters = [{ name: 'id', in: 'path', required: true, schema: s }]
}
route('/staff/applications/{id}/meeting/calendar', 'get', 'CalendarReview')
route('/applications/{id}/interview/join', 'get', 'OK')
spec.paths['/applications/{id}/interview/join'].get.responses = {
  303: { description: 'Authorized redirect to the provider-confirmed meeting' },
  default: spec.paths['/me'].get.responses.default,
}
spec.paths['/applications/{id}/interview/join'].get.parameters = [
  { name: 'id', in: 'path', required: true, schema: s },
]
spec.paths['/staff/applications/{id}/meeting/calendar'].get.parameters = [
  { name: 'id', in: 'path', required: true, schema: s },
]
const retry = spec.paths['/staff/applications/{id}/meeting/retry'].post
retry.summary =
  'Retry a failed provider operation; explicitly accept a reviewed Calendar ETag when required'
retry.requestBody.content['application/json'].schema.properties.calendarETag = s
// Absolute callback path uses the existing cookie session and single-use OAuth state, not a new authentication system.
spec.paths['/integrations/google/callback'] = {
  get: {
    summary: 'Google callback at /api/integrations/google/callback',
    servers: [{ url: '/api' }],
    security: [{ session: [] }],
    parameters: [
      { name: 'state', in: 'query', required: true, schema: s },
      { name: 'code', in: 'query', schema: s },
      { name: 'error', in: 'query', schema: s },
    ],
    responses: {
      303: { description: 'Redirect to the initiating host workspace with a fixed outcome code' },
      default: spec.paths['/me'].get.responses.default,
    },
  },
}
writeFileSync(path, JSON.stringify(spec, null, 2) + '\n')
