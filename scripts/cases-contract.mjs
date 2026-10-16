export function casesContract(schemas, route, paths) {
  const s = { type: 'string' },
    i = { type: 'integer' },
    b = { type: 'boolean' },
    date = { type: 'string', format: 'date-time' }
  const ref = (name) => ({ $ref: `#/components/schemas/${name}` }),
    array = (name) => ({ type: 'array', items: ref(name) }),
    obj = (properties) => ({
      type: 'object',
      additionalProperties: false,
      required: Object.keys(properties),
      properties,
    })
  const message = obj({
    id: s,
    caseId: s,
    authorName: s,
    authorRole: s,
    body: s,
    createdAt: date,
    fromRequester: b,
  })
  message.properties.action = {
    type: 'string',
    enum: ['reply', 'resolve', 'waiting_family', 'reopen'],
  }
  Object.assign(schemas, {
    ServiceCase: obj({
      id: s,
      kind: s,
      title: s,
      body: s,
      status: s,
      assignedTo: s,
      version: i,
      createdAt: date,
      updatedAt: date,
      restricted: b,
      canReply: b,
      canManage: b,
      canClaim: b,
      canReopen: b,
    }),
    CaseInput: obj({
      kind: {
        type: 'string',
        enum: [
          'support',
          'matching',
          'privacy_access',
          'privacy_correction',
          'privacy_deletion',
          'safeguarding',
        ],
      },
      title: s,
      body: s,
    }),
    CaseAction: obj({
      action: { type: 'string', enum: ['claim', 'reply', 'resolve', 'waiting_family', 'reopen'] },
      version: i,
      body: s,
    }),
    CaseMessage: message,
    CaseMessagePage: obj({ items: array('CaseMessage'), nextCursor: s }),
    CasePage: obj({
      items: array('ServiceCase'),
      nextCursor: s,
      counts: obj({ all: i, active: i, waiting_family: i, resolved: i }),
    }),
    CaseDetail: obj({ case: ref('ServiceCase'), messages: ref('CaseMessagePage') }),
  })
  route('/cases', 'get', 'CasePage')
  paths['/cases'].get.parameters.push(
    {
      name: 'status',
      in: 'query',
      schema: { type: 'string', enum: ['all', 'active', 'waiting_family', 'resolved'] },
    },
    { name: 'kind', in: 'query', schema: schemas.CaseInput.properties.kind },
    { name: 'q', in: 'query', schema: { type: 'string', maxLength: 120 } },
    { name: 'cursor', in: 'query', schema: { type: 'string', maxLength: 512 } },
  )
  route('/cases', 'post', 'ServiceCase', 'CaseInput')
  route('/cases/{id}', 'get', 'CaseDetail')
  route('/cases/{id}/action', 'post', 'OK', 'CaseAction')
}
