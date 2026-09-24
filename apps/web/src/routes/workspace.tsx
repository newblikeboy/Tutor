import { useEffect, useState } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  ArrowRight,
  ArrowUpRight,
  RefreshCw,
  BookOpen,
  CalendarDays,
  ClipboardCheck,
  Plus,
  ShieldCheck,
} from 'lucide-react'
import { APIError, indiaDate } from '../lib/api'
import Parent from './parent'
import { TrialCard } from '../components/trial-card'
import StaffWorkspace from './staff'
import { InterviewCard } from '../components/interview'
import '../styles/teacher.css'
import type { Dashboard } from '../lib/api'
import { workspaceLink, workspaceView } from '../lib/workspace'
import type { WorkspaceView } from '../lib/workspace'
import { useAuth, useDashboard } from '../lib/session'
import { Alert, Button, Empty, LinkButton, Loading, LoadError, Status } from '../components/ui'
export default function Workspace() {
  const auth = useAuth()
  const [params] = useSearchParams()
  if (auth.data?.user.role === 'finance') return <Navigate to="/billing" replace />
  if (auth.data?.user.role === 'support') return <Navigate to="/cases" replace />
  if (
    auth.data?.user.role === 'admin' ||
    (auth.data?.user.role === 'mentor' && params.get('view') !== 'reviews')
  )
    return <StaffWorkspace />
  return <WorkspaceData />
}
function WorkspaceData() {
  const { t } = useTranslation()
  const [params] = useSearchParams()
  const q = useDashboard()
  if (q.isPending)
    return (
      <div className="desk-loading">
        <Loading />
      </div>
    )
  if (q.isError)
    return (
      <div className="desk-loading">
        {q.error instanceof APIError && q.error.status === 403 ? (
          <Alert>{t('permission')}</Alert>
        ) : (
          <LoadError retry={() => void q.refetch()} />
        )}
      </div>
    )
  const d = q.data
  const view = workspaceView(d.user.role, params.get('view'))
  const intro =
    view === 'overview'
      ? `desk.${d.user.role}Intro`
      : (
          {
            learners: 'desk.learnersIntro',
            sessions: 'desk.sessionIntro',
            progress: 'desk.progressIntro',
            assessments: 'desk.assessmentIntro',
            reviews: 'desk.reviewsIntro',
            tutors: 'desk.tutorsIntro',
            audit: 'desk.auditIntro',
          } as Record<string, string>
        )[view]
  return (
    <div className={`desk-content desk-view-${view}`} data-role={d.user.role}>
      <div className="desk-page-heading">
        <div>
          <p className="desk-eyebrow">{t('desk.greeting', { name: d.user.name })}</p>
          <h1>
            {['parent', 'tutor'].includes(d.user.role)
              ? t(`parent.nav.${view}`)
              : view === 'overview'
                ? t(`desk.${d.user.role}Title`)
                : t(`desk.nav.${view}`)}
          </h1>
          {!['parent', 'tutor'].includes(d.user.role) && <p>{t(intro)}</p>}
        </div>
        <div className="desk-page-actions">
          <Button
            variant="secondary"
            aria-label={t('desk.refresh')}
            busy={q.isFetching}
            onClick={() => void q.refetch()}
          >
            <RefreshCw size={17} aria-hidden="true" />
          </Button>
          {d.user.role === 'parent' && view === 'learners' && d.learners.length > 0 && (
            <LinkButton to="/match?new=1">
              <Plus size={17} aria-hidden="true" />
              {t('parent.add')}
            </LinkButton>
          )}
        </div>
      </div>
      <p className="sr-only" role="status">
        {q.isFetching ? t('desk.refreshing') : ''}
      </p>
      {d.user.role === 'parent' ? (
        <Parent data={d} view={view} />
      ) : d.user.role === 'tutor' ? (
        <TutorWorkspace data={d} view={view} />
      ) : d.user.role === 'mentor' ? (
        <MentorWorkspace data={d} />
      ) : d.user.role === 'admin' ? (
        <StaffWorkspace />
      ) : (
        <Alert>{t('permission')}</Alert>
      )}
    </div>
  )
}
function TutorWorkspace({ data, view }: { data: Dashboard; view: WorkspaceView }) {
  const { t, i18n } = useTranslation()
  const [params] = useSearchParams()
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(timer)
  }, [])
  const app = data.applications[0]
  const queues = ['all', 'requested', 'confirmed', 'completed', 'reviewed'] as const
  const queue = queues.find((value) => value === params.get('queue')) ?? 'all'
  const trials = [...data.trials].sort((a, b) => a.start.localeCompare(b.start))
  const requests = trials.filter((trial) => trial.status === 'requested')
  const confirmed = trials.filter((trial) => trial.status === 'confirmed')
  const next = confirmed.find((trial) => new Date(trial.start).getTime() >= now)
  const sessionLink = (value = 'all') =>
    `${workspaceLink('sessions')}${value === 'all' ? '' : `&queue=${value}`}`
  const filtered = queue === 'all' ? trials : trials.filter((trial) => trial.status === queue)

  if (view === 'sessions')
    return (
      <section className="teacher-sessions" aria-label={t('desk.trialSessions')}>
        <nav className="teacher-filters" aria-label={t('desk.filterSessions')}>
          {queues.map((value) => (
            <Link
              key={value}
              to={sessionLink(value)}
              aria-current={queue === value ? 'page' : undefined}
            >
              {t(`desk.sessionFilter.${value}`)}
              <span>
                {value === 'all'
                  ? trials.length
                  : trials.filter((trial) => trial.status === value).length}
              </span>
            </Link>
          ))}
        </nav>
        <div className="queue">
          {filtered.length ? (
            filtered.map((trial) => <TrialCard key={trial.id} trial={trial} role="tutor" />)
          ) : (
            <div className="teacher-empty">
              <CalendarDays size={26} aria-hidden="true" />
              <h2>{t('desk.noSessionsInView')}</h2>
            </div>
          )}
        </div>
      </section>
    )

  return (
    <div className="teacher-overview">
      <div className="teacher-primary">
        <section className="teacher-next">
          <div className="teacher-panel-title">
            <span className="desk-eyebrow">{t('desk.nextTrial')}</span>
            <CalendarDays size={21} aria-hidden="true" />
          </div>
          <h2>
            {next
              ? next.learnerName || t('learner')
              : requests.length
                ? t('experience.requests', { count: requests.length })
                : t('desk.noUpcomingTrial')}
          </h2>
          {next && (
            <p>
              <time dateTime={next.start}>{indiaDate(next.start, i18n.language)}</time>
            </p>
          )}
          <Link
            className="teacher-next-link"
            to={
              next
                ? sessionLink('confirmed')
                : requests.length
                  ? sessionLink('requested')
                  : '/availability'
            }
          >
            {t(
              next
                ? 'desk.openTrial'
                : requests.length
                  ? 'experience.reviewRequests'
                  : 'experience.teachingHours',
            )}
            <ArrowUpRight size={19} aria-hidden="true" />
          </Link>
        </section>
        <nav className="teacher-stats" aria-label={t('desk.trialSessions')}>
          {[
            {
              value: 'requested',
              label: 'desk.shortRequests',
              count: requests.length,
              icon: CalendarDays,
            },
            {
              value: 'confirmed',
              label: 'desk.shortConfirmed',
              count: confirmed.length,
              icon: BookOpen,
            },
            {
              value: 'completed',
              label: 'desk.shortReview',
              count: trials.filter((trial) => trial.status === 'completed').length,
              icon: ClipboardCheck,
            },
          ].map(({ value, label, count, icon: Icon }) => (
            <Link key={value} to={sessionLink(value)}>
              <Icon size={19} aria-hidden="true" />
              <strong>{count}</strong>
              <span>{t(label)}</span>
              <ArrowUpRight size={15} aria-hidden="true" />
            </Link>
          ))}
        </nav>
        {requests.length > 0 && (
          <section className="teacher-requests">
            <div className="teacher-section-heading">
              <h2>{t('desk.newRequests')}</h2>
              <Link to={sessionLink('requested')}>
                {t('desk.viewAll')}
                <ArrowRight size={16} aria-hidden="true" />
              </Link>
            </div>
            <div className="queue">
              {requests.slice(0, 3).map((trial) => (
                <TrialCard key={trial.id} trial={trial} role="tutor" />
              ))}
            </div>
          </section>
        )}
      </div>
      <aside className="teacher-secondary">
        <section className="teacher-application">
          <div className="teacher-panel-title">
            <h2>{t('desk.application')}</h2>
            <ShieldCheck size={21} aria-hidden="true" />
          </div>
          {app ? (
            <>
              <Status status={app.status} />
              <h3>
                {t(app.scope.subject.toLowerCase() === 'mathematics' ? 'math' : app.scope.subject)}
              </h3>
              <p>
                {t('classes')} {app.scope.minClass}–{app.scope.maxClass} · {t(app.scope.mode)}
              </p>
            </>
          ) : (
            <p>{t('desk.applicationNotStarted')}</p>
          )}
          {app && app.status !== 'approved' && (
            <p className="teacher-application-note">{app.reason || t('profilePrivate')}</p>
          )}
          <Link to="/apply" className="teacher-panel-link">
            {t(app ? 'desk.applicationLink' : 'teach')}
            <ArrowRight size={17} aria-hidden="true" />
          </Link>
        </section>
        {app?.interview && <InterviewCard application={app} />}
      </aside>
    </div>
  )
}
function MentorWorkspace({ data }: { data: Dashboard }) {
  const { t } = useTranslation()
  return (
    <section>
      <div className="section-label">
        <h2>{t('reviewedProgress')}</h2>
        <BookOpen size={21} aria-hidden="true" />
      </div>
      <div className="queue">
        {data.trials.length ? (
          data.trials.map((trial) => <TrialCard key={trial.id} trial={trial} role="mentor" />)
        ) : (
          <Empty title={t('desk.reviewEmpty')} body={t('desk.reviewEmptyBody')} />
        )}
      </div>
    </section>
  )
}
