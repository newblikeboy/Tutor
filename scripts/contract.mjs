// Contract authoring tool. Generates JSON-compatible YAML; never serves API requests.
import { mkdir, writeFile } from 'node:fs/promises'
import { tuitionContract } from './tuition-contract.mjs'
import { inboxContract } from './inbox-contract.mjs'
import { billingContract } from './billing-contract.mjs'
import { casesContract } from './cases-contract.mjs'
import { accountContract } from './account-contract.mjs'
import { mediaContract } from './media-contract.mjs'
import { staffContract } from './staff-contract.mjs'
import { applicationContract } from './application-contract.mjs'
import { feesContract } from './fees-contract.mjs'
const str = { type: 'string' },
  num = { type: 'integer' },
  bool = { type: 'boolean' },
  date = { type: 'string', format: 'date-time' }
const ref = (name) => ({ $ref: `#/components/schemas/${name}` })
const array = (name) => ({ type: 'array', items: ref(name) })
const obj = (properties) => ({
  type: 'object',
  additionalProperties: false,
  required: Object.keys(properties),
  properties,
})
const schemas = {
  User: obj({
    id: str,
    name: str,
    role: { type: 'string', enum: ['parent', 'tutor', 'mentor', 'admin', 'support', 'finance'] },
    sample: bool,
  }),
  Scope: obj({ subject: str, minClass: num, maxClass: num, mode: str, expiresAt: date }),
  PublicTutor: obj({
    id: str,
    name: str,
    approach: str,
    language: str,
    experience: num,
    scope: ref('Scope'),
    assessmentAt: date,
    sample: bool,
  }),
  Application: obj({
    id: str,
    name: str,
    education: str,
    approach: str,
    language: str,
    experience: num,
    status: str,
    scope: ref('Scope'),
    assessorId: str,
    assessmentAt: date,
    scores: { type: 'array', items: num },
    reason: str,
    evidence: str,
    sample: bool,
    updatedAt: date,
    version: num,
  }),
  Learner: obj({ id: str, name: str, class: num, board: str, language: str, kind: str }),
  Requirement: obj({
    id: str,
    learnerId: str,
    subject: str,
    goal: str,
    locality: str,
    status: str,
    createdAt: date,
  }),
  Trial: obj({
    id: str,
    learnerId: str,
    requirementId: str,
    tutorId: str,
    mentorId: str,
    learnerName: str,
    subject: str,
    class: num,
    start: date,
    end: date,
    status: str,
    feePaise: num,
    termsVersion: str,
    terms: str,
    notes: str,
    nextSteps: str,
    review: str,
    createdAt: date,
  }),
  Draft: obj({ step: num, learnerId: str, goal: str, locality: str }),
  Event: obj({ id: str, actor: str, action: str, target: str, at: date }),
  Dashboard: obj({
    user: ref('User'),
    learners: array('Learner'),
    requirements: array('Requirement'),
    trials: array('Trial'),
    applications: array('Application'),
    events: array('Event'),
    draft: { anyOf: [ref('Draft'), { type: 'null' }] },
  }),
  Config: obj({
    appName: str,
    development: bool,
    authEnabled: bool,
    trialFeePaise: num,
    payments: str,
    timezone: str,
    uploadsEnabled: bool,
    scannerConfigured: bool,
    mediaProvider: { type: 'string' },
  }),
  Auth: obj({ user: ref('User'), csrf: str }),
  AuthSession: { anyOf: [ref('Auth'), { type: 'null' }] },
  Consent: obj({
    id: str,
    ownerId: str,
    relationship: str,
    version: str,
    at: date,
    verification: str,
  }),
  Error: obj({
    code: str,
    message: str,
    fieldErrors: { type: 'object', additionalProperties: str },
    requestId: str,
  }),
  OK: obj({ ok: bool }),
  Health: obj({ status: str }),
  LoginInput: obj({
    email: { ...str, format: 'email', maxLength: 254 },
    password: { ...str, maxLength: 512 },
  }),
  SignupInput: obj({
    name: { ...str, minLength: 2, maxLength: 80 },
    email: { ...str, format: 'email', maxLength: 254 },
    password: { ...str, minLength: 8, maxLength: 128 },
    role: { type: 'string', enum: ['parent', 'tutor'] },
    adult: { const: true },
  }),
  ApplicationInput: obj({
    name: str,
    education: str,
    approach: str,
    language: { type: 'string', enum: ['Hindi', 'English'] },
    experience: num,
    submit: bool,
  }),
  DecisionInput: obj({
    action: {
      type: 'string',
      enum: ['review', 'schedule', 'assess', 'approve', 'improve', 'decline', 'suspend'],
    },
    reason: str,
    evidence: str,
    scores: { type: 'array', items: num },
    minClass: num,
    maxClass: num,
  }),
  ConsentInput: obj({
    relationship: { type: 'string', enum: ['parent', 'legal_guardian'] },
    accepted: bool,
  }),
  LearnerInput: obj({
    name: str,
    class: num,
    board: str,
    language: str,
    kind: { type: 'string', enum: ['minor', 'adult_self'] },
    consentId: str,
  }),
  RequirementInput: obj({ learnerId: str, goal: str, locality: str }),
  TrialInput: obj({ requirementId: str, tutorId: str, start: date, termsAccepted: bool }),
  ActionInput: obj({
    action: { type: 'string', enum: ['accept', 'decline', 'cancel', 'complete', 'review'] },
    notes: str,
    nextSteps: str,
    review: str,
  }),
}
schemas.Trial.properties.reviewAt = date
schemas.User.properties.email = { ...str, format: 'email' }
const paths = {}
function route(path, method, response, request, publicRoute = false, isArray = false) {
  const operation = {
    operationId: `${method}_${path.replace(/[^a-zA-Z0-9]/g, '_')}`,
    summary: `${method.toUpperCase()} ${path}`,
    security: publicRoute ? [] : [{ session: [] }],
    responses: {
      [method === 'post' &&
      [
        '/auth/signup',
        '/consents',
        '/learners',
        '/requirements',
        '/trials',
        '/enrollments',
        '/enrollments/{id}/plans',
        '/enrollments/{id}/handovers',
        '/billing/{id}/refunds',
        '/cases',
        '/enrollments/{id}/messages',
        '/enrollments/{id}/files',
        '/applications/{id}/files',
      ].includes(path)
        ? '201'
        : '200']: {
        description: 'Success',
        content: { 'application/json': { schema: isArray ? array(response) : ref(response) } },
      },
      default: {
        description:
          'Structured error. 401 login, 403 permission/CSRF, 404 unavailable, 409 conflict, 422 validation, 429 limit, 503 provider/DB unavailable.',
        content: { 'application/json': { schema: ref('Error') } },
      },
    },
  }
  operation.parameters = []
  if (path.includes('{id}'))
    operation.parameters.push({ name: 'id', in: 'path', required: true, schema: str })
  if (path === '/tutors')
    for (const name of ['subject', 'language'])
      operation.parameters.push({ name, in: 'query', schema: str })
  if (
    [
      '/enrollments',
      '/billing',
      '/jobs',
      '/notifications',
      '/enrollments/{id}/messages',
      '/cases',
      '/cases/{id}',
      '/account/sessions',
      '/enrollments/{id}/files',
      '/applications/{id}/files',
    ].includes(path) &&
    method === 'get'
  )
    operation.parameters.push({ name: 'cursor', in: 'query', schema: str })
  if (method !== 'get') {
    operation.parameters.push({ name: 'Origin', in: 'header', required: true, schema: str })
    if (!publicRoute)
      operation.parameters.push({ name: 'X-CSRF-Token', in: 'header', required: true, schema: str })
    if (
      [
        '/trials',
        '/cases',
        '/enrollments',
        '/enrollments/{id}/payment',
        '/billing/{id}/refunds',
        '/enrollments/{id}/messages',
        '/enrollments/{id}/files',
        '/applications/{id}/files',
      ].includes(path)
    )
      operation.parameters.push({
        name: 'Idempotency-Key',
        in: 'header',
        required: true,
        schema: { ...str, minLength: 8, maxLength: 100 },
      })
    operation.requestBody = {
      required: true,
      content: { 'application/json': { schema: request ? ref(request) : obj({}) } },
    }
  }
  paths[path] ??= {}
  paths[path][method] = operation
}
route('/health', 'get', 'Health', null, true)
route('/ready', 'get', 'Health', null, true)
route('/config', 'get', 'Config', null, true)
route('/tutors', 'get', 'PublicTutor', null, true, true)
route('/tutors/{id}', 'get', 'PublicTutor', null, true)
route('/auth/signup', 'post', 'Auth', 'SignupInput', true)
route('/auth/login', 'post', 'Auth', 'LoginInput', true)
route('/auth/session', 'get', 'AuthSession', null, true)
route('/me', 'get', 'Auth')
route('/auth/logout', 'post', 'OK')
route('/dashboard', 'get', 'Dashboard')
route('/application', 'put', 'Application', 'ApplicationInput')
route('/applications/{id}/decision', 'post', 'OK', 'DecisionInput')
route('/consents', 'post', 'Consent', 'ConsentInput')
route('/learners', 'post', 'Learner', 'LearnerInput')
route('/learners/{id}', 'get', 'Learner')
route('/draft', 'put', 'Draft', 'Draft')
route('/requirements', 'post', 'Requirement', 'RequirementInput')
route('/trials', 'post', 'Trial', 'TrialInput')
route('/trials/{id}/action', 'post', 'OK', 'ActionInput')
tuitionContract(schemas, route)
billingContract(schemas, route)
casesContract(schemas, route)
accountContract(schemas, route)
mediaContract(schemas, route, paths)
staffContract(schemas, route, paths)
applicationContract(schemas, route)
feesContract(schemas, route)
inboxContract(schemas, route, paths)
paths['/webhooks/razorpay'] = {
  post: {
    operationId: 'razorpayWebhook',
    summary:
      'Verify exact raw-body HMAC, deduplicate the event, and durably queue provider reconciliation',
    security: [],
    parameters: [
      {
        name: 'X-Razorpay-Signature',
        in: 'header',
        required: true,
        schema: { type: 'string', minLength: 64, maxLength: 64 },
      },
      {
        name: 'X-Razorpay-Event-Id',
        in: 'header',
        required: true,
        schema: { type: 'string', minLength: 1, maxLength: 128 },
      },
    ],
    requestBody: {
      required: true,
      content: { 'application/json': { schema: { type: 'object', additionalProperties: true } } },
    },
    responses: {
      200: {
        description: 'Accepted or already stored; this is not a payment-success assertion',
        content: { 'application/json': { schema: ref('OK') } },
      },
      default: {
        description: 'Invalid signature, malformed or conflicting event, or storage unavailable',
        content: { 'application/json': { schema: ref('Error') } },
      },
    },
  },
}
await mkdir('contracts', { recursive: true })
await writeFile(
  'contracts/openapi.yaml',
  JSON.stringify(
    {
      openapi: '3.1.0',
      info: {
        title: 'GyanSetu API',
        version: '0.1.0',
        description:
          'Email/password accounts, supervised trials, ongoing tuition and learning continuity, and explicitly configured Razorpay sandbox billing. Production access remains gated pending operator review. Public registration never grants academic approval. No delivery, live charge or bank settlement is implied by local records.',
      },
      servers: [{ url: '/api/v1' }],
      paths,
      components: {
        securitySchemes: { session: { type: 'apiKey', in: 'cookie', name: 'session' } },
        schemas,
      },
    },
    null,
    2,
  ) + '\n',
)
// Apply recruitment additions every time the base contract is regenerated.
await import('./recruitment-contract.mjs')
