import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { api, send, queryClient, indiaDate, type Schema } from '../lib/api'
import { useAuth } from '../lib/session'
import { Alert, Button, Empty, Field, Loading, LoadError, MutationError } from '../components/ui'
import '../styles/finance.css'

type Amounts = Schema['FinancialAmounts']
const money = (n: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(n / 100)
const refresh = () => queryClient.invalidateQueries({ queryKey: ['finance'] })
const fields: [keyof Amounts, string][] = [
  ['grossPaise', 'Class fees'],
  ['tutorNetPaise', 'Tutor bank payout · 75%'],
  ['platformPaise', 'Platform allocation · 25%'],
  ['gstPaise', 'GST within platform allocation'],
  ['tuitionGstPaise', 'Tuition GST covered by platform'],
  ['tdsPaise', 'TDS covered by platform'],
  ['tcsPaise', 'GST TCS covered by platform'],
  ['gatewayCostPaise', 'Gateway cost'],
  ['revenuePaise', 'Platform revenue before costs'],
  ['contributionPaise', 'Platform balance after listed costs'],
]
function AmountGrid({ amounts, tutor = false }: { amounts: Amounts; tutor?: boolean }) {
  return (
    <dl className="finance-metrics">
      {fields
        .filter(
          ([key]) =>
            !tutor || !['gatewayCostPaise', 'revenuePaise', 'contributionPaise'].includes(key),
        )
        .map(([key, label]) => (
          <div key={key}>
            <dt>{label}</dt>
            <dd>{money(amounts[key])}</dd>
          </div>
        ))}
    </dl>
  )
}

export function BusinessSettings() {
  const auth = useAuth()
  const q = useQuery({
    queryKey: ['finance', 'business'],
    queryFn: ({ signal }) => api<Schema['BusinessSettings']>('/finance/business', { signal }),
  })
  const m = useMutation({
    mutationFn: (body: Schema['BusinessSettings']) => send('/finance/business', body, 'PUT'),
    onSuccess: refresh,
  })
  if (q.isPending) return <Loading />
  if (q.isError) return <LoadError retry={() => void q.refetch()} />
  const v = q.data
  return (
    <section className="tu-panel tu-stack">
      <h2>Business &amp; taxes</h2>
      <p>
        Registered business details and the accountant-approved marketplace policy. Saved bookings
        keep their own settings snapshot.
      </p>
      <Alert>
        Tutors receive 75% of the class fee in their bank account. The remaining 25% includes
        platform GST and covers the reviewed withholding and payment costs. This does not guarantee
        a tutor’s final annual income-tax liability.
      </Alert>
      <form
        key={v.version}
        className="tu-stack"
        onSubmit={(event) => {
          event.preventDefault()
          const d = new FormData(event.currentTarget)
          m.mutate({
            ...v,
            legalName: String(d.get('legalName')),
            address: String(d.get('address')),
            stateCode: String(d.get('stateCode')),
            gstin: String(d.get('gstin')),
            sac: String(d.get('sac')),
            commissionGstBps: Math.round(Number(d.get('gst')) * 100),
            taxPolicy: String(d.get('taxPolicy')),
            reviewed: d.get('reviewed') === 'on',
          })
        }}
      >
        <fieldset disabled={auth.data?.user.role !== 'admin'} className="finance-form-grid">
          <Field label="Legal business name">
            <input name="legalName" defaultValue={v.legalName} required maxLength={160} />
          </Field>
          <Field label="GSTIN">
            <input
              name="gstin"
              defaultValue={v.gstin}
              required
              minLength={15}
              maxLength={15}
              autoCapitalize="characters"
            />
          </Field>
          <Field
            label="Registered state code"
            hint="Delhi: 07. Must match the first two digits of the GSTIN."
          >
            <input
              name="stateCode"
              defaultValue={v.stateCode}
              required
              pattern="[0-9]{2}"
              maxLength={2}
            />
          </Field>
          <Field label="Platform service SAC">
            <input name="sac" defaultValue={v.sac} required pattern="[0-9]{6}" maxLength={6} />
          </Field>
          <Field label="GST on platform commission (%)">
            <input
              name="gst"
              type="number"
              step="0.01"
              min="0"
              max="28"
              defaultValue={v.version ? v.commissionGstBps / 100 : undefined}
              required
            />
          </Field>
          <Field label="Registered billing address">
            <textarea
              name="address"
              defaultValue={v.address}
              required
              minLength={10}
              maxLength={600}
            />
          </Field>
          <div className="finance-form-wide">
            <Field
              label="Accountant-approved tax policy"
              hint="Confirm who supplies tuition, tuition GST treatment, TDS/TCS bases, PAN and annual threshold checks, timing and treatment of platform-funded deductions."
            >
              <textarea
                name="taxPolicy"
                defaultValue={v.taxPolicy}
                required
                minLength={20}
                maxLength={2000}
              />
            </Field>
          </div>
          <label className="finance-form-wide">
            <input name="reviewed" type="checkbox" defaultChecked={v.reviewed} /> These details and
            the marketplace tax treatment have been reviewed by our accountant.
          </label>
        </fieldset>
        <MutationError error={m.error} />
        {m.isSuccess && <p role="status">Business settings saved.</p>}
        {auth.data?.user.role === 'admin' && (
          <Button busy={m.isPending}>Save business details</Button>
        )}
      </form>
    </section>
  )
}

export function FinanceOverview() {
  const q = useQuery({
    queryKey: ['finance', 'summary'],
    queryFn: ({ signal }) => api<Amounts>('/finance/summary', { signal }),
  })
  return (
    <div className="tu-stack">
      <section className="tu-panel">
        <h2>Revenue from completed classes</h2>
        <p>
          Recognized earnings only. Prepaid future classes are not platform revenue. Tax amounts are
          calculated liabilities, not proof of filing or payment.
        </p>
        {q.isPending ? (
          <Loading />
        ) : q.isError ? (
          <LoadError retry={() => void q.refetch()} />
        ) : (
          <AmountGrid amounts={q.data} />
        )}
      </section>
      <BookingAllocations />
      <EarningHolds />
      <Earnings />
      <Payouts />
    </div>
  )
}
export function TutorEarnings() {
  return (
    <div className="tu-stack">
      <section className="tu-panel">
        <h1>Your earnings</h1>
        <p>
          You receive 75% of each class fee in your bank account. Applicable withholding is covered
          within the platform’s 25% allocation.
        </p>
        <p>
          Recorded completed classes are due on Wednesday after the finance review week.
          Future classes, unresolved refunds and disputed attendance remain on hold.
        </p>
      </section>
      <BookingAllocations tutor />
      <EarningHolds tutor />
      <Earnings tutor />
      <Payouts tutor />
    </div>
  )
}

function Pager({
  cursor,
  next,
  setCursor,
}: {
  cursor: string
  next: string
  setCursor: (value: string) => void
}) {
  return (
    <div className="tu-actions">
      {cursor && (
        <Button variant="secondary" onClick={() => setCursor('')}>
          First page
        </Button>
      )}
      {next && (
        <Button variant="secondary" onClick={() => setCursor(next)}>
          Next page
        </Button>
      )}
    </div>
  )
}
function BookingAllocations({ tutor = false }: { tutor?: boolean }) {
  const [cursor, setCursor] = useState('')
  const q = useQuery({
    queryKey: ['finance', 'bookings', cursor],
    queryFn: ({ signal }) =>
      api<Schema['FinanceBookingPage']>(`/finance/bookings?cursor=${encodeURIComponent(cursor)}`, {
        signal,
      }),
  })
  return (
    <section className="tu-stack">
      <h2>Booking allocations</h2>
      {q.isPending ? (
        <Loading />
      ) : q.isError ? (
        <LoadError retry={() => void q.refetch()} />
      ) : (
        <>
          {!q.data.items.length && (
            <Empty
              title="No paid bookings yet"
              body="Allocations appear after Razorpay confirms payment."
            />
          )}
          {q.data.items.map((v) => (
            <article className="tu-panel tu-stack" key={v.id}>
              <div>
                <h3>{tutor ? 'Paid booking' : v.tutorName}</h3>
                <p className="finance-reference">Booking {v.enrollmentId}</p>
                <p>
                  {v.status === 'tax_review'
                    ? 'Tax review pending · 75% tutor payout reserved'
                    : 'Tax allocation reviewed'}
                </p>
              </div>
              {v.status === 'tax_review' ? (
                <dl className="finance-metrics">
                  <div>
                    <dt>Class fees</dt>
                    <dd>{money(v.amounts.grossPaise)}</dd>
                  </div>
                  <div>
                    <dt>Your tutor allocation · 75%</dt>
                    <dd>{money(v.amounts.tutorNetPaise)}</dd>
                  </div>
                  <div>
                    <dt>Platform allocation · tax inclusive</dt>
                    <dd>{money(v.amounts.platformPaise)}</dd>
                  </div>
                </dl>
              ) : (
                <AmountGrid amounts={v.amounts} tutor={tutor} />
              )}
              {!tutor && v.status === 'tax_review' && (
                <TaxReview id={v.id} gross={v.amounts.grossPaise} />
              )}
            </article>
          ))}
          <Pager cursor={cursor} next={q.data.nextCursor} setCursor={setCursor} />
        </>
      )}
    </section>
  )
}
function TaxReview({
  id,
  gross,
  classReview = false,
}: {
  id: string
  gross: number
  classReview?: boolean
}) {
  const m = useMutation({
    mutationFn: (body: Schema['TaxReview']) =>
      send(`/finance/${classReview ? 'classes' : 'bookings'}/${id}/tax`, body),
    onSuccess: refresh,
  })
  return (
    <details className="tu-disclosure">
      <summary>Review taxes and payment cost</summary>
      <form
        className="tu-stack"
        onSubmit={(event) => {
          event.preventDefault()
          const d = new FormData(event.currentTarget)
          const paise = (key: string) => Math.round(Number(d.get(key)) * 100)
          m.mutate({
            tuitionGstPaise: paise('tuitionGst'),
            tdsBasePaise: paise('tdsBase'),
            tdsBps: paise('tdsRate'),
            tcsBasePaise: paise('tcsBase'),
            tcsBps: paise('tcsRate'),
            gatewayCostPaise: paise('gateway'),
            interstate: d.get('interstate') === 'on',
            reason: String(d.get('reason')),
          })
        }}
      >
        <Alert>
          Check the tutor’s PAN, tax-year turnover, threshold eligibility and GST status. Enter the
          approved withholding bases, including any required gross-up. Zero rates require a
          documented exemption. This review is permanent.
        </Alert>
        <div className="finance-form-grid">
          {[
            ['tuitionGst', 'Tuition GST borne by platform (INR)', gross / 100],
            ['tdsBase', 'TDS basis (₹)', 4800000],
            ['tdsRate', 'TDS rate (%)', 20],
            ['tcsBase', 'GST TCS basis (₹)', 4800000],
            ['tcsRate', 'GST TCS rate (%)', 1],
            ['gateway', 'Actual gateway cost including GST (₹)', gross / 100],
          ].map(([name, label, max]) => (
            <Field key={name} label={String(label)}>
              <input
                name={String(name)}
                type="number"
                step="0.01"
                min="0"
                max={Number(max)}
                required
              />
            </Field>
          ))}
        </div>
        <label>
          <input name="interstate" type="checkbox" /> Interstate platform service (IGST)
        </label>
        <Field label="Tax assessment and evidence">
          <textarea name="reason" required minLength={20} maxLength={2000} />
        </Field>
        <MutationError error={m.error} />
        <Button busy={m.isPending}>Confirm tax allocation</Button>
      </form>
    </details>
  )
}
function EarningHolds({ tutor = false }: { tutor?: boolean }) {
  const [cursor, setCursor] = useState('')
  const q = useQuery({
    queryKey: ['finance', 'holds', cursor],
    queryFn: ({ signal }) =>
      api<Schema['EarningHoldPage']>(`/finance/holds?cursor=${encodeURIComponent(cursor)}`, {
        signal,
      }),
  })
  const m = useMutation({
    mutationFn: (id: string) => send(`/finance/bookings/${id}/reconcile`, {}),
    onSuccess: refresh,
  })
  if (q.isPending) return <Loading />
  if (q.isError) return <LoadError retry={() => void q.refetch()} />
  if (!q.data.items.length && !cursor) return null
  return (
    <section className="tu-stack">
      <h2>Earnings needing review</h2>
      <MutationError error={m.error} />
      {q.data.items.map((v) => (
        <article className="tu-panel tu-stack" key={v.id}>
          <p className="finance-reference">Class {v.id}</p>
          <p>{v.reason}</p>
          {!tutor &&
            (v.kind === 'replacement_tax' ? (
              <TaxReview id={v.id} gross={v.grossPaise} classReview />
            ) : (
              <Button variant="secondary" busy={m.isPending} onClick={() => m.mutate(v.intentId)}>
                Recheck completed classes
              </Button>
            ))}
        </article>
      ))}
      <Pager cursor={cursor} next={q.data.nextCursor} setCursor={setCursor} />
    </section>
  )
}
function Earnings({ tutor = false }: { tutor?: boolean }) {
  const [cursor, setCursor] = useState('')
  const q = useQuery({
    queryKey: ['finance', 'earnings', cursor],
    queryFn: ({ signal }) =>
      api<Schema['ClassEarningPage']>(`/finance/earnings?cursor=${encodeURIComponent(cursor)}`, {
        signal,
      }),
  })
  const [key, setKey] = useState(() => crypto.randomUUID())
  const m = useMutation({
    mutationFn: (tutorId: string) =>
      send('/finance/payouts', { tutorId }, 'POST', { 'Idempotency-Key': key }),
    onSuccess: async () => {
      setKey(crypto.randomUUID())
      await refresh()
    },
  })
  return (
    <section className="tu-stack">
      <h2>Completed class earnings</h2>
      <MutationError error={m.error} />
      {q.isPending ? (
        <Loading />
      ) : q.isError ? (
        <LoadError retry={() => void q.refetch()} />
      ) : (
        <>
          {!q.data.items.length && (
            <Empty
              title="No earnings released yet"
              body="Recorded completed classes appear after the required finance checks."
            />
          )}
          <div className="finance-cards">
            {q.data.items.map((v) => (
              <article className="tu-panel" key={v.id}>
                <h3>{money(v.amounts.tutorNetPaise)}</h3>
                <p className="finance-reference">Class {v.id}</p>
                {!tutor && <p className="finance-reference">Tutor {v.tutorId}</p>}
                <p>Due {indiaDate(v.dueAt, 'en')}</p>
                <p>{v.batchId ? 'Included in a payout batch' : 'Awaiting weekly payout'}</p>
                {!tutor && !v.batchId && (
                  <Button
                    variant="secondary"
                    busy={m.isPending}
                    onClick={() => m.mutate(v.tutorId)}
                  >
                    Prepare due payout
                  </Button>
                )}
              </article>
            ))}
          </div>
          <Pager cursor={cursor} next={q.data.nextCursor} setCursor={setCursor} />
        </>
      )}
    </section>
  )
}
function Payouts({ tutor = false }: { tutor?: boolean }) {
  const [cursor, setCursor] = useState('')
  const q = useQuery({
    queryKey: ['finance', 'payouts', cursor],
    queryFn: ({ signal }) =>
      api<Schema['PayoutBatchPage']>(`/finance/payouts?cursor=${encodeURIComponent(cursor)}`, {
        signal,
      }),
  })
  return (
    <section className="tu-stack">
      <h2>Weekly payouts</h2>
      {q.isPending ? (
        <Loading />
      ) : q.isError ? (
        <LoadError retry={() => void q.refetch()} />
      ) : (
        <>
          {!q.data.items.length && (
            <Empty
              title="No payout batches yet"
              body="Due earnings are grouped into weekly bank transfers."
            />
          )}
          {q.data.items.map((v) => (
            <PayoutCard key={`${v.id}:${v.status}`} batch={v} tutor={tutor} />
          ))}
          <Pager cursor={cursor} next={q.data.nextCursor} setCursor={setCursor} />
        </>
      )}
    </section>
  )
}
function PayoutCard({ batch: v, tutor }: { batch: Schema['PayoutBatch']; tutor: boolean }) {
  const auth = useAuth()
  const m = useMutation({
    mutationFn: (body: Schema['PayoutAction']) => send(`/finance/payouts/${v.id}/action`, body),
    onSuccess: refresh,
  })
  return (
    <article className="tu-panel tu-stack">
      <h3>
        {money(v.amountPaise)} · {v.classIds.length} classes
      </h3>
      <p>
        {v.status === 'paid'
          ? 'Bank settlement verified'
          : v.status === 'verification_pending'
            ? 'Bank transfer awaiting independent verification'
            : 'Prepared · transfer not yet recorded'}
      </p>
      <p className="finance-reference">Batch {v.id}</p>
      {v.reference && <p>Bank reference: {v.reference}</p>}
      {!tutor && v.status === 'prepared' && (
        <form
          className="tu-stack"
          onSubmit={(event) => {
            event.preventDefault()
            const d = new FormData(event.currentTarget)
            m.mutate({
              action: 'record',
              reference: String(d.get('reference')),
              paidAt: new Date(String(d.get('paidAt'))).toISOString(),
            })
          }}
        >
          <p>
            Make the bank transfer using the tutor’s verified payout details, then record its actual
            UTR. This action does not send money.
          </p>
          <Field label="Bank UTR">
            <input name="reference" required pattern="[A-Za-z0-9-]{8,64}" />
          </Field>
          <Field label="Actual transfer time">
            <input name="paidAt" type="datetime-local" required />
          </Field>
          <Button busy={m.isPending}>Record bank transfer</Button>
        </form>
      )}
      {!tutor && v.status === 'verification_pending' && v.recordedBy !== auth.data?.user.id && (
        <Button
          busy={m.isPending}
          onClick={() =>
            m.mutate({ action: 'confirm', reference: '', paidAt: new Date().toISOString() })
          }
        >
          Confirm against bank statement
        </Button>
      )}
      <MutationError error={m.error} />
    </article>
  )
}
