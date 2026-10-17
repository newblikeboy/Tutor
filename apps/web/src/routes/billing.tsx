import '../locales/billing'
import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, ArrowUpRight, ReceiptText, ShieldCheck } from 'lucide-react'
import { api, send, queryClient, indiaDate, type Schema } from '../lib/api'
import { useAuth, useConfig } from '../lib/session'
import { TabBar, TabPanel } from '../components/workspace-tabs'
import {
  Alert,
  Badge,
  Button,
  Empty,
  Field,
  Loading,
  LoadError,
  MutationError,
  Modal,
} from '../components/ui'
import '../styles/tuition.css'
import { BusinessSettings, FinanceOverview } from './finance'
import { loadCheckout } from '../lib/checkout'
import TutorEarnings from './tutor-earnings'
import { PaidInvoice, InvoiceForm } from '../components/paid-invoice'
import { WorkspaceRecordTable } from '../components/workspace-record-table'

const price = (n: number, lang: string) =>
  new Intl.NumberFormat(lang === 'hi' ? 'hi-IN' : 'en-IN', {
    style: 'currency',
    currency: 'INR',
  }).format(n / 100)
const refresh = () =>
  Promise.all([
    queryClient.invalidateQueries({ queryKey: ['billing'] }),
    queryClient.invalidateQueries({ queryKey: ['tuition'] }),
    queryClient.invalidateQueries({ queryKey: ['jobs'] }),
  ])
export function Checkout({ enrollment }: { enrollment: Schema['Enrollment'] }) {
  const { t } = useTranslation(),
    config = useConfig()
  const [message, setMessage] = useState(''),
    [key, setKey] = useState(() => crypto.randomUUID())
  const verify = useMutation({
    mutationFn: (input: { id: string; paymentId: string; signature: string }) =>
      send(`/billing/${input.id}/verify`, {
        paymentId: input.paymentId,
        signature: input.signature,
      }),
    onSuccess: async () => {
      setMessage('')
      await refresh()
    },
    onError: () => setMessage('billing.pending'),
  })
  const start = useMutation({
    mutationFn: async () => {
      const checkout = await send<Schema['Checkout']>(
        `/enrollments/${enrollment.id}/payment`,
        { retry: true },
        'POST',
        { 'Idempotency-Key': key },
      )
      if (checkout.intent.state !== 'created') {
        setMessage(
          checkout.intent.state === 'reconciliation_required'
            ? 'billing.reconcileBody'
            : 'billing.pending',
        )
        return
      }
      await loadCheckout()
      const widget = new window.Razorpay!({
        key: checkout.keyId,
        order_id: checkout.intent.orderId,
        amount: checkout.intent.amountPaise,
        currency: checkout.intent.currency,
        name: config.data?.appName ?? 'GoCoaching',
        description: t('billing.sandbox'),
        theme: { color: '#15353B' },
        handler: (result) => {
          setMessage('billing.checking')
          verify.mutate({
            id: checkout.intent.id,
            paymentId: result.razorpay_payment_id,
            signature: result.razorpay_signature,
          })
        },
        modal: {
          ondismiss: () => {
            setMessage('billing.dismissed')
            setKey(crypto.randomUUID())
          },
        },
      })
      widget.on('payment.failed', () => {
        setMessage('billing.failedPayment')
        setKey(crypto.randomUUID())
      })
      widget.open()
    },
  })
  if (config.isPending) return <Loading />
  if (config.isError) return <LoadError retry={() => void config.refetch()} />
  if (config.data?.payments === 'simulation') return <SimulationCheckout enrollment={enrollment} />
  if (config.data?.payments === 'disabled')
    return (
      <Alert>
        <strong>{t('billing.disabled')}</strong>
        <p>{t('billing.disabledBody')}</p>
      </Alert>
    )
  return (
    <section className="tu-panel tu-stack">
      <div className="tu-panel-title">
        <ShieldCheck />
        <h2>{t('billing.sandbox')}</h2>
      </div>
      <p>{t('billing.sandboxBody')}</p>
      {message && <Alert>{t(message)}</Alert>}
      <MutationError error={start.error} />
      <MutationError error={verify.error} />
      <Button
        busy={start.isPending || verify.isPending}
        onClick={() => {
          setMessage('')
          start.mutate()
        }}
      >
        {t('billing.pay')}
      </Button>
    </section>
  )
}
function SimulationCheckout({ enrollment }: { enrollment: Schema['Enrollment'] }) {
  const { t, i18n } = useTranslation()
  const [key] = useState(() => crypto.randomUUID())
  const start = useMutation({
    mutationFn: () =>
      send<Schema['Checkout']>(`/enrollments/${enrollment.id}/payment`, { retry: true }, 'POST', {
        'Idempotency-Key': key,
      }),
    onSuccess: async (result) => {
      if (result.intent.state === 'captured') await refresh()
    },
  })
  const complete = useMutation({
    mutationFn: (id: string) =>
      send<Schema['PaymentIntent']>(`/billing/${id}/simulate`, { confirmed: true }),
    onSuccess: refresh,
  })
  return (
    <section className="tu-panel tu-stack">
      <div className="tu-panel-title">
        <ShieldCheck />
        <h2>{t('billing.simulation')}</h2>
      </div>
      <p>{t('billing.simulationBody')}</p>
      <Modal
        title={t('billing.simulation')}
        description={t('billing.simulationBody')}
        trigger={
          <Button
            onClick={() => {
              complete.reset()
              start.mutate()
            }}
          >
            {t('billing.pay')}
          </Button>
        }
      >
        <div className="tu-stack">
          <p>
            <strong>{enrollment.learnerName}</strong> · {enrollment.tutorName}
          </p>
          <p>
            {t('billing.amount')}:{' '}
            <strong>{price(enrollment.agreement.totalPaise, i18n.language)}</strong>
          </p>
          {start.isPending && <Loading />}
          <MutationError error={start.error} />
          <MutationError error={complete.error} />
          {start.isSuccess && start.data.intent.provider !== 'simulation' && (
            <Alert>{t('billing.providerChanged')}</Alert>
          )}
          {start.isSuccess &&
            start.data.intent.provider === 'simulation' &&
            start.data.intent.state === 'created' && (
              <Button
                busy={complete.isPending}
                onClick={() => complete.mutate(start.data.intent.id)}
              >
                {t('billing.completeSimulation')}
              </Button>
            )}
          {complete.isSuccess && <Alert kind="success">{t('billing.simulationSuccess')}</Alert>}
        </div>
      </Modal>
    </section>
  )
}
function PaymentStatus({ state, simulated = false }: { state: string; simulated?: boolean }) {
  const { t } = useTranslation()
  return (
    <Badge
      tone={
        ['captured', 'processed', 'done'].includes(state)
          ? 'teal'
          : ['refund_review', 'failed', 'reconciliation_required'].includes(state)
            ? 'amber'
            : 'neutral'
      }
    >
      {t(simulated && state === 'captured' ? 'billing.simulatedCapture' : `billing.state.${state}`)}
    </Badge>
  )
}
export default function Billing() {
  const { t } = useTranslation(),
    auth = useAuth(),
    { id } = useParams()
  if (!['parent', 'tutor', 'finance', 'admin'].includes(auth.data?.user.role ?? ''))
    return <Alert>{t('permission')}</Alert>
  if (auth.data?.user.role === 'tutor')
    return (
      <div className="tu-page billing-page">
        <TutorEarnings />
      </div>
    )
  return (
    <div className="tu-page billing-page">
      <h1 className={auth.data?.user.role === 'parent' ? 'parent-payments-title' : 'sr-only'}>
        {t(auth.data?.user.role === 'parent' ? 'parent.payments' : 'billing.title')}
      </h1>
      {id ? (
        <PaymentDetail id={id} />
      ) : ['admin', 'finance'].includes(auth.data!.user.role) ? (
        <StaffPaymentTabs />
      ) : (
        <PaymentList />
      )}
    </div>
  )
}
function StaffPaymentTabs() {
  const { t } = useTranslation()
  const [params, setParams] = useSearchParams()
  const requested = params.get('tab')
  const tab =
    requested && ['operations', 'revenue', 'business'].includes(requested) ? requested : 'payments'
  return (
    <>
      <TabBar
        id="staff-payments"
        label={t('billing.title')}
        value={tab}
        options={[
          { value: 'payments', label: t('billing.recordsTab') },
          { value: 'operations', label: t('billing.operationsTab') },
          { value: 'revenue', label: 'Revenue & payouts' },
          { value: 'business', label: 'Business & taxes' },
        ]}
        onChange={(value) => {
          const next = new URLSearchParams(params)
          next.set('tab', value)
          next.delete('cursor')
          setParams(next)
        }}
      />
      <TabPanel id="staff-payments" value="payments" active={tab === 'payments'}>
        <h2 className="sr-only">{t('billing.recordsTab')}</h2>
        <PaymentList />
      </TabPanel>
      <TabPanel id="staff-payments" value="operations" active={tab === 'operations'}>
        <Jobs />
      </TabPanel>
      <TabPanel id="staff-payments" value="revenue" active={tab === 'revenue'}>
        <FinanceOverview />
      </TabPanel>
      <TabPanel id="staff-payments" value="business" active={tab === 'business'}>
        <BusinessSettings />
      </TabPanel>
    </>
  )
}
function PaymentList() {
  const auth = useAuth()
  const { t, i18n } = useTranslation(),
    [params, setParams] = useSearchParams()
  const cursor = params.get('cursor') ?? ''
  const q = useQuery({
    queryKey: ['billing', 'list', cursor],
    queryFn: ({ signal }) =>
      api<Schema['PaymentPage']>(`/billing?cursor=${encodeURIComponent(cursor)}`, { signal }),
  })
  return (
    <>
      {q.isPending ? (
        <Loading />
      ) : q.isError ? (
        <LoadError retry={() => void q.refetch()} />
      ) : (
        <>
          {!q.data.items.length ? (
            <Empty headingLevel={2} title={t('billing.none')} body={t('billing.noneBody')} />
          ) : auth.data?.user.role === 'parent' ? (
            <WorkspaceRecordTable
              label="Your payments"
              countLabel={`${q.data.items.length} ${q.data.items.length === 1 ? 'payment' : 'payments'} on this page`}
              intro="Open a payment to see its details, invoice and refund status."
              columns={['Payment', 'Date', 'Amount', 'Status', 'Refunded']}
            >
              {q.data.items.map((payment) => (
                <tr key={payment.id}>
                  <th scope="row">
                    <Link
                      className="student-report-link"
                      to={`/billing/${encodeURIComponent(payment.id)}${cursor ? `?listCursor=${encodeURIComponent(cursor)}` : ''}`}
                    >
                      <strong>
                        {payment.purpose === 'study_subscription'
                          ? 'Study subscription'
                          : t('billing.view')}
                      </strong>
                      <span>Reference {payment.id.slice(-8)}</span>
                    </Link>
                    {payment.provider === 'simulation' && <Badge tone="amber">Test payment</Badge>}
                  </th>
                  <td>
                    <time dateTime={payment.createdAt}>
                      {indiaDate(payment.createdAt, i18n.language)}
                    </time>
                  </td>
                  <td>{price(payment.amountPaise, i18n.language)}</td>
                  <td>
                    <PaymentStatus
                      state={payment.state}
                      simulated={payment.provider === 'simulation'}
                    />
                  </td>
                  <td>
                    {payment.provider === 'simulation'
                      ? 'Not applicable'
                      : price(payment.refundedPaise, i18n.language)}
                  </td>
                </tr>
              ))}
            </WorkspaceRecordTable>
          ) : (
            <div className="tu-card-grid">
              {q.data.items.map((v) => (
                <article key={v.id} className="tu-enrollment">
                  <div className="tu-card-top">
                    <span className="tu-book">
                      <ReceiptText />
                    </span>
                    <PaymentStatus state={v.state} simulated={v.provider === 'simulation'} />
                  </div>
                  <h2>{price(v.amountPaise, i18n.language)}</h2>
                  <p>{indiaDate(v.createdAt, i18n.language)}</p>
                  <Link className="tu-card-link" to={`/billing/${v.id}`}>
                    {t('billing.view')}
                    <ArrowUpRight size={18} />
                  </Link>
                </article>
              ))}
            </div>
          )}
          <div className="tu-actions">
            {cursor && (
              <Button
                variant="secondary"
                onClick={() => {
                  const next = new URLSearchParams(params)
                  next.delete('cursor')
                  setParams(next)
                }}
              >
                {t('tuition.firstPage')}
              </Button>
            )}
            {q.data.nextCursor && (
              <Button
                variant="secondary"
                onClick={() => {
                  const next = new URLSearchParams(params)
                  next.set('cursor', q.data.nextCursor)
                  setParams(next)
                }}
              >
                {t('tuition.nextPage')}
              </Button>
            )}
          </div>
        </>
      )}
    </>
  )
}
function PaymentDetail({ id }: { id: string }) {
  const [params] = useSearchParams()
  const { t, i18n } = useTranslation(),
    auth = useAuth()
  const q = useQuery({
    queryKey: ['billing', id],
    queryFn: ({ signal }) => api<Schema['BillingDetail']>(`/billing/${id}`, { signal }),
  })
  const reconcile = useMutation({
    mutationFn: () => send(`/billing/${id}/reconcile`, {}),
    onSuccess: refresh,
  })
  if (q.isPending) return <Loading />
  if (q.isError) return <LoadError retry={() => void q.refetch()} />
  const v = q.data.intent,
    staff = ['finance', 'admin'].includes(auth.data!.user.role)
  const amounts: [string, number][] =
    v.provider === 'simulation'
      ? [['amount', v.amountPaise]]
      : [
          ['amount', v.amountPaise],
          ['refunded', v.refundedPaise],
          ['reserved', v.refundReservedPaise],
        ]
  return (
    <>
      <Link
        className="tu-back"
        to={
          params.get('listCursor')
            ? `/billing?cursor=${encodeURIComponent(params.get('listCursor')!)}`
            : '/billing'
        }
      >
        <ArrowLeft size={16} />
        {t('billing.back')}
      </Link>
      <article className="tu-panel tu-stack">
        <div className="tu-card-top">
          <h2>{t('billing.receipt')}</h2>
          <PaymentStatus state={v.state} simulated={v.provider === 'simulation'} />
        </div>
        {v.provider === 'simulation' ? (
          <Alert>{t('billing.simulationRecord')}</Alert>
        ) : (
          q.data.sandbox && <Alert>{t('billing.sandbox')}</Alert>
        )}
        <div className="tu-quote">
          {amounts.map(([key, n]) => (
            <div key={key}>
              <span>{t(`billing.${key}`)}</span>
              <strong>{price(Number(n), i18n.language)}</strong>
            </div>
          ))}
        </div>
        {v.provider !== 'simulation' && !q.data.invoice && <p>{t('billing.receiptBody')}</p>}
        <div>
          <h3>{t(v.provider === 'simulation' ? 'billing.testReference' : 'billing.reference')}</h3>
          <p>{v.paymentId || v.orderId || '—'}</p>
        </div>
        {v.provider === 'simulation' && v.capturedAt && (
          <p>
            {t('billing.capturedAt')}: {indiaDate(v.capturedAt, i18n.language)}
          </p>
        )}
        {!staff && (
          <Link
            to={
              v.purpose === 'study_subscription'
                ? `/study?learner=${encodeURIComponent(v.learnerId ?? '')}`
                : `/tuition/${v.enrollmentId}`
            }
            className="text-link"
          >
            {v.purpose === 'study_subscription' ? 'Open study materials' : t('billing.openTuition')}
          </Link>
        )}
        {staff &&
          v.provider !== 'simulation' &&
          ['creating', 'reconciliation_required'].includes(v.state) && (
            <>
              <p>{t('billing.reconcileBody')}</p>
              <Button busy={reconcile.isPending} onClick={() => reconcile.mutate()}>
                {t('billing.reconcile')}
              </Button>
              <MutationError error={reconcile.error} />
            </>
          )}
      </article>
      {q.data.invoice && <PaidInvoice invoice={q.data.invoice} />}
      {staff && v.provider !== 'simulation' && v.paymentId && !q.data.invoice && (
        <InvoiceForm id={id} />
      )}
      {v.purpose === 'study_subscription' && v.provider !== 'simulation' && v.paymentId && (
        <p>
          A processed refund ends access funded by this subscription payment. Saved quiz results
          remain available.
        </p>
      )}
      {v.provider !== 'simulation' &&
        v.paymentId &&
        v.amountPaise - v.refundedPaise - v.refundReservedPaise > 0 && <RefundForm intent={v} />}
      {v.provider !== 'simulation' && (
        <section className="tu-stack">
          <h2>{t('billing.history')}</h2>
          {!q.data.refunds.length ? (
            <p>{t('billing.noRefunds')}</p>
          ) : (
            q.data.refunds.map((r) => (
              <RefundCard key={`${r.id}:${r.status}`} item={r} staff={staff} />
            ))
          )}
        </section>
      )}
      {staff && v.provider !== 'simulation' && (
        <section className="tu-panel tu-stack">
          <h2>{t('billing.ledger')}</h2>
          <p>{t('billing.ledgerBody')}</p>
          {q.data.ledger.map((entry) => (
            <div className="tu-policy" key={entry.id}>
              <strong>{price(entry.amountPaise, i18n.language)}</strong>
              <p>
                {t('billing.debit')}: {t(`billing.account.${entry.debit}`)} · {t('billing.credit')}:{' '}
                {t(`billing.account.${entry.credit}`)}
              </p>
              <small>{indiaDate(entry.createdAt, i18n.language)}</small>
            </div>
          ))}
        </section>
      )}
    </>
  )
}
function RefundForm({ intent }: { intent: Schema['PaymentIntent'] }) {
  const { t } = useTranslation(),
    [key] = useState(() => crypto.randomUUID())
  const m = useMutation({
    mutationFn: (body: Schema['RefundInput']) =>
      send(`/billing/${intent.id}/refunds`, body, 'POST', { 'Idempotency-Key': key }),
    onSuccess: refresh,
  })
  return (
    <details className="tu-panel tu-disclosure">
      <summary>{t('billing.refund')}</summary>
      <form
        className="tu-stack"
        onSubmit={(event) => {
          event.preventDefault()
          const d = new FormData(event.currentTarget)
          m.mutate({
            amountPaise: Math.round(Number(d.get('amount')) * 100),
            reason: String(d.get('reason')),
          })
        }}
      >
        <Field label={t('billing.refundAmount')}>
          <input
            name="amount"
            type="number"
            step="0.01"
            min="0.01"
            max={(intent.amountPaise - intent.refundedPaise - intent.refundReservedPaise) / 100}
            required
          />
        </Field>
        <Field label={t('billing.reason')}>
          <textarea name="reason" required minLength={10} maxLength={1000} />
        </Field>
        <MutationError error={m.error} />
        <Button busy={m.isPending} disabled={m.isSuccess}>
          {t('billing.send')}
        </Button>
        {m.isSuccess && <Alert kind="success">{t('billing.state.requested')}</Alert>}
      </form>
    </details>
  )
}
function RefundCard({ item, staff }: { item: Schema['RefundRequest']; staff: boolean }) {
  const { t, i18n } = useTranslation(),
    auth = useAuth()
  const m = useMutation({
    mutationFn: (body: Schema['RefundAction']) => send(`/refunds/${item.id}/action`, body),
    onSuccess: refresh,
  })
  return (
    <article className="tu-panel tu-stack">
      <div className="tu-card-top">
        <h3>{price(item.amountPaise, i18n.language)}</h3>
        <PaymentStatus state={item.status} />
      </div>
      <p>{item.reason}</p>
      {item.decision && <p>{item.decision}</p>}
      {staff && item.status === 'requested' && item.requestedBy !== auth.data!.user.id && (
        <form
          className="tu-stack"
          onSubmit={(event) => {
            event.preventDefault()
            const d = new FormData(event.currentTarget)
            m.mutate({
              action: d.get('action') as 'approve' | 'reject',
              reason: String(d.get('reason')),
            })
          }}
        >
          <Field label={t('billing.review')}>
            <select name="action">
              <option value="approve">{t('billing.approve')}</option>
              <option value="reject">{t('billing.reject')}</option>
            </select>
          </Field>
          <Field label={t('billing.decision')}>
            <textarea name="reason" required minLength={10} maxLength={1000} />
          </Field>
          <MutationError error={m.error} />
          <Button busy={m.isPending}>{t('billing.confirm')}</Button>
        </form>
      )}
    </article>
  )
}
function Jobs() {
  const { t, i18n } = useTranslation()
  const [cursor, setCursor] = useState('')
  const q = useQuery({
    queryKey: ['jobs', cursor],
    queryFn: ({ signal }) =>
      api<Schema['JobPage']>(`/jobs?category=payments&cursor=${encodeURIComponent(cursor)}`, {
        signal,
      }),
  })
  return (
    <section className="tu-stack">
      <h2>{t('billing.jobs')}</h2>
      <p>{t('billing.jobsBody')}</p>
      {q.isPending ? (
        <Loading />
      ) : q.isError ? (
        <LoadError retry={() => void q.refetch()} />
      ) : q.data.items.length === 0 ? (
        <p className="tu-panel">{t('billing.noJobs')}</p>
      ) : (
        q.data.items.map((j) => (
          <article key={j.id} className="tu-panel">
            <div className="tu-card-top">
              <strong>
                {j.kind === 'razorpay_refund'
                  ? t('billing.history')
                  : j.kind === 'payment_operator_review'
                    ? t('billing.review')
                    : t('billing.view')}
              </strong>
              <PaymentStatus state={j.status} />
            </div>
            <p>
              {t('billing.attempts')}: {j.attempts} · {t('billing.next')}:{' '}
              {indiaDate(j.availableAt, i18n.language)}
            </p>
            {j.status === 'failed' && <RetryJob id={j.id} />}
          </article>
        ))
      )}
      <div className="tu-actions">
        {cursor && (
          <Button variant="secondary" onClick={() => setCursor('')}>
            {t('tuition.firstPage')}
          </Button>
        )}
        {q.data?.nextCursor && (
          <Button variant="secondary" onClick={() => setCursor(q.data!.nextCursor)}>
            {t('tuition.nextPage')}
          </Button>
        )}
      </div>
    </section>
  )
}
function RetryJob({ id }: { id: string }) {
  const { t } = useTranslation()
  const m = useMutation({
    mutationFn: (reason: string) => send(`/jobs/${encodeURIComponent(id)}/retry`, { reason }),
    onSuccess: refresh,
  })
  return (
    <details className="tu-disclosure">
      <summary>{t('billing.retry')}</summary>
      <form
        className="tu-stack"
        onSubmit={(e) => {
          e.preventDefault()
          m.mutate(String(new FormData(e.currentTarget).get('reason')))
        }}
      >
        <Field label={t('billing.retryReason')}>
          <textarea name="reason" minLength={10} maxLength={1000} required />
        </Field>
        <MutationError error={m.error} />
        <Button busy={m.isPending}>{t('billing.retry')}</Button>
      </form>
    </details>
  )
}
