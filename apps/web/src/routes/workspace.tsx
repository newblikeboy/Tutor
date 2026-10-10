import '../locales/workspace'
import '../locales/parent'
import '../locales/tuition'
import { lazy } from 'react'
import { Navigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { RefreshCw, BookOpen, Plus } from 'lucide-react'
import { APIError, queryClient } from '../lib/api'
const Parent = lazy(() => import('./parent'))
import { TrialCard } from '../components/trial-card'
const StaffWorkspace = lazy(() => import('./staff'))
const TutorWorkspace = lazy(() => import('./tutor'))
import '../styles/teacher.css'
import type { Dashboard } from '../lib/api'
import { workspaceView } from '../lib/workspace'
import { useAuth, useDashboard } from '../lib/session'
import { Alert, Button, Empty, LinkButton, Loading, LoadError } from '../components/ui'
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
  return (
    <div className={`desk-content desk-view-${view}`} data-role={d.user.role}>
      <div className="desk-page-heading">
        <div>
          <h1>
            {['parent', 'tutor'].includes(d.user.role)
              ? d.user.role === 'tutor' && view === 'learners'
                ? 'My learners'
                : t(`parent.nav.${view}`)
              : view === 'overview'
                ? t(`desk.${d.user.role}Title`)
                : t(`desk.nav.${view}`)}
          </h1>
        </div>
        <div className="desk-page-actions">
          <Button
            variant="secondary"
            aria-label={t('desk.refresh')}
            busy={q.isFetching}
            onClick={() => {
              void q.refetch()
              void queryClient.invalidateQueries({ queryKey: ['tutor-workspace'] })
              if (view === 'learners')
                void queryClient.invalidateQueries({ queryKey: ['learner-progress'] })
            }}
          >
            <RefreshCw size={17} aria-hidden="true" />
          </Button>
          {d.user.role === 'parent' && view === 'learners' && d.learners.length > 0 && (
            <LinkButton to="/match?new=1&profile=1">
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
