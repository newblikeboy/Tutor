import { useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowLeft, ArrowRight, CalendarDays, CircleHelp, Wallet } from 'lucide-react'
import type { ReactNode } from 'react'
import { api, indiaDate, type Schema } from '../lib/api'
import { Alert, Badge, Button, Empty, Loading, LoadError } from '../components/ui'
import { TabBar, TabPanel } from '../components/workspace-tabs'
import { TutorRecordTable } from '../components/tutor-record-table'
import '../styles/tutor-earnings.css'

const money = (amount: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(amount / 100)
const date = (value: string) =>
  new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  }).format(new Date(value))
const tabs = [
  { value: 'earnings', label: 'Class earnings' },
  { value: 'payouts', label: 'Payout history' },
  { value: 'bookings', label: 'Paid bookings' },
  { value: 'holds', label: 'Needs review' },
]
type Kind = 'earnings' | 'payouts' | 'bookings' | 'holds'
type Metric = { label: string; amount: number }

export default function TutorEarnings() {
  const [params, setParams] = useSearchParams()
  const selected = params.get('tab') ?? 'earnings'
  const tab = tabs.some((option) => option.value === selected) ? selected : 'earnings'
  return (
    <div className="tutor-earnings">
      <div className="te-heading">
        <div>
          <h1>Earnings &amp; payouts</h1>
          <p>Track your completed classes and weekly bank payouts.</p>
        </div>
        <Link className="btn secondary" to="/cases">
          <CircleHelp size={17} aria-hidden="true" /> Payment help
        </Link>
      </div>
      <TabBar
        id="tutor-finance"
        scrollable
        label="Earnings and payout records"
        value={tab}
        options={tabs}
        onChange={(value) => {
          const next = new URLSearchParams(params)
          next.set('tab', value)
          next.delete('record')
          setParams(next)
        }}
      />
      <TabPanel id="tutor-finance" value="earnings" active={tab === 'earnings'}>
        <ClassEarnings />
      </TabPanel>
      <TabPanel id="tutor-finance" value="payouts" active={tab === 'payouts'}>
        <PayoutHistory />
      </TabPanel>
      <TabPanel id="tutor-finance" value="bookings" active={tab === 'bookings'}>
        <PaidBookings />
      </TabPanel>
      <TabPanel id="tutor-finance" value="holds" active={tab === 'holds'}>
        <ReviewHolds />
      </TabPanel>
      <div className="te-policy">
        <section className="te-share" aria-label="Your tutor share">
          <Wallet size={23} aria-hidden="true" />
          <div>
            <p>Your tutor share</p>
            <strong>
              75<span>%</span>
            </strong>
          </div>
          <p>
            Of each class fee. Applicable withholding is covered within the platform’s 25%
            allocation.
          </p>
        </section>
        <section className="te-cycle" aria-label="Payout schedule">
          <CalendarDays size={23} aria-hidden="true" />
          <div>
            <h2>Weekly bank payouts</h2>
            <p>Completed class earnings are due Wednesday after the finance review week.</p>
            <span>Paid status appears after bank settlement is verified.</span>
          </div>
        </section>
      </div>
      <details className="te-help">
        <summary>How earnings and payouts work</summary>
        <p>
          Earnings appear after completed classes pass the required finance checks. Future classes,
          disputed attendance and unresolved refunds can delay release or payout.
        </p>
        <p>
          Paid booking allocations are expected shares, not completed-class earnings. Payout batches
          are paid only after a bank transfer is recorded and independently verified.
        </p>
        <p>
          Test bookings do not generate earnings. Your final annual income-tax liability is separate
          from the saved class allocation.
        </p>
      </details>
    </div>
  )
}

function RecordLink({ id, children }: { id: string; children: ReactNode }) {
  const [params] = useSearchParams()
  const next = new URLSearchParams(params)
  next.set('record', id)
  return (
    <Link className="student-report-link" to={`?${next}`}>
      <strong>{children}</strong>
      <span>
        View details <ArrowRight size={15} aria-hidden="true" />
      </span>
    </Link>
  )
}

function Records<T extends { id: string }>({
  kind,
  title,
  intro,
  columns,
  empty,
  row,
  detail,
  metrics,
}: {
  kind: Kind
  title: string
  intro: string
  columns: string[]
  empty: { title: string; body: string }
  row: (item: T) => ReactNode
  detail?: (item: T) => ReactNode
  metrics?: (items: T[]) => Metric[]
}) {
  const [params, setParams] = useSearchParams()
  const cursorKey = `${kind}Cursor`
  const cursor = params.get(cursorKey) ?? ''
  const q = useQuery({
    queryKey: ['finance', kind, cursor],
    queryFn: ({ signal }) =>
      api<{ items: T[]; nextCursor: string }>(
        `/finance/${kind}?cursor=${encodeURIComponent(cursor)}`,
        { signal },
      ),
  })
  if (q.isPending) return <Loading />
  if (q.isError) return <LoadError retry={() => void q.refetch()} />
  const selectedID = params.get('record')
  if (selectedID && detail) {
    const selected = q.data.items.find((item) => item.id === selectedID)
    const back = new URLSearchParams(params)
    back.delete('record')
    return (
      <div className="te-record-view">
        <Link className="student-back-link" to={`?${back}`}>
          <ArrowLeft size={17} aria-hidden="true" /> Back to {title.toLowerCase()}
        </Link>
        {selected ? (
          detail(selected)
        ) : (
          <Alert kind="error">This record is not available on this page.</Alert>
        )}
      </div>
    )
  }
  const totals = metrics?.(q.data.items)
  const changePage = (value: string) => {
    const next = new URLSearchParams(params)
    next.delete('record')
    if (value) next.set(cursorKey, value)
    else next.delete(cursorKey)
    setParams(next)
  }
  return (
    <div className="te-record-view">
      <div className="te-section-heading">
        <h2>{title}</h2>
        <span>
          {q.data.items.length} {q.data.items.length === 1 ? 'record' : 'records'} on this page
        </span>
      </div>
      {totals && q.data.items.length > 0 && (
        <dl className="te-metrics" aria-label={`${title} totals on this page`}>
          {totals.map(({ label, amount }) => (
            <div key={label}>
              <dt>
                {label}
                <span>On this page</span>
              </dt>
              <dd>{money(amount)}</dd>
            </div>
          ))}
        </dl>
      )}
      {q.data.items.length ? (
        <TutorRecordTable label={title} countLabel="Your records" intro={intro} columns={columns}>
          {q.data.items.map((item) => (
            <tr key={item.id}>{row(item)}</tr>
          ))}
        </TutorRecordTable>
      ) : (
        <div className="te-empty">
          <Empty title={empty.title} body={empty.body} />
        </div>
      )}
      {(cursor || q.data.nextCursor) && (
        <nav className="te-pagination" aria-label={`${title} pages`}>
          {cursor && (
            <Button variant="secondary" onClick={() => changePage('')}>
              First page
            </Button>
          )}
          {q.data.nextCursor && (
            <Button variant="secondary" onClick={() => changePage(q.data.nextCursor)}>
              Next page <ArrowRight size={16} aria-hidden="true" />
            </Button>
          )}
        </nav>
      )}
    </div>
  )
}

function Allocation({
  amounts,
  pending = false,
}: {
  amounts: Schema['FinancialAmounts']
  pending?: boolean
}) {
  return (
    <dl className="te-allocation">
      {(
        [
          ['grossPaise', 'Class fees'],
          ['tutorNetPaise', 'Your tutor share · 75%'],
          ['platformPaise', 'Platform allocation · 25%'],
          ['gstPaise', 'GST within platform allocation'],
          ['tuitionGstPaise', 'Tuition GST covered by platform'],
          ['tdsPaise', 'TDS covered by platform'],
          ['tcsPaise', 'GST TCS covered by platform'],
        ] as [keyof Schema['FinancialAmounts'], string][]
      )
        .filter((_, index) => !pending || index < 3)
        .map(([key, label]) => (
          <div key={key}>
            <dt>{label}</dt>
            <dd>{money(amounts[key])}</dd>
          </div>
        ))}
    </dl>
  )
}
function Detail({
  title,
  amount,
  children,
}: {
  title: string
  amount: number
  children: ReactNode
}) {
  return (
    <section className="te-detail">
      <div className="te-detail-heading">
        <h2>{title}</h2>
        <strong>{money(amount)}</strong>
      </div>
      {children}
    </section>
  )
}
function ClassEarnings() {
  return (
    <Records<Schema['ClassEarning']>
      kind="earnings"
      title="Class earnings"
      intro="Your recorded share from completed classes. Open a row for its saved allocation."
      columns={['Earned on', 'Your share', 'Payout due', 'Payout status']}
      empty={{
        title: 'No class earnings yet',
        body: 'Completed classes appear here after the required finance checks.',
      }}
      metrics={(items) => [
        {
          label: 'Recorded earnings',
          amount: items.reduce((sum, v) => sum + v.amounts.tutorNetPaise, 0),
        },
        {
          label: 'Awaiting payout',
          amount: items
            .filter((v) => !v.batchId)
            .reduce((sum, v) => sum + v.amounts.tutorNetPaise, 0),
        },
        {
          label: 'In payout batches',
          amount: items
            .filter((v) => v.batchId)
            .reduce((sum, v) => sum + v.amounts.tutorNetPaise, 0),
        },
      ]}
      row={(v) => (
        <>
          <th scope="row">
            <RecordLink id={v.id}>
              <time dateTime={v.earnedAt}>{date(v.earnedAt)}</time>
            </RecordLink>
          </th>
          <td className="te-amount">{money(v.amounts.tutorNetPaise)}</td>
          <td>
            <time dateTime={v.dueAt}>{indiaDate(v.dueAt, 'en')}</time>
          </td>
          <td>
            <Badge tone={v.batchId ? 'teal' : 'neutral'}>
              {v.batchId ? 'In payout batch' : 'Awaiting payout'}
            </Badge>
          </td>
        </>
      )}
      detail={(v) => (
        <Detail title="Class earning details" amount={v.amounts.tutorNetPaise}>
          <dl className="te-record-facts">
            <div>
              <dt>Class reference</dt>
              <dd>{v.id}</dd>
            </div>
            <div>
              <dt>Booking reference</dt>
              <dd>{v.enrollmentId}</dd>
            </div>
            <div>
              <dt>Earned</dt>
              <dd>{indiaDate(v.earnedAt, 'en')}</dd>
            </div>
            <div>
              <dt>Payout due</dt>
              <dd>{indiaDate(v.dueAt, 'en')}</dd>
            </div>
            <div>
              <dt>Payout batch</dt>
              <dd>{v.batchId || 'Awaiting weekly payout'}</dd>
            </div>
          </dl>
          <h3>Saved class allocation</h3>
          <Allocation amounts={v.amounts} />
        </Detail>
      )}
    />
  )
}
const payoutLabels: Record<string, string> = {
  paid: 'Paid',
  verification_pending: 'Awaiting verification',
  prepared: 'Prepared',
}
const payoutStatus = (status: string) => payoutLabels[status] ?? status
function PayoutHistory() {
  return (
    <Records<Schema['PayoutBatch']>
      kind="payouts"
      title="Payout history"
      intro="Prepared batches and verified bank transfers. Open a row for the transfer reference."
      columns={['Created on', 'Amount', 'Classes', 'Status']}
      empty={{
        title: 'No payouts yet',
        body: 'Your weekly payout batches and verified transfers will appear here.',
      }}
      metrics={(items) =>
        ['paid', 'verification_pending', 'prepared'].map((status) => ({
          label: payoutStatus(status),
          amount: items
            .filter((v) => v.status === status)
            .reduce((sum, v) => sum + v.amountPaise, 0),
        }))
      }
      row={(v) => (
        <>
          <th scope="row">
            <RecordLink id={v.id}>
              <time dateTime={v.createdAt}>{date(v.createdAt)}</time>
            </RecordLink>
          </th>
          <td className="te-amount">{money(v.amountPaise)}</td>
          <td>{v.classIds.length}</td>
          <td>
            <Badge
              tone={
                v.status === 'paid'
                  ? 'teal'
                  : v.status === 'verification_pending'
                    ? 'amber'
                    : 'neutral'
              }
            >
              {payoutStatus(v.status)}
            </Badge>
          </td>
        </>
      )}
      detail={(v) => (
        <Detail title="Payout details" amount={v.amountPaise}>
          <Badge tone={v.status === 'paid' ? 'teal' : 'neutral'}>{payoutStatus(v.status)}</Badge>
          <p>
            {v.status === 'paid'
              ? 'Bank settlement verified.'
              : v.status === 'verification_pending'
                ? 'The transfer is recorded and awaits independent bank verification.'
                : v.status === 'prepared'
                  ? 'The payout batch is prepared. A bank transfer has not been recorded.'
                  : v.status}
          </p>
          <dl className="te-record-facts">
            <div>
              <dt>Batch reference</dt>
              <dd>{v.id}</dd>
            </div>
            <div>
              <dt>Created</dt>
              <dd>{indiaDate(v.createdAt, 'en')}</dd>
            </div>
            <div>
              <dt>Classes included</dt>
              <dd>{v.classIds.length}</dd>
            </div>
            <div>
              <dt>Bank reference</dt>
              <dd>{v.reference || 'Not recorded'}</dd>
            </div>
            {v.paidAt && (
              <div>
                <dt>Transfer recorded at</dt>
                <dd>{indiaDate(v.paidAt, 'en')}</dd>
              </div>
            )}
          </dl>
          <details className="te-help">
            <summary>Class references in this payout</summary>
            <ul className="te-references">
              {v.classIds.map((id) => (
                <li key={id}>{id}</li>
              ))}
            </ul>
          </details>
        </Detail>
      )}
    />
  )
}
function PaidBookings() {
  return (
    <Records<Schema['FinanceBooking']>
      kind="bookings"
      title="Paid bookings"
      intro="Saved booking allocations. These amounts become earnings as eligible classes are completed."
      columns={['Paid booking', 'Class fees', 'Your expected share', 'Finance review']}
      empty={{
        title: 'No paid bookings yet',
        body: 'Booking allocations appear after payment is confirmed. Test bookings are excluded.',
      }}
      row={(v) => (
        <>
          <th scope="row">
            <RecordLink id={v.id}>
              <time dateTime={v.createdAt}>{date(v.createdAt)}</time>
            </RecordLink>
          </th>
          <td>{money(v.amounts.grossPaise)}</td>
          <td className="te-amount">{money(v.amounts.tutorNetPaise)}</td>
          <td>
            <Badge tone={v.status === 'tax_review' ? 'amber' : 'teal'}>
              {v.status === 'tax_review' ? 'Review pending' : 'Reviewed'}
            </Badge>
          </td>
        </>
      )}
      detail={(v) => (
        <Detail title="Booking allocation details" amount={v.amounts.tutorNetPaise}>
          <p>
            Expected tutor share for this booking. Completed-class earnings are recorded separately.
          </p>
          <dl className="te-record-facts">
            <div>
              <dt>Booking reference</dt>
              <dd>{v.enrollmentId}</dd>
            </div>
            <div>
              <dt>Created</dt>
              <dd>{indiaDate(v.createdAt, 'en')}</dd>
            </div>
            <div>
              <dt>Finance review</dt>
              <dd>
                {v.status === 'tax_review'
                  ? 'Pending · tutor share reserved'
                  : 'Tax allocation reviewed'}
              </dd>
            </div>
          </dl>
          <h3>Saved booking allocation</h3>
          <Allocation amounts={v.amounts} pending={v.status === 'tax_review'} />
        </Detail>
      )}
    />
  )
}
function ReviewHolds() {
  return (
    <Records<Schema['EarningHold']>
      kind="holds"
      title="Earnings needing review"
      intro="Finance checks that need to be resolved before the affected earnings can be released."
      columns={['Review reason', 'Updated on', 'Class reference']}
      empty={{
        title: 'No earnings need review',
        body: 'Any earnings held for finance checks will appear here with their reason.',
      }}
      row={(v) => (
        <>
          <th scope="row" className="te-review-reason">
            {v.reason}
          </th>
          <td>
            <time dateTime={v.updatedAt}>{date(v.updatedAt)}</time>
          </td>
          <td className="te-reference">{v.id}</td>
        </>
      )}
    />
  )
}
