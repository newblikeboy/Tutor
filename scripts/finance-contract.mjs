export function financeContract(schemas, route) {
  const s = { type: 'string' },
    i = { type: 'integer' },
    b = { type: 'boolean' },
    date = { type: 'string', format: 'date-time' }
  const ref = (name) => ({ $ref: `#/components/schemas/${name}` })
  const obj = (properties) => ({
    type: 'object',
    additionalProperties: false,
    required: Object.keys(properties),
    properties,
  })
  const page = (name) => obj({ items: { type: 'array', items: ref(name) }, nextCursor: s })
  Object.assign(schemas, {
    FinancialAmounts: obj(
      Object.fromEntries(
        [
          'grossPaise',
          'tutorNetPaise',
          'platformPaise',
          'gstPaise',
          'tuitionGstPaise',
          'tdsPaise',
          'tcsPaise',
          'gatewayCostPaise',
          'revenuePaise',
          'contributionPaise',
        ].map((key) => [key, i]),
      ),
    ),
    BusinessSettings: obj({
      version: i,
      legalName: s,
      address: s,
      stateCode: s,
      gstin: s,
      sac: s,
      commissionGstBps: i,
      taxPolicy: s,
      reviewed: b,
      updatedBy: s,
      updatedAt: date,
    }),
    TaxReview: obj({
      tuitionGstPaise: i,
      tdsBasePaise: i,
      tdsBps: i,
      tcsBasePaise: i,
      tcsBps: i,
      gatewayCostPaise: i,
      interstate: b,
      reason: s,
    }),
    FinanceBooking: obj({
      id: s,
      enrollmentId: s,
      tutorId: s,
      tutorName: s,
      status: s,
      amounts: ref('FinancialAmounts'),
      reviewedBy: s,
      createdAt: date,
    }),
    ClassEarning: obj({
      id: s,
      intentId: s,
      enrollmentId: s,
      tutorId: s,
      amounts: ref('FinancialAmounts'),
      dueAt: date,
      earnedAt: date,
      batchId: s,
    }),
    PayoutBatch: obj({
      id: s,
      tutorId: s,
      amountPaise: i,
      classIds: { type: 'array', items: s },
      status: s,
      createdBy: s,
      reference: s,
      recordedBy: s,
      confirmedBy: s,
      createdAt: date,
    }),
    PayoutInput: obj({ tutorId: s }),
    EarningHold: obj({
      id: s,
      intentId: s,
      tutorId: s,
      kind: s,
      grossPaise: i,
      reason: s,
      updatedAt: date,
    }),
    PayoutAction: obj({
      action: { type: 'string', enum: ['record', 'confirm'] },
      reference: s,
      paidAt: date,
    }),
  })
  Object.assign(schemas.FinanceBooking.properties, {
    business: ref('BusinessSettings'),
    tax: ref('TaxReview'),
  })
  schemas.InvoiceInput = obj({
    number: s,
    issuerName: s,
    issuerAddress: s,
    issuerGstin: s,
    customerName: s,
    customerAddress: s,
    supplyState: s,
    sac: s,
    description: s,
    gstBps: i,
    issuedAt: date,
    confirmed: b,
  })
  const invoiceProperties = { ...schemas.InvoiceInput.properties }
  delete invoiceProperties.confirmed
  schemas.PaidInvoice = obj({
    ...invoiceProperties,
    id: s,
    totalPaise: i,
    taxablePaise: i,
    cgstPaise: i,
    sgstPaise: i,
    igstPaise: i,
  })
  schemas.BillingDetail.properties.invoice = ref('PaidInvoice')
  route('/billing/{id}/invoice', 'post', 'PaidInvoice', 'InvoiceInput')
  schemas.PayoutBatch.properties.paidAt = date
  for (const name of ['FinanceBooking', 'ClassEarning', 'PayoutBatch', 'EarningHold'])
    schemas[`${name}Page`] = page(name)
  route('/finance/holds', 'get', 'EarningHoldPage')
  route('/finance/classes/{id}/tax', 'post', 'OK', 'TaxReview')
  route('/finance/business', 'get', 'BusinessSettings')
  route('/finance/business', 'put', 'BusinessSettings', 'BusinessSettings')
  route('/finance/bookings', 'get', 'FinanceBookingPage')
  route('/finance/bookings/{id}/tax', 'post', 'OK', 'TaxReview')
  route('/finance/bookings/{id}/reconcile', 'post', 'OK')
  route('/finance/earnings', 'get', 'ClassEarningPage')
  route('/finance/summary', 'get', 'FinancialAmounts')
  route('/finance/payouts', 'get', 'PayoutBatchPage')
  route('/finance/payouts', 'post', 'PayoutBatch', 'PayoutInput')
  route('/finance/payouts/{id}/action', 'post', 'OK', 'PayoutAction')
}
