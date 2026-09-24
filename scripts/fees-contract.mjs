export function feesContract(schemas, route) {
  const integer = { type: 'integer' },
    string = { type: 'string' }
  const ref = (name) => ({ $ref: `#/components/schemas/${name}` })
  const nullable = (name) => ({ anyOf: [ref(name), { type: 'null' }] })
  const obj = (properties) => ({
    type: 'object',
    additionalProperties: false,
    properties,
    required: Object.keys(properties),
  })
  const plans = { type: 'array', maxItems: 3, items: ref('FeePlan') }
  schemas.FeePlan = obj({
    mode: { enum: ['online', 'home'] },
    period: { enum: ['hour', 'week', 'month'] },
    amountPaise: { ...integer, minimum: 0, maximum: 10000000 },
    classes: { ...integer, minimum: 1, maximum: 24 },
    minutes: { ...integer, minimum: 30, maximum: 120 },
  })
  schemas.TutorFees = obj({
    plans,
    version: integer,
    setBy: string,
    setAt: { type: 'string', format: 'date-time' },
  })
  for (const name of ['Application', 'StaffEvent']) {
    schemas[name].properties.fees = nullable('TutorFees')
    schemas[name].required.push('fees')
  }
  schemas.PublicTutor.properties.feePlans = plans
  schemas.PublicTutor.required.push('feePlans')
  schemas.DecisionInput.properties.action.enum.push('fees')
  schemas.DecisionInput.properties.feePlans = plans
  Object.assign(schemas.Availability.properties, {
    feePlan: nullable('FeePlan'),
    feeVersion: integer,
  })
  schemas.Availability.required.push('feePlan', 'feeVersion')
  schemas.AvailabilityInput = obj(
    Object.fromEntries(
      Object.entries(schemas.Availability.properties).filter(
        ([key]) => !['tutorId', 'feePaise', 'feePlan', 'feeVersion'].includes(key),
      ),
    ),
  )
  route('/availability', 'put', 'Availability', 'AvailabilityInput')
  schemas.EnrollmentInput.properties.feeVersion = integer
  schemas.EnrollmentInput.required.push('feeVersion')
}
