import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ArrowRight, BookOpen, CalendarDays, Users } from 'lucide-react'
import { api, APIError, indiaDate, type Schema } from '../lib/api'
import { useClock } from '../lib/clock'
import type { WorkspaceView } from '../lib/workspace'
import { TutorStudents } from '../components/tutor-students'
import { TutorTrials } from '../components/tutor-trials'
import { LearningMotif } from '../components/learning-motif'
import { GoogleConnection } from '../components/google-connection'
import { Alert, Loading, LoadError } from '../components/ui'
import '../styles/tuition.css'
import '../styles/tutor-workspace.css'

const subjects = (en: Schema['Enrollment']) =>
  (en.agreement.subjects ?? [en.agreement.subject]).join(', ')
export default function TutorWorkspace({ view }: { view: WorkspaceView }) {
  const now = useClock()
  const q = useQuery({
    queryKey: ['tutor-workspace'],
    queryFn: ({ signal }) => api<Schema['TutorWorkspace']>('/tutor/workspace', { signal }),
    refetchInterval: 15000,
  })
  if (q.isPending) return <Loading />
  if (q.isError)
    return q.error instanceof APIError && q.error.status === 403 ? (
      <Alert kind="error">{q.error.message}</Alert>
    ) : (
      <LoadError retry={() => void q.refetch()} />
    )
  const d = q.data
  if (view === 'sessions') return <TutorTrials data={d} />
  if (view === 'learners') return <TutorStudents data={d} />
  const byID = new Map(d.enrollments.map((en) => [en.id, en]))
  const trials = d.trials
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
        link: `/workspace?view=sessions&queue=confirmed&trial=${encodeURIComponent(t.id)}`,
      })),
  ].sort((a, b) => a.start.localeCompare(b.start))
  const next = upcoming[0]
  const activeLearners = new Set(
    d.enrollments.filter((en) => en.status === 'active').map((en) => en.learnerId),
  )
  return (
    <div className="tutor-home">
      <GoogleConnection />
      {d.enrollments.some((en) => en.status === 'pending_tutor_acceptance') && (
        <section className="tu-panel">
          <h2>New bookings need your acceptance</h2>
          <p>Review and sign the teaching agreement before starting these classes.</p>
          <Link className="btn primary" to="/tuition">
            Review new bookings <ArrowRight size={17} aria-hidden="true" />
          </Link>
        </section>
      )}
      <section className="customer-hero">
        <div className="customer-hero-copy">
          <span className="customer-eyebrow">
            <BookOpen size={17} aria-hidden="true" />
            Next lesson
          </span>
          <h2>{next?.name ?? 'No upcoming lessons'}</h2>
          {next ? (
            <>
              <p>
                {next.label} · {next.subject}
              </p>
              <p className="tutor-next-time">
                <CalendarDays size={16} aria-hidden="true" />
                <time dateTime={next.start}>{indiaDate(next.start, 'en')}</time>
              </p>
            </>
          ) : (
            <p>Your next teaching moment starts with the hours you can offer.</p>
          )}
          <Link className="btn primary" to={next?.link ?? '/availability'}>
            {next ? 'Open lesson' : 'Set teaching hours'}
            <ArrowRight size={17} aria-hidden="true" />
          </Link>
        </div>
        <LearningMotif />
      </section>
      <nav className="tutor-summary" aria-label="Teaching overview">
        <Link to="/workspace?view=learners">
          <Users size={21} aria-hidden="true" />
          <strong>{activeLearners.size}</strong>
          <span>Active students</span>
          <ArrowRight size={16} aria-hidden="true" />
        </Link>
        <Link to="/workspace?view=sessions&queue=requested">
          <BookOpen size={21} aria-hidden="true" />
          <strong>{trials.filter((t) => t.status === 'requested').length}</strong>
          <span>Trial requests</span>
          <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </nav>
    </div>
  )
}
