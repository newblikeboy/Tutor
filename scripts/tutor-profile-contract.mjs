export function tutorProfileContract(schemas, route, paths) {
  schemas.Application.properties.teachingLocation = { $ref: '#/components/schemas/LocationPoint' }
  const s = { type: 'string' },
    n = { type: 'integer' },
    b = { type: 'boolean' },
    date = { type: 'string', format: 'date-time' }
  const ref = (name) => ({ $ref: `#/components/schemas/${name}` })
  const array = (items) => ({ type: 'array', items })
  const obj = (properties) => ({
    type: 'object',
    additionalProperties: false,
    required: Object.keys(properties),
    properties,
  })
  schemas.TutorPublicProfile = obj({
    introduction: s,
    photoFileId: s,
    introVideoFileId: s,
    publishVideo: b,
    version: n,
    updatedAt: date,
  })
  schemas.Application.properties.publicProfile = ref('TutorPublicProfile')
  const fields = {
    qualification: s,
    institution: s,
    boards: array(s),
    teachingLanguages: array(s),
    experienceMonths: n,
    teachingHoursSet: b,
    bookingModes: array({ type: 'string', enum: ['online', 'home'] }),
  }
  Object.assign(schemas.PublicTutor.properties, fields)
  schemas.PublicTutor.required.push(...Object.keys(fields))
  schemas.OwnTutorProfile = obj({
    profile: ref('TutorPublicProfile'),
    tutor: ref('PublicTutor'),
    files: array(ref('PrivateFile')),
  })
  schemas.TutorProfileInput = obj({
    version: { ...n, minimum: 0 },
    introduction: { ...s, minLength: 40, maxLength: 1200 },
    photoFileId: { ...s, maxLength: 100 },
    introVideoFileId: { ...s, maxLength: 100 },
    publishVideo: b,
  })
  schemas.PublicTrialTime = obj({ start: date, end: date })
  schemas.PublicTrialTimes = obj({
    mode: { ...s, enum: ['online', 'home'] },
    timezone: s,
    slots: array(ref('PublicTrialTime')),
  })
  route('/tutor-profile', 'get', 'OwnTutorProfile')
  route('/tutor-profile', 'put', 'OwnTutorProfile', 'TutorProfileInput')
  route('/tutor-profile/files', 'post', 'PrivateFile', 'ApplicationFileInput')
  route('/tutor-profile/files/upload-intent', 'post', 'DirectUpload', 'DirectFileInput')
  for (const path of ['/tutor-profile/files', '/tutor-profile/files/upload-intent'])
    paths[path].post.parameters.push({
      name: 'Idempotency-Key',
      in: 'header',
      required: true,
      schema: { type: 'string', minLength: 8, maxLength: 100 },
    })
  route('/tutors/{id}/trial-times', 'get', 'PublicTrialTimes', null, true)
  paths['/tutors/{id}/trial-times'].get.parameters.push({
    name: 'mode',
    in: 'query',
    required: true,
    schema: { type: 'string', enum: ['online', 'home'] },
  })
}
