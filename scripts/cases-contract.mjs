export function casesContract(schemas, route) {
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
    CaseMessage: obj({ id: s, caseId: s, authorName: s, authorRole: s, body: s, createdAt: date }),
    CaseMessagePage: obj({ items: array('CaseMessage'), nextCursor: s }),
    CasePage: obj({ items: array('ServiceCase'), nextCursor: s }),
    CaseDetail: obj({ case: ref('ServiceCase'), messages: ref('CaseMessagePage') }),
  })
  route('/cases', 'get', 'CasePage')
  route('/cases', 'post', 'ServiceCase', 'CaseInput')
  route('/cases/{id}', 'get', 'CaseDetail')
  route('/cases/{id}/action', 'post', 'OK', 'CaseAction')
}
