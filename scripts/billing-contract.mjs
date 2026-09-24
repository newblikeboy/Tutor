export function billingContract(schemas, route) {
  const s = { type: 'string' },
    i = { type: 'integer' },
    b = { type: 'boolean' },
    date = { type: 'string', format: 'date-time' }
  const ref = (name) => ({ $ref: `#/components/schemas/${name}` }),
    array = (name) => ({ type: 'array', items: ref(name) })
  const obj = (properties) => ({
    type: 'object',
    additionalProperties: false,
    required: Object.keys(properties),
    properties,
  })
  Object.assign(schemas, {
    PaymentIntent: obj({
      id: s,
      enrollmentId: s,
      amountPaise: i,
      currency: s,
      state: s,
      orderId: s,
      paymentId: s,
      refundReservedPaise: i,
      refundedPaise: i,
      createdAt: date,
    }),
    PaymentPage: obj({ items: array('PaymentIntent'), nextCursor: s }),
    CheckoutInput: obj({ retry: b }),
    Checkout: obj({ intent: ref('PaymentIntent'), keyId: s, sandbox: b }),
    PaymentVerify: obj({ paymentId: s, signature: s }),
    RefundRequest: obj({
      id: s,
      intentId: s,
      amountPaise: i,
      reason: s,
      status: s,
      requestedBy: s,
      reviewedBy: s,
      decision: s,
      providerId: s,
      createdAt: date,
    }),
    RefundInput: obj({ amountPaise: i, reason: s }),
    RefundAction: obj({ action: { type: 'string', enum: ['approve', 'reject'] }, reason: s }),
    LedgerEntry: obj({
      id: s,
      intentId: s,
      amountPaise: i,
      debit: s,
      credit: s,
      reference: s,
      createdAt: date,
    }),
    BillingDetail: obj({
      intent: ref('PaymentIntent'),
      refunds: array('RefundRequest'),
      ledger: array('LedgerEntry'),
      sandbox: b,
    }),
    Job: obj({
      id: s,
      kind: s,
      status: s,
      attempts: i,
      availableAt: date,
      leaseUntil: date,
      lastError: s,
    }),
    JobPage: obj({ items: array('Job'), nextCursor: s }),
    JobRetry: obj({ reason: s }),
  })
  route('/enrollments/{id}/payment', 'post', 'Checkout', 'CheckoutInput')
  route('/billing', 'get', 'PaymentPage')
  route('/billing/{id}', 'get', 'BillingDetail')
  route('/billing/{id}/verify', 'post', 'OK', 'PaymentVerify')
  route('/billing/{id}/reconcile', 'post', 'OK')
  route('/billing/{id}/refunds', 'post', 'RefundRequest', 'RefundInput')
  route('/refunds/{id}/action', 'post', 'OK', 'RefundAction')
  route('/jobs', 'get', 'JobPage')
  route('/jobs/{id}/retry', 'post', 'OK', 'JobRetry')
}
