import { useQuery, useMutation } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import {
  api,
  APIError,
  indiaDate,
  queryClient,
  send,
  type Dashboard,
  type Schema,
} from '../lib/api'
import { useClock } from '../lib/clock'
import { reportDate } from '../lib/learner-progress'
import type { WorkspaceView } from '../lib/workspace'
import LearnerProgressReport from '../components/learner-progress'
import { TrialCard } from '../components/trial-card'
import { InterviewCard } from '../components/interview'
import { Alert, Badge, Button, Empty, Field, Loading, LoadError, Status } from '../components/ui'
import '../styles/tuition.css'
import '../styles/tutor-workspace.css'

const subjects = (en: Schema['Enrollment']) =>
  (en.agreement.subjects ?? [en.agreement.subject]).join(', ')
export default function TutorWorkspace({ data, view }: { data: Dashboard; view: WorkspaceView }) {
  const [params, setParams] = useSearchParams()
  const now = useClock()
  const application = data.applications[0]
  const q = useQuery({
    queryKey: ['tutor-workspace'],
    queryFn: ({ signal }) => api<Schema['TutorWorkspace']>('/tutor/workspace', { signal }),
    refetchInterval: 15000,
  })
  const mark = useMutation({
    mutationFn: (id: string) => send(`/notifications/${encodeURIComponent(id)}/read`, {}),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['tutor-workspace'] }),
        queryClient.invalidateQueries({ queryKey: ['notifications'] }),
      ])
    },
  })
  const set = (values: Record<string, string>) => {
    const next = new URLSearchParams(params)
    for (const [key, value] of Object.entries(values)) {
      if (value) next.set(key, value)
      else next.delete(key)
    }
    setParams(next)
  }
  if (q.isPending) return <Loading />
  if (q.isError)
    return q.error instanceof APIError && q.error.status === 403 ? (
      <Alert kind="error">{q.error.message}</Alert>
    ) : (
      <LoadError retry={() => void q.refetch()} />
    )
  const d = q.data
  const byID = new Map(d.enrollments.map((en) => [en.id, en]))
  const trials = [...d.trials].sort((a, b) => b.start.localeCompare(a.start))
  const queues = ['all', 'requested', 'confirmed', 'completed', 'reviewed', 'cancelled', 'declined']
  const queue = queues.includes(params.get('queue') ?? '') ? params.get('queue')! : 'all'
  if (view === 'sessions')
    return (
      <section className="teacher-sessions" aria-label="Trial lessons">
        <h2 className="sr-only">Trial records</h2>
        <nav className="teacher-filters" aria-label="Filter trial lessons">
          {queues.map((value) => (
            <Link
              key={value}
              to={`/workspace?view=sessions${value === 'all' ? '' : `&queue=${value}`}`}
              aria-current={queue === value ? 'page' : undefined}
            >
              {value === 'reviewed'
                ? 'Historical reviews'
                : value === 'all'
                  ? 'All trials'
                  : value[0].toUpperCase() + value.slice(1)}
              <span>
                {value === 'all' ? trials.length : trials.filter((t) => t.status === value).length}
              </span>
            </Link>
          ))}
        </nav>
        <div className="queue">
          {trials
            .filter((t) => queue === 'all' || t.status === queue)
            .map((t) => (
              <TrialCard key={t.id} trial={t} role="tutor" />
            ))}
        </div>
        {!trials.some((t) => queue === 'all' || t.status === queue) && (
          <Empty title="No trials in this view" />
        )}
      </section>
    )
  if (view === 'learners') {
    const selected = d.learners.find((l) => l.id === params.get('learner')) ?? d.learners[0]
    if (!selected)
      return (
        <Empty
          title="No assigned learners yet"
          body="Learners appear here when a trial is requested or a regular booking is confirmed."
        />
      )
    const enrolled = d.enrollments.filter(
      (en) => en.learnerId === selected.id && ['active', 'paused'].includes(en.status),
    )
    const location = d.briefs.find((brief) => brief.learnerId === selected.id)?.location
    const learnerTrials = trials.filter((t) => t.learnerId === selected.id)
    return (
      <div className="tutor-learners">
        <Field label="Learner">
          <select
            value={selected.id}
            onChange={(e) =>
              set({
                learner: e.target.value,
                reportTab: '',
                subject: '',
                tutor: '',
                range: '',
                from: '',
                to: '',
              })
            }
          >
            {d.learners.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </Field>
        <section className="tu-panel tutor-preparation">
          <h2>Teaching brief</h2>
          <p>
            Class {selected.class} · {selected.board} · Teaching language: {selected.language}
          </p>
          {location && (
            <p>
              <strong>Home teaching address:</strong> {location.address}
            </p>
          )}
          {enrolled.map((en) => (
            <div key={en.id}>
              <p>
                <strong>{subjects(en)}</strong> ·{' '}
                {en.agreement.mode === 'home' ? 'Home Tuition' : 'Online'} ·{' '}
                {en.agreement.sessionCount} classes · {en.agreement.minutes} minutes per class
              </p>
              <Link className="text-link" to={`/tuition/${en.id}`}>
                Open classes and lesson plan
              </Link>
            </div>
          ))}
          {!enrolled.length &&
            learnerTrials.map((t) => (
              <p key={t.id}>
                {(t.subjects ?? [t.subject]).join(', ')} ·{' '}
                {t.mode === 'home' ? 'Home Tuition' : 'Online'} trial · {indiaDate(t.start, 'en')}
              </p>
            ))}
        </section>
        {enrolled.length ? (
          <LearnerProgressReport key={selected.id} learner={selected} tutor />
        ) : (
          <Empty
            title="Prepare for the trial"
            body="Use Trial lessons to accept the request and submit your feedback. A progress report opens after a regular booking is confirmed."
          />
        )}
      </div>
    )
  }
  const operational = d.sessions.filter((s) =>
    ['active', 'paused'].includes(byID.get(s.enrollmentId)?.status ?? ''),
  )
  const scheduled = operational.filter(
    (s) => s.status === 'scheduled' && byID.get(s.enrollmentId)?.status === 'active',
  )
  const lessonLink = (s: Schema['ClassSession']) =>
    `/tuition/${encodeURIComponent(s.enrollmentId)}?class=${encodeURIComponent(s.id)}`
  const upcoming = [
    ...scheduled
      .filter((s) => Date.parse(s.end) > now)
      .map((s) => ({
        id: s.id,
        name: byID.get(s.enrollmentId)!.learnerName,
        start: s.start,
        end: s.end,
        label: 'Regular class',
        subject: s.plannedSubject || subjects(byID.get(s.enrollmentId)!),
        link: lessonLink(s),
      })),
    ...trials
      .filter((t) => t.status === 'confirmed' && Date.parse(t.end) > now)
      .map((t) => ({
        id: t.id,
        name: t.learnerName,
        start: t.start,
        end: t.end,
        label: 'Trial lesson',
        subject: (t.subjects ?? [t.subject]).join(', '),
        link: '/workspace?view=sessions&queue=confirmed',
      })),
  ].sort((a, b) => a.start.localeCompare(b.start))
  const next = upcoming[0]
  const date = params.get('date') || reportDate(new Date(now).toISOString())
  const day = [
    ...d.sessions
      .filter((s) => !['held', 'planned', 'cancelled'].includes(s.status))
      .map((s) => ({
        id: s.id,
        name: byID.get(s.enrollmentId)!.learnerName,
        start: s.start,
        status: byID.get(s.enrollmentId)?.status === 'paused' ? 'paused' : s.status,
        label: s.plannedSubject || subjects(byID.get(s.enrollmentId)!),
        link: lessonLink(s),
      })),
    ...trials
      .filter((t) => ['confirmed', 'completed', 'reviewed'].includes(t.status))
      .map((t) => ({
        id: t.id,
        name: t.learnerName,
        start: t.start,
        status: t.status,
        label: 'Trial · ' + (t.subjects ?? [t.subject]).join(', '),
        link: '/workspace?view=sessions',
      })),
  ]
    .filter((s) => reportDate(s.start) === date)
    .sort((a, b) => a.start.localeCompare(b.start))
  const tasks = [
    ...scheduled
      .filter((s) => Date.parse(s.end) <= now)
      .map((s) => ({
        id: s.id,
        name: byID.get(s.enrollmentId)!.learnerName,
        start: s.start,
        link: lessonLink(s),
        label: 'Lesson record due',
      })),
    ...d.sessions
      .filter(
        (s) =>
          ['completed', 'reviewed'].includes(s.status) &&
          s.attendance === 'present' &&
          !s.progress &&
          byID.get(s.enrollmentId)?.status !== 'cancelled' &&
          now <= Date.parse(s.recordedAt ?? s.end) + 7 * 86400000,
      )
      .map((s) => ({
        id: s.id,
        name: byID.get(s.enrollmentId)!.learnerName,
        start: s.start,
        link: lessonLink(s),
        label: 'Progress not recorded',
      })),
    ...trials
      .filter((trial) => trial.status === 'confirmed' && Date.parse(trial.end) <= now)
      .map((trial) => ({
        id: trial.id,
        name: trial.learnerName,
        start: trial.start,
        link: '/workspace?view=sessions&queue=confirmed',
        label: 'Trial feedback due',
      })),
  ]
  const activeLearners = new Set(
    d.enrollments.filter((en) => en.status === 'active').map((en) => en.learnerId),
  )
  return (
    <div className="teacher-overview">
      <div className="teacher-primary">
        <section className="teacher-next">
          <span className="desk-eyebrow">Next lesson</span>
          <h2>{next?.name ?? 'No upcoming lessons'}</h2>
          {next && (
            <>
              <p>
                {next.label} · {next.subject}
              </p>
              <p>{indiaDate(next.start, 'en')}</p>
            </>
          )}
          <Link className="teacher-next-link" to={next?.link ?? '/availability'}>
            {next ? 'Open lesson' : 'Set teaching hours'}
          </Link>
        </section>
        <div className="tutor-summary">
          <Link to="/workspace?view=learners">
            <strong>{activeLearners.size}</strong>Active learners
          </Link>
          <Link to="/workspace?view=sessions&queue=requested">
            <strong>{trials.filter((t) => t.status === 'requested').length}</strong>Trial requests
          </Link>
          <a href="#tutor-follow-up">
            <strong>{tasks.length}</strong>Follow-up tasks
          </a>
        </div>
        <section className="tu-panel tutor-day">
          <div className="teacher-section-heading">
            <h2>Teaching schedule</h2>
            <Field label="Teaching date">
              <input type="date" value={date} onChange={(e) => set({ date: e.target.value })} />
            </Field>
          </div>
          <p>Times are shown in India Standard Time.</p>
          {day.length ? (
            day.map((s) => (
              <Link className="tutor-schedule-row" key={s.id} to={s.link}>
                <div>
                  <strong>{s.name}</strong>
                  <p>{s.label}</p>
                  <time dateTime={s.start}>{indiaDate(s.start, 'en')}</time>
                </div>
                <Badge tone={['completed', 'reviewed'].includes(s.status) ? 'teal' : 'neutral'}>
                  {s.status.replaceAll('_', ' ')}
                </Badge>
              </Link>
            ))
          ) : (
            <p>No lessons on this date.</p>
          )}
        </section>
        <section className="tu-panel" id="tutor-follow-up">
          <h2>Follow-up tasks</h2>
          {tasks.length ? (
            tasks.map(({ id, name, start, link, label }) => (
              <Link className="tutor-schedule-row" key={id} to={link}>
                <div>
                  <strong>{name}</strong>
                  <p>
                    {label} · {indiaDate(start, 'en')}
                  </p>
                </div>
                <span>Open lesson</span>
              </Link>
            ))
          ) : (
            <p>All lesson records are up to date.</p>
          )}
        </section>
      </div>
      <aside className="teacher-secondary">
        <section className="tu-panel">
          <h2>Confirmed bookings</h2>
          <p>Paid bookings are ready to teach.</p>
          {d.notifications.map((n) => (
            <div className="tutor-booking-alert" key={n.id}>
              <Link className="text-link" to={`/tuition/${encodeURIComponent(n.targetId)}`}>
                {byID.get(n.targetId)?.learnerName ?? 'Confirmed booking'}
              </Link>
              <p>{indiaDate(n.createdAt, 'en')}</p>
              <Button variant="text" busy={mark.isPending} onClick={() => mark.mutate(n.id)}>
                Mark read
              </Button>
            </div>
          ))}
          {!d.notifications.length && <p>No unread booking alerts.</p>}
          {mark.error && (
            <Alert kind="error">Could not mark the alert read. Please try again.</Alert>
          )}
          <Link className="text-link" to="/notifications?folder=activity">
            All activity
          </Link>
        </section>
        <section className="teacher-application">
          <h2>Approved teaching scope</h2>
          {application && (
            <>
              <Status status={application.status} />
              <h3>{(application.scope.subjects ?? [application.scope.subject]).join(', ')}</h3>
              <p>
                Classes {application.scope.minClass}–{application.scope.maxClass} ·{' '}
                {(application.scope.modes ?? [application.scope.mode])
                  .map((m) => (m === 'home' ? 'Home Tuition' : 'Online'))
                  .join(', ')}
              </p>
            </>
          )}
          <Link className="teacher-panel-link" to="/apply">
            My application
          </Link>
          <Link className="teacher-panel-link" to="/availability">
            Teaching hours and staff-set fees
          </Link>
        </section>
        {application?.interview && <InterviewCard application={application} />}
      </aside>
    </div>
  )
}
