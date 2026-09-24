export function applicationContract(schemas, route) {
  const s = { type: 'string' },
    n = { type: 'integer' },
    b = { type: 'boolean' }
  const ref = (name) => ({ $ref: `#/components/schemas/${name}` })
  const array = (items) => ({ type: 'array', items })
  const obj = (properties) => ({
    type: 'object',
    additionalProperties: false,
    required: Object.keys(properties),
    properties,
  })
  const nullable = (name) => ({ anyOf: [ref(name), { type: 'null' }] })
  const strings = (names) => Object.fromEntries(names.split(' ').map((k) => [k, s]))
  schemas.ApplicantAbout = obj({
    ...strings('fullName displayName mobile city locality pin photoFileId'),
    communicationLanguages: array(s),
  })
  schemas.ApplicantEducation = obj({
    ...strings(
      'qualification specialisation institution pursuing programme currentInstitution currentStage expectedCompletion additional summary occupation outsideWork resumeFileId',
    ),
    completionYear: n,
    newToTutoring: b,
    experienceYears: n,
    experienceMonths: n,
    settings: array(s),
    educationFileIds: { ...array(s), type: ['array', 'null'], maxItems: 6, uniqueItems: true },
  })
  schemas.RequestedTeachingArea = obj({
    ...strings('id subject priorExperience'),
    minClass: n,
    maxClass: n,
    boards: array(s),
    languages: array(s),
    modes: array(s),
  })
  schemas.ApplicationSlot = obj({ day: n, start: s, end: s })
  schemas.HomeTeachingRequest = obj({
    localities: array(s),
    travelKm: n,
    charges: s,
    bufferMinutes: n,
  })
  schemas.OnlineTeachingRequest = obj(
    strings('device camera microphone internet privateSpace screenSharing digitalWriting'),
  )
  schemas.ApplicantAvailability = obj({
    ...strings('timezone earliestStart period untilDate interruptions'),
    slots: array(ref('ApplicationSlot')),
    weeklyHours: n,
    maxStudents: n,
    durations: array(n),
    home: ref('HomeTeachingRequest'),
    online: ref('OnlineTeachingRequest'),
  })
  schemas.ApplicantApproach = obj({
    ...strings(
      'introduction scenario understanding demonstration demoAreaId demoTopic demoFileId worksheetFileId',
    ),
    assessmentSlots: array(ref('ApplicationSlot')),
  })
  schemas.ExpectedRate = obj({ areaId: s, mode: s, amountPaise: n })
  schemas.ApplicantFees = obj({
    preference: s,
    sessionMinutes: n,
    rates: array(ref('ExpectedRate')),
    comments: s,
  })
  schemas.ApplicantDeclarations = obj({
    accuracy: b,
    conduct: b,
    dataUse: b,
    marketing: b,
    noticeVersion: s,
  })
  schemas.TutorApplication = obj({
    schemaVersion: n,
    about: ref('ApplicantAbout'),
    education: ref('ApplicantEducation'),
    teachingAreas: array(ref('RequestedTeachingArea')),
    firstAreaId: s,
    availability: ref('ApplicantAvailability'),
    approach: ref('ApplicantApproach'),
    fees: ref('ApplicantFees'),
    declarations: ref('ApplicantDeclarations'),
  })
  schemas.ApplicationReceipt = obj({
    noticeVersion: s,
    at: { ...s, format: 'date-time' },
    marketing: b,
  })
  schemas.EligibilityReview = obj({
    status: s,
    reason: s,
    reviewerId: s,
    reviewedAt: { type: ['string', 'null'], format: 'date-time' },
  })
  const fields = {
    profile: nullable('TutorApplication'),
    formVersion: n,
    formStep: n,
    submission: nullable('ApplicationReceipt'),
    eligibility: nullable('EligibilityReview'),
  }
  Object.assign(schemas.Application.properties, fields)
  schemas.Application.required.push(...Object.keys(fields))
  schemas.OwnApplication = obj({ application: nullable('Application'), noticeVersion: s })
  schemas.ApplicationInput = obj({
    version: { ...n, minimum: 0 },
    step: { ...n, minimum: 0, maximum: 6 },
    submit: b,
    profile: ref('TutorApplication'),
  })
  schemas.Error.properties.fieldErrors = { type: 'object', additionalProperties: s }
  schemas.DecisionInput.properties.action.enum.push('eligibility')
  schemas.StaffEvent.properties.eligibility = nullable('EligibilityReview')
  schemas.DecisionInput.properties.eligibility = { ...s, enum: ['cleared', 'blocked'] }
  route('/application', 'get', 'OwnApplication')
}
