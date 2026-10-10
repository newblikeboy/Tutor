export function progressContract(schemas, route, paths) {
  const string = { type: 'string' }
  const date = { type: 'string', format: 'date-time' }
  const ref = (name) => ({ $ref: `#/components/schemas/${name}` })
  const array = (name) => ({ type: 'array', items: ref(name) })
  const obj = (properties, required = Object.keys(properties)) => ({
    type: 'object',
    additionalProperties: false,
    required,
    properties,
  })
  paths['/enrollments'].get.parameters.push({
    name: 'history',
    in: 'query',
    required: false,
    schema: { type: 'string', enum: ['0', '1'] },
    description:
      'Tutor-only current or completed/cancelled package history, filtered before pagination.',
  })
  schemas.ClassAction.description =
    'Present recording requires progress; tests are optional. Progress corrections close seven days after recording, and planning is limited to booked, approved subjects.'
  schemas.Notification.properties.readAt = date
  schemas.LessonMeeting = obj({ status: { type: 'string', enum: ['pending', 'ready', 'failed'] } })
  schemas.ClassSession.properties.plannedSubject = string
  schemas.ClassSession.properties.recordedAt = date
  schemas.ClassSession.properties.meeting = ref('LessonMeeting')
  schemas.Trial.properties.meeting = ref('LessonMeeting')
  schemas.Trial.properties.version = { type: 'integer' }
  schemas.Trial.properties.completedAt = date
  schemas.ActionInput.properties.version = { type: 'integer' }
  schemas.ActionInput.properties.action.enum.push('feedback')
  schemas.ClassAction.properties.action.enum.push('plan_subject')
  schemas.ClassAction.properties.subject = string
  schemas.TutorLearnerBrief = obj({ learnerId: string, location: ref('LocationPoint') }, [
    'learnerId',
  ])
  schemas.TutorWorkspace = obj({
    briefs: array('TutorLearnerBrief'),
    learners: array('Learner'),
    enrollments: array('Enrollment'),
    sessions: array('ClassSession'),
    trials: array('Trial'),
    notifications: array('Notification'),
  })
  schemas.MeetingPrepare = obj({ version: { type: 'integer', minimum: 0 } })
  schemas.MeetingJoin = obj({ joinUrl: { type: 'string', format: 'uri' } })
  route('/tutor/workspace', 'get', 'TutorWorkspace')
  route('/tutor/learners/{id}/progress', 'get', 'LearnerProgress')
  for (const kind of ['classes', 'trials']) {
    route(`/${kind}/{id}/meeting`, 'post', 'OK', 'MeetingPrepare')
    route(`/${kind}/{id}/meeting/join`, 'get', 'MeetingJoin')
  }
  schemas.TestResult = obj({
    title: { type: 'string', minLength: 2, maxLength: 160 },
    score: { type: 'integer', minimum: 0, maximum: 10000 },
    maximum: { type: 'integer', minimum: 1, maximum: 10000 },
  })
  schemas.ClassProgressInput = obj(
    {
      subject: string,
      topics: { ...array('LearningTopic'), minItems: 1, maxItems: 10 },
      homeworkStatus: {
        type: 'string',
        enum: ['not_checked', 'assigned', 'completed', 'needs_help'],
      },
      test: ref('TestResult'),
      feedback: { type: 'string', minLength: 5, maxLength: 2000 },
      nextSteps: { type: 'string', minLength: 5, maxLength: 1200 },
    },
    ['subject', 'topics', 'homeworkStatus', 'feedback', 'nextSteps'],
  )
  schemas.ClassProgress = obj({ ...schemas.ClassProgressInput.properties, recordedAt: date }, [
    ...schemas.ClassProgressInput.required,
    'recordedAt',
  ])
  schemas.ClassSession.properties.progress = ref('ClassProgress')
  schemas.ClassAction.properties.action.enum.push('progress')
  schemas.ClassAction.properties.progress = ref('ClassProgressInput')
  for (const [name, base, extra] of [
    [
      'ProgressSession',
      'ClassSession',
      { tutorName: string, subjects: { type: 'array', items: string } },
    ],
    ['ProgressTrial', 'Trial', { tutorName: string }],
    [
      'ProgressPlan',
      'LearningPlan',
      { authorName: string, subjects: { type: 'array', items: string } },
    ],
  ]) {
    schemas[name] = obj({ ...schemas[base].properties, ...extra }, [
      ...schemas[base].required,
      ...Object.keys(extra),
    ])
  }
  schemas.LearnerProgress = obj({
    enrollments: array('Enrollment'),
    sessions: array('ProgressSession'),
    trials: array('ProgressTrial'),
    plans: array('ProgressPlan'),
    handovers: array('Handover'),
  })
  route('/learners/{id}/progress', 'get', 'LearnerProgress')
}
