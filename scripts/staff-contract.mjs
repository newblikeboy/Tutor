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
    StaffMember: obj({ id: s, name: s, role: s, status: s }),
    StaffMembers: page('StaffMember'),
    StaffMemberAction: obj({
      action: { type: 'string', enum: ['activate', 'suspend', 'deactivate', 'delete'] },
      reason: { ...s, minLength: 10, maxLength: 1000 },
    }),
    StaffProvisionInput: obj({
      name: { ...s, minLength: 2, maxLength: 80 },
      email: { ...s, format: 'email', maxLength: 254 },
      password: { ...s, minLength: 8, maxLength: 128 },
      reason: { ...s, minLength: 10, maxLength: 1000 },
    }),
    StaffProvisioned: obj({ member: ref('StaffMember'), email: s }),
    FounderRevenue: obj({ grossPaise: n, refundedPaise: n, netPaise: n }),
    FinanceMonth: obj({
      month: s,
      grossPaise: n,
      refundedPaise: n,
      netPaise: n,
      payments: n,
    }),
    FounderReport: obj({
      metrics: { type: 'object', additionalProperties: n },
      tutorStatus: { type: 'object', additionalProperties: n },
      mentorStatus: { type: 'object', additionalProperties: n },
      enrollmentStatus: { type: 'object', additionalProperties: n },
      refundStatus: { type: 'object', additionalProperties: n },
      revenue: ref('FounderRevenue'),
      monthlyRevenue: { type: 'array', items: ref('FinanceMonth') },
    }),
    AdminEnrollment: obj({
      id: s,
      learnerId: s,
      learnerName: s,
      tutorId: s,
      tutorName: s,
      mentorId: s,
      mentorName: s,
      status: s,
      paymentState: s,
      amountPaise: n,
    }),
    AdminFamily: obj({
      parentId: s,
      parentName: s,
      parentEmail: s,
      sample: b,
      learners: { type: 'array', items: ref('Learner') },
      enrollments: { type: 'array', items: ref('AdminEnrollment') },
      enrollmentStatus: { type: 'object', additionalProperties: n },
      paidEnrollments: n,
      unpaidEnrollments: n,
    }),
    AdminFamilies: page('AdminFamily'),
    MentorTutorReport: obj({
      tutorId: s,
      tutorName: s,
      status: s,
      activeLearners: n,
      reviewedClasses: n,
      missedClasses: n,
      awaitingReviews: n,
    }),
    MentorAssignmentReport: obj({
      enrollmentId: s,
      learnerName: s,
      tutorId: s,
      tutorName: s,
      status: s,
      planVersion: n,
      deliveredClasses: n,
      remainingClasses: n,
      nextReviewDate: s,
    }),
    MentorAcademicReport: obj({
      metrics: { type: 'object', additionalProperties: n },
      tutors: { type: 'array', items: ref('MentorTutorReport') },
      assignments: { type: 'array', items: ref('MentorAssignmentReport') },
    }),
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
        subjects: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['All Subjects', 'Mathematics', 'Science', 'English', 'Hindi', 'Social Science'],
          },
          minItems: 1,
          maxItems: 6,
          uniqueItems: true,
        },
        minClass: { ...n, minimum: 1, maximum: 12 },
        maxClass: { ...n, minimum: 1, maximum: 12 },
        mode: s,
        modes: { type: 'array', items: { type: 'string', enum: ['online', 'home'] } },
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
  route('/staff/members', 'post', 'StaffProvisioned', 'StaffProvisionInput')
  route('/staff/members/{id}/action', 'post', 'OK', 'StaffMemberAction')
  route('/staff/events', 'get', 'StaffEvents')
  route('/staff/followups', 'get', 'TutorFollowups')
  route('/staff/followups/{id}/resolve', 'post', 'OK', 'ResolveFollowup')
  route('/staff/academic', 'get', 'MentorAcademicReport')
  route('/admin/founder', 'get', 'FounderReport')
  route('/admin/families', 'get', 'AdminFamilies')
  for (const [path, names] of [
    ['/staff/applications', ['kind', 'status', 'q', 'assignee', 'cursor']],
    ['/staff/members', ['cursor']],
    ['/staff/events', ['application', 'cursor']],
    ['/staff/followups', ['status', 'cursor']],
    ['/admin/families', ['q', 'cursor']],
  ]) {
    paths[path].get.parameters.push(
      ...names.map((name) => ({ name, in: 'query', required: false, schema: s })),
    )
  }
}
