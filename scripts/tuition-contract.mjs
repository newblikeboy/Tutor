export function tuitionContract(schemas, route) {
  const str = { type: 'string' },
    integer = { type: 'integer' },
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
  const nullable = (name) => ({ anyOf: [ref(name), { type: 'null' }] })
  const input = (properties, required) => ({
    type: 'object',
    additionalProperties: false,
    required,
    properties,
  })
  Object.assign(schemas, {
    Message: obj({
      id: str,
      enrollmentId: str,
      authorName: str,
      authorRole: str,
      body: str,
      createdAt: date,
    }),
    MessageInput: obj({ body: str }),
    MessagePage: obj({ items: array('Message'), nextCursor: str }),
    Notification: obj({ id: str, kind: str, targetId: str, read: bool, createdAt: date }),
    NotificationPage: obj({ items: array('Notification'), nextCursor: str }),
    WeeklyWindow: obj({ day: integer, startMinute: integer, endMinute: integer }),
    Availability: obj({
      tutorId: str,
      timezone: str,
      windows: array('WeeklyWindow'),
      leaveDates: { type: 'array', items: str },
      bufferMinutes: integer,
      dailyCapacity: integer,
      paused: bool,
      feePaise: integer,
      version: integer,
      feePlans: array('FeePlan'),
      feePlan: { anyOf: [ref('FeePlan'), { type: 'null' }] },
      feeVersion: integer,
    }),
    RecurrenceInput: obj({
      startDate: str,
      time: str,
      timezone: str,
      weekdays: { type: 'array', items: integer },
      count: integer,
      minutes: integer,
    }),
    Agreement: obj({
      id: str,
      enrollmentId: str,
      version: integer,
      tutorId: str,
      subject: str,
      mode: str,
      timezone: str,
      sessionCount: integer,
      minutes: integer,
      starts: { type: 'array', items: date },
      feePerSessionPaise: integer,
      totalPaise: integer,
      currency: str,
      cancellationHours: integer,
      terms: str,
      termsVersion: str,
      createdAt: date,
    }),
    Enrollment: obj({
      paymentSimulated: bool,
      paymentIntentId: str,
      id: str,
      trialId: str,
      learnerId: str,
      learnerName: str,
      class: integer,
      tutorId: str,
      tutorName: str,
      mentorId: str,
      status: str,
      agreement: ref('Agreement'),
      planVersion: integer,
      version: integer,
      holdUntil: { anyOf: [date, { type: 'null' }] },
      createdAt: date,
    }),
    EnrollmentPage: obj({ items: array('Enrollment'), nextCursor: str }),
    EnrollmentInput: obj({
      trialId: str,
      subjects: {
        type: 'array',
        items: {
          type: 'string',
          minLength: 2,
          maxLength: 80,
        },
        minItems: 1,
        maxItems: 20,
        uniqueItems: true,
      },
      schedule: ref('RecurrenceInput'),
      packageMode: str,
      packagePeriod: str,
      offeringVersion: integer,
      feeVersion: integer,
      accepted: { const: true },
    }),
    EnrollmentAction: input(
      {
        action: { type: 'string', enum: ['accept', 'accept_booking', 'resume', 'cancel'] },
        version: integer,
        reason: str,
      },
      ['action', 'version'],
    ),
    ScheduleProposal: obj({ start: date, by: str, reason: str }),
    ClassSession: obj({
      id: str,
      enrollmentId: str,
      tutorId: str,
      start: date,
      end: date,
      bufferMinutes: integer,
      status: str,
      timezone: str,
      notes: str,
      homework: str,
      review: str,
      attendance: str,
      reason: str,
      version: integer,
      proposal: nullable('ScheduleProposal'),
    }),
    ClassAction: input(
      {
        action: {
          type: 'string',
          enum: ['propose', 'accept_change', 'cancel', 'record', 'complete', 'resolve_attendance'],
        },
        version: integer,
        start: date,
        reason: str,
        notes: str,
        homework: str,
        attendance: str,
        developmentRecord: bool,
        homeworkGiven: bool,
      },
      ['action', 'version'],
    ),
    LearningTopic: obj({
      title: str,
      status: { type: 'string', enum: ['introduced', 'practising', 'independent', 'needs_review'] },
      evidence: str,
      practice: str,
    }),
    LearningPlan: obj({
      id: str,
      enrollmentId: str,
      version: integer,
      startingPoint: str,
      goals: str,
      topics: array('LearningTopic'),
      nextSteps: str,
      reviewDate: date,
      authorId: str,
      createdAt: date,
    }),
    LearningPlanInput: obj({
      expectedVersion: integer,
      startingPoint: str,
      goals: str,
      topics: array('LearningTopic'),
      nextSteps: str,
      reviewDate: date,
    }),
    Handover: obj({
      id: str,
      enrollmentId: str,
      oldTutorId: str,
      newTutorId: str,
      reason: str,
      nextSteps: str,
      status: str,
      familyConsentAt: date,
      createdAt: date,
    }),
    HandoverInput: obj({ tutorId: str, reason: str, consent: { const: true } }),
    HandoverAction: input(
      {
        action: { type: 'string', enum: ['prepare', 'cancel', 'decline', 'accept'] },
        nextSteps: str,
      },
      ['action'],
    ),
    HandoverInvitation: obj({
      handover: ref('Handover'),
      agreement: ref('Agreement'),
      class: integer,
    }),
    TuitionDetail: obj({
      enrollment: ref('Enrollment'),
      sessions: array('ClassSession'),
      plans: array('LearningPlan'),
      agreements: array('Agreement'),
      handovers: array('Handover'),
      remaining: integer,
      delivered: integer,
    }),
  })
  const content = { title: str, body: str, privacy: str, education: str }
  schemas.TeachingAgreementContent = obj(content)
  schemas.TeachingAgreementVersion = obj({
    ...content,
    mode: str,
    version: integer,
    publishedAt: date,
  })
  schemas.TeachingAgreementDraft = obj({
    mode: str,
    version: integer,
    draft: ref('TeachingAgreementContent'),
    published: nullable('TeachingAgreementVersion'),
  })
  schemas.TeachingAgreementPage = obj({ items: array('TeachingAgreementDraft') })
  schemas.TeachingAgreementInput = obj({
    version: integer,
    action: { type: 'string', enum: ['save', 'publish'] },
    content: ref('TeachingAgreementContent'),
  })
  schemas.TutorBookingSignature = obj({
    tutorId: str,
    name: str,
    email: str,
    documentHash: str,
    signedAt: date,
  })
  schemas.TutorBookingAgreement = obj({
    ...content,
    mode: str,
    version: integer,
    publishedAt: date,
    documentHash: str,
    signature: nullable('TutorBookingSignature'),
  })
  schemas.Enrollment.properties.tutorAgreement = ref('TutorBookingAgreement')
  schemas.ClassSession.properties.homeworkGiven = bool
  schemas.BookingSigningInput = obj({
    version: integer,
    documentHash: str,
    accepted: { const: true },
  })
  schemas.BookingSignatureInput = obj({
    version: integer,
    documentHash: str,
    accepted: { const: true },
    challengeId: str,
    code: { type: 'string', pattern: '^[0-9]{6}$' },
  })
  schemas.ClassCompletionReport = obj({
    version: integer,
    reason: { type: 'string', minLength: 10, maxLength: 2000 },
  })
  route('/admin/teaching-agreements', 'get', 'TeachingAgreementPage')
  route(
    '/admin/teaching-agreements/{mode}',
    'put',
    'TeachingAgreementDraft',
    'TeachingAgreementInput',
  )
  route('/enrollments/{id}/signing-code', 'post', 'EmailChallenge', 'BookingSigningInput')
  route('/enrollments/{id}/signature', 'post', 'OK', 'BookingSignatureInput')
  route('/classes/{id}/report', 'post', 'ServiceCase', 'ClassCompletionReport')
  schemas.Agreement.properties.subjects = {
    type: 'array',
    items: {
      type: 'string',
      minLength: 2,
      maxLength: 80,
    },
    minItems: 1,
    maxItems: 20,
    uniqueItems: true,
  }
  schemas.Agreement.properties.packageFeePaise = { type: 'integer', minimum: 0 }
  schemas.RecurrenceInput.description =
    'Class-count recurrence on available teaching weekdays at the selected time, skipping planned leave. All classes must be within the six-month scheduling horizon and current tutor approval. Weekly and monthly packages have no calendar-period deadline.'
  route('/availability', 'get', 'Availability')
  route('/enrollments/{id}/messages', 'get', 'MessagePage')
  route('/enrollments/{id}/messages', 'post', 'Message', 'MessageInput')
  route('/notifications', 'get', 'NotificationPage')
  route('/notifications/{id}/read', 'post', 'OK')
  route('/availability', 'put', 'Availability', 'Availability')
  route('/tutors/{id}/availability', 'get', 'Availability', null, true)
  route('/enrollments', 'get', 'EnrollmentPage')
  route('/enrollments', 'post', 'Enrollment', 'EnrollmentInput')
  route('/enrollments/{id}', 'get', 'TuitionDetail')
  route('/enrollments/{id}/action', 'post', 'OK', 'EnrollmentAction')
  route('/classes/{id}/action', 'post', 'OK', 'ClassAction')
  route('/enrollments/{id}/plans', 'post', 'LearningPlan', 'LearningPlanInput')
  route('/enrollments/{id}/handovers', 'post', 'Handover', 'HandoverInput')
  route('/handovers/invitations', 'get', 'HandoverInvitation', null, false, true)
  route('/handovers/{id}/action', 'post', 'OK', 'HandoverAction')
}
