import { useState, type FormEvent, type ReactNode } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  ArrowLeft,
  ArrowUpRight,
  BookOpen,
  CalendarDays,
  Check,
  Plus,
  Sprout,
  X,
} from 'lucide-react'
import { api, indiaDate, queryClient, send, type Schema } from '../lib/api'
import { useAuth, useConfig, useDashboard } from '../lib/session'
import {
  Alert,
  Badge,
  Button,
  Empty,
  Field,
  LinkButton,
  Loading,
  LoadError,
  MutationError,
} from '../components/ui'
import '../styles/tuition.css'
import { Checkout } from './billing'
import { Conversation } from './conversations'
import { PrivateFiles } from './files'
import { TabBar, TabPanel, useActivePanel } from '../components/workspace-tabs'

type Agreement = Schema['Agreement']
type Detail = Schema['TuitionDetail']
const money = (n: number, lang: string) =>
  new Intl.NumberFormat(lang === 'hi' ? 'hi-IN' : 'en-IN', {
    style: 'currency',
    currency: 'INR',
  }).format(n / 100)
const timeValue = (n: number) =>
  `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`
const minutesValue = (s: string) => {
  const [h, m] = s.split(':').map(Number)
  return h * 60 + m
}
const formValues = (event: FormEvent<HTMLFormElement>) => {
  event.preventDefault()
  return new FormData(event.currentTarget)
}
const value = (d: FormData, name: string) => String(d.get(name) ?? '').trim()
const futureDate = () =>
  new Date(Date.now() + 86400000).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
const indiaISO = (s: string) => new Date(`${s}:00+05:30`).toISOString()
function useAction(path: string) {
  return useMutation({
    mutationFn: (body: unknown) => send(path, body),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['tuition'] }),
        queryClient.invalidateQueries({ queryKey: ['handover-invitations'] }),
      ])
    },
  })
}
function TuitionStatus({ status }: { status: string }) {
  const { t } = useTranslation()
  return (
    <Badge
      tone={
        ['active', 'reviewed', 'completed'].includes(status)
          ? 'teal'
          : ['cancelled', 'expired', 'makeup_due'].includes(status)
            ? 'amber'
            : 'neutral'
      }
    >
      {t(`tuition.status.${status}`)}
    </Badge>
  )
}
function Heading({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <header className="tu-heading">
      <div>
        <h1>{title}</h1>
        {body && <p>{body}</p>}
      </div>
      {action}
    </header>
  )
}
export function AvailabilityPage() {
  const { t } = useTranslation()
  const [saved, setSaved] = useState(false)
  const auth = useAuth()
  const q = useQuery({
    queryKey: ['availability'],
    queryFn: ({ signal }) => api<Schema['Availability']>('/availability', { signal }),
    enabled: auth.data?.user.role === 'tutor',
  })
  if (auth.data?.user.role !== 'tutor') return <Alert>{t('permission')}</Alert>
  return (
    <div className="tu-page">
      <Heading title={t('tuition.availability')} />
      {saved && <Alert kind="success">{t('tuition.saved')}</Alert>}
      {q.isPending ? (
        <Loading />
      ) : q.isError ? (
        <LoadError retry={() => void q.refetch()} />
      ) : (
        <AvailabilityForm key={q.data.version} initial={q.data} onSaved={() => setSaved(true)} />
      )}
    </div>
  )
}
function AvailabilityForm({
  initial,
  onSaved,
}: {
  initial: Schema['Availability']
  onSaved: () => void
}) {
  const { t, i18n } = useTranslation()
  const [windows, setWindows] = useState(initial.windows)
  const [leaveDates, setLeaveDates] = useState(initial.leaveDates)
  const [leaveDate, setLeaveDate] = useState('')
  const mutation = useMutation({
    mutationFn: (body: Schema['Availability']) => send('/availability', body, 'PUT'),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['availability'] })
      onSaved()
    },
  })
  const edit = (index: number, fields: Partial<Schema['WeeklyWindow']>) =>
    setWindows(windows.map((w, i) => (i === index ? { ...w, ...fields } : w)))
  return (
    <form
      className="tu-availability"
      onSubmit={(e) => {
        const d = formValues(e)
        mutation.mutate({
          ...initial,
          windows,
          timezone: value(d, 'timezone'),
          leaveDates: [...new Set([...leaveDates, ...(leaveDate ? [leaveDate] : [])])].sort(),
          bufferMinutes: Number(d.get('buffer')),
          dailyCapacity: Number(d.get('capacity')),
          feePaise: Math.round(Number(d.get('fee')) * 100),
          paused: d.has('paused'),
        })
      }}
    >
      <section className="tu-panel">
        <div className="tu-panel-title">
          <CalendarDays />
          <div>
            <h2>{t('tuition.week')}</h2>
          </div>
        </div>
        <details className="tu-timezone">
          <summary>
            {initial.timezone === 'Asia/Kolkata' ? t('experience.india') : initial.timezone}
          </summary>
          <Field label={t('tuition.timezone')}>
            <input name="timezone" defaultValue={initial.timezone} required maxLength={80} />
          </Field>
        </details>
        <div className="tu-windows">
          {windows.map((w, i) => (
            <fieldset className="tu-window" key={i}>
              <legend>{t('tuition.window', { number: i + 1 })}</legend>
              <Field label={t('tuition.day')}>
                <select value={w.day} onChange={(e) => edit(i, { day: Number(e.target.value) })}>
                  {Array.from({ length: 7 }, (_, day) => (
                    <option value={day} key={day}>
                      {t(`tuition.weekdays.${day}`)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t('tuition.from')}>
                <input
                  type="time"
                  required
                  value={timeValue(w.startMinute)}
                  onChange={(e) => edit(i, { startMinute: minutesValue(e.target.value) })}
                />
              </Field>
              <Field label={t('tuition.until')}>
                <input
                  type="time"
                  required
                  value={timeValue(w.endMinute)}
                  onChange={(e) => edit(i, { endMinute: minutesValue(e.target.value) })}
                />
              </Field>
              <Button
                type="button"
                variant="text"
                aria-label={t('tuition.removeWindow', { number: i + 1 })}
                onClick={() => setWindows(windows.filter((_, x) => x !== i))}
              >
                <X size={18} />
              </Button>
            </fieldset>
          ))}
        </div>
        <Button
          type="button"
          variant="secondary"
          disabled={windows.length >= 21}
          onClick={() => setWindows([...windows, { day: 1, startMinute: 960, endMinute: 1200 }])}
        >
          <Plus size={16} />
          {t('tuition.addWindow')}
        </Button>
        <fieldset className="tu-leave">
          <legend>{t('experience.leave')}</legend>
          <div className="tu-leave-add">
            <Field label={t('experience.leaveDate')}>
              <input
                type="date"
                value={leaveDate}
                disabled={leaveDates.length >= 60}
                onChange={(event) => setLeaveDate(event.target.value)}
              />
            </Field>
            <Button
              type="button"
              variant="secondary"
              disabled={!leaveDate || leaveDates.includes(leaveDate) || leaveDates.length >= 60}
              onClick={() => {
                setLeaveDates([...leaveDates, leaveDate].sort())
                setLeaveDate('')
              }}
            >
              {t('experience.addLeave')}
            </Button>
          </div>
          {leaveDates.length > 0 && (
            <ul className="tu-leave-dates">
              {leaveDates.map((date) => (
                <li key={date}>
                  <time dateTime={date}>
                    {new Intl.DateTimeFormat(i18n.language === 'hi' ? 'hi-IN' : 'en-IN', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                      timeZone: 'Asia/Kolkata',
                    }).format(new Date(`${date}T00:00:00+05:30`))}
                  </time>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={t('experience.removeLeave', { date })}
                    onClick={() => setLeaveDates(leaveDates.filter((item) => item !== date))}
                  >
                    <X size={16} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="fine-print">{t('tuition.leaveHint')}</p>
        </fieldset>
      </section>
      <section className="tu-panel tu-settings">
        <div className="tu-panel-title">
          <Sprout />
          <h2>{t('experience.limits')}</h2>
        </div>
        <div className="tu-form-grid">
          <Field label={t('tuition.buffer')}>
            <input
              name="buffer"
              type="number"
              min="0"
              max="90"
              required
              defaultValue={initial.bufferMinutes}
            />
          </Field>
          <Field label={t('tuition.capacity')}>
            <input
              name="capacity"
              type="number"
              min="1"
              max="12"
              required
              defaultValue={initial.dailyCapacity}
            />
          </Field>
        </div>
        <Field label={t('tuition.fee')} hint={t('tuition.feeHint')}>
          <input
            name="fee"
            type="number"
            min="0"
            max="100000"
            step="0.01"
            required
            defaultValue={initial.feePaise / 100}
          />
        </Field>
        <label className="tu-check">
          <input type="checkbox" name="paused" defaultChecked={initial.paused} />
          {t('tuition.paused')}
        </label>
        <MutationError error={mutation.error} />
        <Button busy={mutation.isPending}>
          <Check size={17} />
          {t('tuition.saveAvailability')}
        </Button>
      </section>
    </form>
  )
}
export default function Tuition() {
  const { id } = useParams()
  const { t } = useTranslation()
  const auth = useAuth()
  if (!['parent', 'tutor', 'mentor'].includes(auth.data?.user.role ?? ''))
    return <Alert>{t('permission')}</Alert>
  return id ? <TuitionDetail id={id} /> : <TuitionList />
}
function TuitionList() {
  const { t, i18n } = useTranslation()
  const auth = useAuth()
  const [params, setParams] = useSearchParams()
  const cursor = params.get('cursor') ?? ''
  const q = useQuery({
    queryKey: ['tuition', 'list', cursor],
    queryFn: ({ signal }) =>
      api<Schema['EnrollmentPage']>(`/enrollments?cursor=${encodeURIComponent(cursor)}`, {
        signal,
      }),
  })
  return (
    <div className="tu-page">
      <Heading
        title={t(auth.data?.user.role === 'parent' ? 'parent.classes' : 'tuition.title')}
        action={
          auth.data?.user.role === 'tutor' ? (
            <LinkButton to="/availability" secondary>
              {t('tuition.availability')}
            </LinkButton>
          ) : undefined
        }
      />
      {auth.data?.user.role === 'parent' && <NewAgreement />}
      {auth.data?.user.role === 'tutor' && <Invitations />}
      {q.isPending ? (
        <Loading />
      ) : q.isError ? (
        <LoadError retry={() => void q.refetch()} />
      ) : (
        <>
          {q.data.items.length === 0 ? (
            <Empty
              title={t(auth.data?.user.role === 'parent' ? 'tuition.none' : 'tuition.noAssigned')}
              body={t(
                auth.data?.user.role === 'parent' ? 'tuition.noneBody' : 'tuition.noAssignedBody',
              )}
            />
          ) : (
            <div className="tu-card-grid">
              {q.data.items.map((enrollment) => (
                <article className="tu-enrollment" key={enrollment.id}>
                  <div className="tu-card-top">
                    <span className="tu-book">
                      <BookOpen />
                    </span>
                    <TuitionStatus status={enrollment.status} />
                  </div>
                  <h2>{enrollment.learnerName}</h2>
                  <p>{t('tuition.withTutor', { name: enrollment.tutorName })}</p>
                  <div className="tu-card-meta">
                    <span>
                      {enrollment.agreement.sessionCount} {t('tuition.agreed')}
                    </span>
                    <strong>{money(enrollment.agreement.totalPaise, i18n.language)}</strong>
                  </div>
                  <Link to={`/tuition/${enrollment.id}`} className="tu-card-link">
                    {t('tuition.open')}
                    <ArrowUpRight size={20} />
                  </Link>
                </article>
              ))}
            </div>
          )}
          {(cursor || q.data.nextCursor) && (
            <div className="tu-actions">
              {cursor && (
                <Button variant="secondary" onClick={() => setParams({})}>
                  {t('tuition.firstPage')}
                </Button>
              )}
              {q.data.nextCursor && (
                <Button
                  variant="secondary"
                  onClick={() => setParams({ cursor: q.data.nextCursor })}
                >
                  {t('tuition.nextPage')}
                </Button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
function NewAgreement() {
  const { t, i18n } = useTranslation()
  const dashboard = useDashboard()
  const [trialId, setTrialId] = useState('')
  const trials = dashboard.data?.trials.filter((trial) => trial.status === 'reviewed') ?? []
  const selected = trials.find((trial) => trial.id === trialId)
  if (dashboard.isError) return <LoadError retry={() => void dashboard.refetch()} />
  if (!trials.length) return null
  return (
    <details className="tu-panel tu-disclosure">
      <summary>
        <Plus size={20} />
        {t('tuition.new')}
      </summary>
      <Field label={t('tuition.chooseTrial')}>
        <select value={trialId} onChange={(e) => setTrialId(e.target.value)}>
          <option value="">—</option>
          {trials.map((trial) => (
            <option value={trial.id} key={trial.id}>
              {trial.learnerName} · {indiaDate(trial.start, i18n.language)}
            </option>
          ))}
        </select>
      </Field>
      {selected && (
        <AgreementForm key={selected.id} trialId={selected.id} tutorId={selected.tutorId} />
      )}
    </details>
  )
}
function AgreementForm({ trialId, tutorId }: { trialId: string; tutorId: string }) {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const [key] = useState(() => crypto.randomUUID())
  const [count, setCount] = useState(4)
  const q = useQuery({
    queryKey: ['availability', tutorId],
    queryFn: ({ signal }) =>
      api<Schema['Availability']>(`/tutors/${tutorId}/availability`, { signal }),
  })
  const mutation = useMutation({
    mutationFn: (body: Schema['EnrollmentInput']) =>
      send<Schema['Enrollment']>('/enrollments', body, 'POST', { 'Idempotency-Key': key }),
    onSuccess: async (e) => {
      await queryClient.invalidateQueries({ queryKey: ['tuition'] })
      navigate(`/tuition/${e.id}`)
    },
  })
  if (q.isPending) return <Loading />
  if (q.isError) return <LoadError retry={() => void q.refetch()} />
  if (!q.data.windows.length || q.data.paused)
    return <Alert>{t('tuition.noAvailabilityBody')}</Alert>
  return (
    <form
      className="tu-proposal"
      onSubmit={(event) => {
        const d = formValues(event)
        mutation.mutate({
          trialId,
          offeringVersion: q.data.version,
          accepted: true,
          schedule: {
            startDate: value(d, 'date'),
            time: value(d, 'time'),
            timezone: 'Asia/Kolkata',
            weekdays: d.getAll('days').map(Number),
            count,
            minutes: Number(d.get('minutes')),
          },
        })
      }}
    >
      <div className="tu-form-grid">
        <Field label={t('tuition.firstDate')}>
          <input name="date" type="date" min={futureDate()} defaultValue={futureDate()} required />
        </Field>
        <Field label={t('tuition.time')}>
          <input name="time" type="time" required />
        </Field>
        <Field label={t('tuition.count')}>
          <input
            name="count"
            type="number"
            min="1"
            max="24"
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
            required
          />
        </Field>
        <Field label={t('tuition.minutes')}>
          <input name="minutes" type="number" min="30" max="120" defaultValue={60} required />
        </Field>
      </div>
      <fieldset className="tu-weekdays">
        <legend>{t('tuition.repeatDays')}</legend>
        {Array.from({ length: 7 }, (_, day) => (
          <label key={day}>
            <input type="checkbox" name="days" value={day} />
            <span>{t(`tuition.weekdays.${day}`)}</span>
          </label>
        ))}
      </fieldset>
      <div className="tu-quote">
        <div>
          <span>{t('tuition.perSession')}</span>
          <strong>{money(q.data.feePaise, i18n.language)}</strong>
        </div>
        <div>
          <span>{t('tuition.total')}</span>
          <strong>{money(q.data.feePaise * count, i18n.language)}</strong>
        </div>
      </div>
      <Policy />
      <label className="tu-check">
        <input name="accepted" type="checkbox" required />
        {t('tuition.acceptTerms')}
      </label>
      <MutationError error={mutation.error} />
      <Button busy={mutation.isPending}>{t('tuition.proposeAgreement')}</Button>
    </form>
  )
}
function Policy() {
  const { t } = useTranslation()
  return (
    <div className="tu-policy">
      <strong>{t('tuition.policy')}</strong>
      <p>{t('tuition.policyBody')}</p>
    </div>
  )
}
function AgreementCard({ agreement }: { agreement: Agreement }) {
  const { t, i18n } = useTranslation()
  return (
    <article className="tu-panel">
      <div className="tu-panel-title">
        <BookOpen />
        <h2>{t('tuition.version', { number: agreement.version })}</h2>
      </div>
      <div className="tu-quote">
        <div>
          <span>{t('tuition.agreed')}</span>
          <strong>{agreement.sessionCount}</strong>
        </div>
        <div>
          <span>{t('tuition.total')}</span>
          <strong>{money(agreement.totalPaise, i18n.language)}</strong>
        </div>
      </div>
      <Policy />
      <details className="tu-disclosure">
        <summary>{t('tuition.classes')}</summary>
        <ul className="tu-dates">
          {agreement.starts.map((start) => (
            <li key={start}>{indiaDate(start, i18n.language)}</li>
          ))}
        </ul>
      </details>
    </article>
  )
}
function TuitionDetail({ id }: { id: string }) {
  const { t } = useTranslation()
  const auth = useAuth()
  const [params, setParams] = useSearchParams()
  const tabs = ['classes', 'plan', 'messages', 'files', 'agreement', 'handover']
  const tab = tabs.includes(params.get('tab') ?? '') ? params.get('tab')! : 'classes'
  const q = useQuery({
    queryKey: ['tuition', id],
    queryFn: ({ signal }) => api<Detail>(`/enrollments/${id}`, { signal }),
  })
  if (q.isPending) return <Loading />
  if (q.isError) return <LoadError retry={() => void q.refetch()} />
  const d = q.data,
    e = d.enrollment,
    role = auth.data!.user.role
  return (
    <div className="tu-page">
      <Link to="/tuition" className="tu-back">
        <ArrowLeft size={16} />
        {t('tuition.back')}
      </Link>
      <Heading
        title={e.learnerName}
        body={t('tuition.withTutor', { name: e.tutorName })}
        action={<TuitionStatus status={e.status} />}
      />
      <div className="tu-overview">
        {[
          ['agreed', e.agreement.sessionCount],
          ['delivered', d.delivered],
          ['remaining', d.remaining],
        ].map(([label, number]) => (
          <div key={label}>
            <span>{t(`tuition.${label}`)}</span>
            <strong>{number}</strong>
          </div>
        ))}
      </div>
      {e.status === 'pending_agreement' && (
        <section className="tu-panel">
          <h2>{t(role === 'tutor' ? 'tuition.reviewAgreement' : 'tuition.agreementAwaiting')}</h2>
          <p>{t('tuition.agreementAwaitingBody')}</p>
          {role === 'tutor' && tab !== 'agreement' && (
            <Button onClick={() => setParams({ tab: 'agreement' })}>
              {t('tuition.agreement')}
            </Button>
          )}
        </section>
      )}
      {e.status === 'awaiting_payment' && (
        <Alert>
          <strong>{t('tuition.pricePending')}</strong>
          <p>{t('tuition.pricePendingBody')}</p>
        </Alert>
      )}
      {e.status === 'awaiting_payment' && role === 'parent' && <Checkout enrollment={e} />}
      <TabBar
        id="tuition"
        label={t('tuition.title')}
        value={tab}
        options={tabs.map((value) => ({ value, label: t(`tuition.${value}`) }))}
        onChange={(value) => {
          const next = new URLSearchParams(params)
          next.set('tab', value)
          setParams(next)
        }}
      />
      <TabPanel id="tuition" value="classes" active={tab === 'classes'} preserve>
        <div className="tu-session-list">
          {[...d.sessions]
            .sort((a, b) => a.start.localeCompare(b.start))
            .map((session) => (
              <ClassCard
                key={`${session.id}:${session.version}`}
                session={session}
                enrollment={e}
              />
            ))}
        </div>
      </TabPanel>
      <TabPanel id="tuition" value="plan" active={tab === 'plan'} preserve>
        <Plans detail={d} />
      </TabPanel>
      <TabPanel id="tuition" value="agreement" active={tab === 'agreement'} preserve>
        <div className="tu-stack">
          {[...d.agreements]
            .sort((a, b) => b.version - a.version)
            .map((a) => (
              <AgreementCard key={a.id} agreement={a} />
            ))}
        </div>
        {e.status === 'pending_agreement' && role === 'tutor' && (
          <EnrollmentAction enrollment={e} action="accept" label="acceptAgreement" />
        )}
      </TabPanel>
      <TabPanel id="tuition" value="handover" active={tab === 'handover'} preserve>
        <Continuity detail={d} />
      </TabPanel>
      <TabPanel id="tuition" value="messages" active={tab === 'messages'} preserve>
        <Conversation enrollment={e} />
      </TabPanel>
      <TabPanel id="tuition" value="files" active={tab === 'files'} preserve>
        <PrivateFiles
          target="enrollments"
          id={e.id}
          canUpload={['active', 'paused', 'pending_agreement', 'awaiting_payment'].includes(
            e.status,
          )}
        />
      </TabPanel>
      {tab === 'agreement' &&
        ['parent', 'tutor'].includes(role) &&
        ['active', 'paused', 'pending_agreement', 'awaiting_payment'].includes(e.status) && (
          <section className="tu-panel tu-controls">
            {e.status === 'active' && (
              <EnrollmentAction enrollment={e} action="pause" label="pause" />
            )}
            {e.status === 'paused' && (
              <EnrollmentAction enrollment={e} action="resume" label="resume" />
            )}
            <EnrollmentAction enrollment={e} action="cancel" label="cancelTuition" />
          </section>
        )}
    </div>
  )
}
function EnrollmentAction({
  enrollment,
  action,
  label,
}: {
  enrollment: Schema['Enrollment']
  action: string
  label: string
}) {
  const { t } = useTranslation()
  const mutation = useAction(`/enrollments/${enrollment.id}/action`)
  if (action === 'accept')
    return (
      <>
        <MutationError error={mutation.error} />
        <Button
          busy={mutation.isPending}
          onClick={() => mutation.mutate({ action, version: enrollment.version })}
        >
          {t(`tuition.${label}`)}
        </Button>
      </>
    )
  return (
    <details className="tu-disclosure">
      <summary>{t(`tuition.${label}`)}</summary>
      <form
        className="tu-stack"
        onSubmit={(event) => {
          const d = formValues(event)
          mutation.mutate({ action, version: enrollment.version, reason: value(d, 'reason') })
        }}
      >
        <Reason />
        <MutationError error={mutation.error} />
        <Button variant={action === 'cancel' ? 'danger' : 'secondary'} busy={mutation.isPending}>
          {t('tuition.confirm')}
        </Button>
      </form>
    </details>
  )
}
function Reason() {
  const { t } = useTranslation()
  return (
    <Field label={t('tuition.reason')}>
      <textarea name="reason" required minLength={5} maxLength={800} rows={2} />
    </Field>
  )
}
function ClassCard({
  session: s,
  enrollment,
}: {
  session: Schema['ClassSession']
  enrollment: Schema['Enrollment']
}) {
  const { t, i18n } = useTranslation()
  const auth = useAuth(),
    config = useConfig()
  const role = auth.data!.user.role
  const mutation = useAction(`/classes/${s.id}/action`)
  const [action, setAction] = useState('')
  const active = ['active', 'paused'].includes(enrollment.status)
  const editable = active && ['parent', 'tutor'].includes(role)
  const act = (body: Record<string, unknown>) => mutation.mutate({ ...body, version: s.version })
  return (
    <article className="tu-session">
      <div className="tu-session-mark">
        <CalendarDays size={23} />
      </div>
      <div className="tu-session-content">
        <div className="tu-card-top">
          <h2>{indiaDate(s.start, i18n.language)}</h2>
          <TuitionStatus status={s.status} />
        </div>
        {s.proposal && (
          <div className="tu-policy">
            <strong>
              {t('tuition.proposal')}: {indiaDate(s.proposal.start, i18n.language)}
            </strong>
            <p>{s.proposal.reason}</p>
            {editable && s.proposal.by !== auth.data!.user.id && (
              <Button
                variant="secondary"
                busy={mutation.isPending}
                onClick={() => act({ action: 'accept_change' })}
              >
                {t('tuition.acceptChange')}
              </Button>
            )}
          </div>
        )}
        {s.reason && <p>{s.reason}</p>}
        {s.notes && (
          <div className="tu-evidence">
            <div>
              <h3>{t('tuition.notes')}</h3>
              <p>{s.notes}</p>
            </div>
            <div>
              <h3>{t('tuition.homework')}</h3>
              <p>{s.homework}</p>
            </div>
            <div>
              <h3>{t('tuition.attendance')}</h3>
              <p>{t(`tuition.${s.attendance}`)}</p>
            </div>
            {s.review && (
              <div>
                <h3>{t('tuition.review')}</h3>
                <p>{s.review}</p>
              </div>
            )}
          </div>
        )}
        <div className="tu-actions">
          {editable && ['scheduled', 'makeup_due'].includes(s.status) && (
            <Button variant="text" onClick={() => setAction(action === 'propose' ? '' : 'propose')}>
              {t('tuition.scheduleChange')}
            </Button>
          )}
          {editable && s.status === 'scheduled' && (
            <Button variant="text" onClick={() => setAction(action === 'cancel' ? '' : 'cancel')}>
              {t('tuition.cancelClass')}
            </Button>
          )}
          {role === 'tutor' && enrollment.status === 'active' && s.status === 'scheduled' && (
            <Button
              variant="secondary"
              onClick={() => setAction(action === 'record' ? '' : 'record')}
            >
              {t('tuition.record')}
            </Button>
          )}
          {role === 'mentor' && active && s.status === 'awaiting_review' && (
            <Button
              variant="secondary"
              onClick={() =>
                setAction(s.attendance === 'disputed' ? 'resolve_attendance' : 'review')
              }
            >
              {t(s.attendance === 'disputed' ? 'tuition.resolveAttendance' : 'tuition.review')}
            </Button>
          )}
        </div>
        {action && (
          <form
            className="tu-inline-form"
            onSubmit={(event) => {
              const d = formValues(event)
              act({
                action,
                ...(action === 'propose' ? { start: indiaISO(value(d, 'start')) } : {}),
                reason: value(d, 'reason'),
                notes: value(d, 'notes'),
                homework: value(d, 'homework'),
                review: value(d, 'review'),
                attendance: value(d, 'attendance'),
                developmentRecord: d.has('developmentRecord'),
              })
            }}
          >
            {action === 'propose' && (
              <Field label={t('tuition.newTime')}>
                <input type="datetime-local" name="start" required />
              </Field>
            )}
            {['cancel', 'propose', 'resolve_attendance'].includes(action) && <Reason />}
            {action === 'cancel' && <p>{t('tuition.cancellationNote')}</p>}
            {action === 'record' && (
              <>
                <Field label={t('tuition.notes')}>
                  <textarea name="notes" minLength={10} maxLength={2000} required />
                </Field>
                <Field label={t('tuition.homework')}>
                  <textarea name="homework" minLength={5} maxLength={1200} required />
                </Field>
                {config.data?.development && (
                  <label className="tu-check">
                    <input type="checkbox" name="developmentRecord" />
                    {t('tuition.developmentRecord')}
                  </label>
                )}
              </>
            )}
            {['record', 'resolve_attendance'].includes(action) && (
              <Field label={t('tuition.attendance')}>
                <select name="attendance">
                  {(action === 'record'
                    ? ['present', 'absent', 'disputed']
                    : ['present', 'absent']
                  ).map((a) => (
                    <option key={a} value={a}>
                      {t(`tuition.${a}`)}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            {action === 'review' && (
              <Field label={t('tuition.reviewEvidence')}>
                <textarea name="review" minLength={10} maxLength={2000} required />
              </Field>
            )}
            <Button busy={mutation.isPending}>{t('tuition.confirm')}</Button>
          </form>
        )}
        <MutationError error={mutation.error} />
      </div>
    </article>
  )
}
function Plans({ detail }: { detail: Detail }) {
  const { t, i18n } = useTranslation()
  const auth = useAuth()
  const plans = [...detail.plans].sort((a, b) => b.version - a.version)
  return (
    <div className="tu-stack">
      {auth.data?.user.role === 'mentor' &&
        ['active', 'paused'].includes(detail.enrollment.status) && (
          <details className="tu-panel tu-disclosure" key={detail.enrollment.planVersion}>
            <summary>
              <Plus size={18} />
              {t('tuition.editPlan')}
            </summary>
            <PlanForm detail={detail} previous={plans[0]} />
          </details>
        )}
      {!plans.length && <Empty title={t('tuition.noPlan')} body={t('tuition.noPlanBody')} />}
      {plans.map((plan) => (
        <article key={plan.id} className="tu-panel">
          <div className="tu-panel-title">
            <Sprout />
            <div>
              <h2>{t('tuition.version', { number: plan.version })}</h2>
              <p>
                {t('tuition.reviewOn')}: {indiaDate(plan.reviewDate, i18n.language)}
              </p>
            </div>
          </div>
          <div className="tu-evidence">
            <div>
              <h3>{t('tuition.startingPoint')}</h3>
              <p>{plan.startingPoint}</p>
            </div>
            <div>
              <h3>{t('tuition.goals')}</h3>
              <p>{plan.goals}</p>
            </div>
          </div>
          <div className="tu-topics">
            {plan.topics.map((topic, index) => (
              <div key={index}>
                <div className="tu-card-top">
                  <h3>{topic.title}</h3>
                  <Badge tone="neutral">{t(`tuition.${topic.status}`)}</Badge>
                </div>
                <p>{topic.evidence}</p>
                <p>
                  <strong>{t('tuition.practice')}: </strong>
                  {topic.practice}
                </p>
              </div>
            ))}
          </div>
          <h3>{t('tuition.nextSteps')}</h3>
          <p>{plan.nextSteps}</p>
        </article>
      ))}
    </div>
  )
}
function PlanForm({ detail, previous }: { detail: Detail; previous?: Schema['LearningPlan'] }) {
  const { t } = useTranslation()
  const [topics, setTopics] = useState<Schema['LearningTopic'][]>(
    previous?.topics ?? [{ title: '', status: 'introduced', evidence: '', practice: '' }],
  )
  const mutation = useAction(`/enrollments/${detail.enrollment.id}/plans`)
  const edit = (index: number, field: string, content: string) =>
    setTopics(topics.map((topic, i) => (i === index ? { ...topic, [field]: content } : topic)))
  return (
    <form
      className="tu-stack"
      onSubmit={(event) => {
        const d = formValues(event)
        mutation.mutate({
          expectedVersion: detail.enrollment.planVersion,
          startingPoint: value(d, 'startingPoint'),
          goals: value(d, 'goals'),
          topics,
          nextSteps: value(d, 'nextSteps'),
          reviewDate: indiaISO(`${value(d, 'reviewDate')}T12:00`),
        })
      }}
    >
      {(['startingPoint', 'goals'] as const).map((name) => (
        <Field key={name} label={t(`tuition.${name}`)}>
          <textarea
            name={name}
            defaultValue={previous?.[name]}
            required
            minLength={10}
            maxLength={1500}
          />
        </Field>
      ))}
      {topics.map((topic, i) => (
        <fieldset key={i} className="tu-topic-form">
          <legend>{t('tuition.topic', { number: i + 1 })}</legend>
          <Field label={t('tuition.topicTitle')}>
            <input
              value={topic.title}
              onChange={(e) => edit(i, 'title', e.target.value)}
              required
              minLength={3}
              maxLength={120}
            />
          </Field>
          <Field label={t('tuition.topicStatus')}>
            <select value={topic.status} onChange={(e) => edit(i, 'status', e.target.value)}>
              {['introduced', 'practising', 'independent', 'needs_review'].map((s) => (
                <option key={s} value={s}>
                  {t(`tuition.${s}`)}
                </option>
              ))}
            </select>
          </Field>
          {['evidence', 'practice'].map((name) => (
            <Field key={name} label={t(`tuition.${name}`)}>
              <textarea
                value={topic[name as 'evidence' | 'practice']}
                onChange={(e) => edit(i, name, e.target.value)}
                required
                minLength={5}
                maxLength={800}
              />
            </Field>
          ))}
          <Button
            type="button"
            variant="text"
            disabled={topics.length === 1}
            onClick={() => setTopics(topics.filter((_, index) => i !== index))}
          >
            {t('tuition.removeTopic', { number: i + 1 })}
          </Button>
        </fieldset>
      ))}
      <Button
        type="button"
        variant="secondary"
        disabled={topics.length >= 8}
        onClick={() =>
          setTopics([...topics, { title: '', status: 'introduced', evidence: '', practice: '' }])
        }
      >
        {t('tuition.addTopic')}
      </Button>
      <Field label={t('tuition.nextSteps')}>
        <textarea
          name="nextSteps"
          defaultValue={previous?.nextSteps}
          required
          minLength={10}
          maxLength={1200}
        />
      </Field>
      <Field label={t('tuition.reviewDate')}>
        <input name="reviewDate" type="date" min={futureDate()} required />
      </Field>
      <MutationError error={mutation.error} />
      <Button busy={mutation.isPending}>{t('tuition.publishPlan')}</Button>
    </form>
  )
}
function Continuity({ detail }: { detail: Detail }) {
  const active = useActivePanel()
  const { t } = useTranslation()
  const auth = useAuth()
  const parent = auth.data?.user.role === 'parent'
  const open = detail.handovers.some((h) => ['requested', 'awaiting_tutor'].includes(h.status))
  const tutors = useQuery({
    queryKey: ['public-tutors'],
    queryFn: ({ signal }) => api<Schema['PublicTutor'][]>('/tutors', { signal }),
    enabled: active && parent && !open,
  })
  const mutation = useAction(`/enrollments/${detail.enrollment.id}/handovers`)
  return (
    <div className="tu-stack">
      <section className="tu-panel">
        <div className="tu-panel-title">
          <Sprout />
          <h2>{t('tuition.handoverTitle')}</h2>
        </div>
        <p>{t('tuition.handoverBody')}</p>
        {parent &&
          !open &&
          ['active', 'paused'].includes(detail.enrollment.status) &&
          (tutors.isPending ? (
            <Loading />
          ) : tutors.isError ? (
            <LoadError retry={() => void tutors.refetch()} />
          ) : (
            <form
              className="tu-stack"
              onSubmit={(event) => {
                const d = formValues(event)
                mutation.mutate({
                  tutorId: value(d, 'tutorId'),
                  reason: value(d, 'reason'),
                  consent: true,
                })
              }}
            >
              <Field label={t('tuition.replacement')}>
                <select name="tutorId" required>
                  <option value="">—</option>
                  {tutors.data
                    .filter((t) => t.id !== detail.enrollment.tutorId)
                    .map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                </select>
              </Field>
              <Reason />
              <label className="tu-check">
                <input type="checkbox" required />
                {t('tuition.consent')}
              </label>
              <MutationError error={mutation.error} />
              <Button busy={mutation.isPending}>{t('tuition.requestChange')}</Button>
            </form>
          ))}
      </section>
      {!detail.handovers.length ? (
        <p>{t('tuition.noHistory')}</p>
      ) : (
        detail.handovers.map((h) => <HandoverCard key={`${h.id}:${h.status}`} handover={h} />)
      )}
    </div>
  )
}
function HandoverCard({ handover: h }: { handover: Schema['Handover'] }) {
  const { t, i18n } = useTranslation()
  const auth = useAuth()
  const mutation = useAction(`/handovers/${h.id}/action`)
  return (
    <article className="tu-panel">
      <div className="tu-card-top">
        <h2>{indiaDate(h.createdAt, i18n.language)}</h2>
        <TuitionStatus status={h.status} />
      </div>
      <p>{h.reason}</p>
      {h.nextSteps && (
        <>
          <h3>{t('tuition.nextSteps')}</h3>
          <p>{h.nextSteps}</p>
        </>
      )}
      {auth.data?.user.role === 'mentor' && h.status === 'requested' && (
        <form
          className="tu-stack"
          onSubmit={(event) => {
            const d = formValues(event)
            mutation.mutate({ action: 'prepare', nextSteps: value(d, 'nextSteps') })
          }}
        >
          <Field label={t('tuition.nextSteps')}>
            <textarea name="nextSteps" required minLength={10} maxLength={1800} />
          </Field>
          <Button busy={mutation.isPending}>{t('tuition.prepareHandover')}</Button>
        </form>
      )}
      {auth.data?.user.role === 'parent' && ['requested', 'awaiting_tutor'].includes(h.status) && (
        <Button
          variant="secondary"
          busy={mutation.isPending}
          onClick={() => mutation.mutate({ action: 'cancel' })}
        >
          {t('tuition.withdraw')}
        </Button>
      )}
      <MutationError error={mutation.error} />
    </article>
  )
}
function Invitations() {
  const { t } = useTranslation()
  const q = useQuery({
    queryKey: ['handover-invitations'],
    queryFn: ({ signal }) =>
      api<Schema['HandoverInvitation'][]>('/handovers/invitations', { signal }),
  })
  if (q.isError) return <LoadError retry={() => void q.refetch()} />
  if (!q.data?.length) return null
  return (
    <section className="tu-stack">
      <h2>{t('tuition.invitations')}</h2>
      <p>{t('tuition.invitationBody')}</p>
      {q.data.map((item) => (
        <Invitation key={item.handover.id} item={item} />
      ))}
    </section>
  )
}
function Invitation({ item }: { item: Schema['HandoverInvitation'] }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const mutation = useMutation({
    mutationFn: (body: Schema['HandoverAction']) =>
      send(`/handovers/${item.handover.id}/action`, body),
    onSuccess: async (_, body) => {
      if (body.action === 'accept') navigate(`/tuition/${item.handover.enrollmentId}`)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['tuition'] }),
        queryClient.invalidateQueries({ queryKey: ['handover-invitations'] }),
      ])
    },
  })
  return (
    <article className="tu-panel">
      <AgreementCard agreement={item.agreement} />
      <p>{item.handover.nextSteps}</p>
      <div className="tu-actions">
        <Button busy={mutation.isPending} onClick={() => mutation.mutate({ action: 'accept' })}>
          {t('tuition.acceptInvitation')}
        </Button>
        <Button
          variant="secondary"
          busy={mutation.isPending}
          onClick={() => mutation.mutate({ action: 'decline' })}
        >
          {t('tuition.declineInvitation')}
        </Button>
      </div>
      <MutationError error={mutation.error} />
    </article>
  )
}
