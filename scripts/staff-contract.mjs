export function staffContract(schemas, route, paths) {
  const s = { type: 'string' },
    n = { type: 'integer' },
    b = { type: 'boolean' }
  const date = { type: 'string', format: 'date-time' }
  const ref = (name) => ({ $ref: `#/components/schemas/${name}` })
  const obj = (properties) => ({
    type: 'object',
    additionalProperties: false,
    required: Object.keys(properties),
    properties,
  })
  const page = (name) => obj({ items: { type: 'array', items: ref(name) }, nextCursor: s })
  schemas.Interview = obj({ start: date, end: date, timezone: s, joinUrl: s, status: s })
  const nullableInterview = { anyOf: [ref('Interview'), { type: 'null' }] }
  Object.assign(schemas.Application.properties, {
    interview: nullableInterview,
    conflictClear: b,
    mentorId: s,
  })
  schemas.Application.required.push('interview', 'conflictClear', 'mentorId')
  Object.assign(schemas, {
    StaffMember: obj({ id: s, name: s, role: s }),
    StaffMembers: page('StaffMember'),
    StaffApplications: page('Application'),
    StaffOverview: obj({
      counts: { type: 'object', additionalProperties: n },
      upcoming: { type: 'array', items: ref('Application') },
      followups: n,
    }),
    StaffDetail: obj({ application: ref('Application'), email: s, assessor: ref('StaffMember') }),
    StaffEvent: obj({
      ...schemas.Event.properties,
      actorName: s,
      reason: s,
      fromStatus: s,
      toStatus: s,
      interview: nullableInterview,
      scores: { anyOf: [{ type: 'array', items: n }, { type: 'null' }] },
      evidence: s,
      scope: { anyOf: [ref('Scope'), { type: 'null' }] },
    }),
    StaffEvents: page('StaffEvent'),
    TutorFollowup: obj({
      id: s,
      status: s,
      tutorId: s,
      tutorName: s,
      reason: s,
      resolution: s,
      version: n,
      createdAt: date,
      trials: n,
      enrollments: n,
    }),
    TutorFollowups: page('TutorFollowup'),
    ResolveFollowup: obj({
      version: n,
      reason: { ...s, minLength: 10, maxLength: 1000 },
      confirmed: b,
    }),
    DecisionInput: {
      type: 'object',
      additionalProperties: false,
      required: ['action', 'version'],
      properties: {
        action: {
          type: 'string',
          enum: [
            'review',
            'assign',
            'confirm_conflict',
            'schedule',
            'reschedule',
            'cancel_interview',
            'no_show',
            'assess',
            'approve',
            'improve',
            'decline',
            'suspend',
            'reinstate',
            'terminate',
            'reopen',
            'note',
          ],
        },
        version: n,
        reason: s,
        evidence: s,
        scores: { type: 'array', items: n },
        minClass: n,
        maxClass: n,
        assessorId: s,
        mentorId: s,
        conflictClear: b,
        interview: ref('Interview'),
      },
    },
  })
  route('/staff/overview', 'get', 'StaffOverview')
  route('/staff/applications', 'get', 'StaffApplications')
  route('/staff/applications/{id}', 'get', 'StaffDetail')
  route('/staff/members', 'get', 'StaffMembers')
  route('/staff/events', 'get', 'StaffEvents')
  route('/staff/followups', 'get', 'TutorFollowups')
  route('/staff/followups/{id}/resolve', 'post', 'OK', 'ResolveFollowup')
  for (const [path, names] of [
    ['/staff/applications', ['kind', 'status', 'q', 'assignee', 'cursor']],
    ['/staff/members', ['cursor']],
    ['/staff/events', ['application', 'cursor']],
    ['/staff/followups', ['status', 'cursor']],
  ]) {
    paths[path].get.parameters.push(
      ...names.map((name) => ({ name, in: 'query', required: false, schema: s })),
    )
  }
}
