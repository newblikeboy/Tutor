export function progressContract(schemas, route) {
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
