import { SubjectNames } from '../components/subject-name'
import '../locales/parent'
import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, ArrowRight, BookOpen, CalendarDays, Sprout } from 'lucide-react'
import { indiaDate, type Dashboard } from '../lib/api'
import { initials, workspaceLink, type WorkspaceView } from '../lib/workspace'
import { LearningMotif } from '../components/learning-motif'
import { Alert, Badge, Field, LinkButton } from '../components/ui'
import { TabBar, TabPanel } from '../components/workspace-tabs'
import { TrialCard } from '../components/trial-card'
import LearnerProgressReport from '../components/learner-progress'
import { ParentLearnersTable, ParentTrialsTable } from '../components/parent-tables'
import { ParentHome } from '../components/parent-home'
import { DeleteLearner } from '../components/delete-learner'
import '../styles/parent.css'

export default function Parent({ data, view }: { data: Dashboard; view: WorkspaceView }) {
  const { t } = useTranslation()
  const [params, setParams] = useSearchParams()
  const learner =
    data.learners.find((item) => item.id === params.get('learner')) ?? data.learners[0]
  if (!learner)
    return (
      <section className="parent-welcome customer-hero">
        <div className="customer-hero-copy">
          <span className="customer-eyebrow">
            <Sprout size={17} aria-hidden="true" />
            Your family's next chapter
          </span>
          <h2>{t('parent.welcome')}</h2>
          <p>Add your child's profile once, then explore tutors and follow their learning here.</p>
          <LinkButton to="/match?new=1&profile=1">{t('parent.add')}</LinkButton>
        </div>
        <LearningMotif />
      </section>
    )
  const trials = data.trials.filter((trial) => trial.learnerId === learner.id)
  const upcoming = trials
    .filter((trial) => ['requested', 'confirmed'].includes(trial.status))
    .sort((a, b) => a.start.localeCompare(b.start))
  const completed = trials
    .filter((trial) => ['completed', 'reviewed'].includes(trial.status))
    .sort((a, b) => b.start.localeCompare(a.start))
  const cancelled = trials
    .filter((trial) => ['cancelled', 'declined'].includes(trial.status))
    .sort((a, b) => b.start.localeCompare(a.start))
  const queues = {
    all: [...trials].sort((a, b) => b.start.localeCompare(a.start)),
    completed,
    upcoming,
    cancelled,
  }
  const tab =
    view === 'progress' || params.get('tab') === 'completed'
      ? 'completed'
      : params.get('tab') === 'upcoming'
        ? 'upcoming'
        : ['past', 'cancelled'].includes(params.get('tab') ?? '')
          ? 'cancelled'
          : 'all'
  const selectedTrialID = params.get('trial')
  const selectedTrial = trials.find((trial) => trial.id === selectedTrialID)
  const trialListPath = `${workspaceLink('sessions', learner.id)}&tab=${tab}`
  if (view === 'learners' && !params.get('learner'))
    return <ParentLearnersTable learners={data.learners} />
  if (view === 'learners' && !data.learners.some((item) => item.id === params.get('learner')))
    return <Alert kind="error">This learner is not available.</Alert>
  if (['sessions', 'progress'].includes(view) && selectedTrialID)
    return (
      <div className="parent-content">
        <Link className="student-back-link" to={trialListPath}>
          <ArrowLeft size={17} aria-hidden="true" /> Back to Trial classes
        </Link>
        {selectedTrial ? (
          <TrialCard
            key={`${selectedTrial.id}:${selectedTrial.version}`}
            trial={selectedTrial}
            role="parent"
            headingLevel={2}
          />
        ) : (
          <Alert kind="error">This trial is not available.</Alert>
        )}
      </div>
    )
  return (
    <div className="parent-content">
      {view === 'learners' && (
        <Link className="student-back-link" to={workspaceLink('learners')}>
          <ArrowLeft size={17} aria-hidden="true" /> Back to Learners
        </Link>
      )}
      <section className="parent-home-learner">
        <span className="parent-learner-avatar" aria-hidden="true">
          {initials(learner.name)}
        </span>
        <Field label={t('parent.learner')}>
          <select
            value={learner.id}
            onChange={(event) => {
              const next = new URLSearchParams(params)
              next.set('learner', event.target.value)
              next.delete('subject')
              next.delete('tutor')
              next.delete('trial')
              setParams(next)
            }}
          >
            {data.learners.map((item) => (
              <option value={item.id} key={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </Field>
        <p>
          Class {learner.class} · {learner.board} · {learner.language}
        </p>
        {view === 'overview' && (
          <div className="parent-home-discovery">
            <LinkButton to={`/match?learner=${encodeURIComponent(learner.id)}`}>
              {t('parent.start')}
            </LinkButton>
          </div>
        )}
        {view === 'learners' && (
          <div className="parent-learner-actions learner-profile-actions">
            <Link
              className="text-link"
              to={`/match?profile=1&edit=1&learner=${encodeURIComponent(learner.id)}`}
            >
              {t('parent.edit')}
            </Link>
            <DeleteLearner learner={learner} />
          </div>
        )}
      </section>
      {view === 'overview' && (
        <>
          <ParentHome learner={learner}>
            {upcoming[0] && (
              <div className="parent-home-details">
                <section className="parent-next-trial">
                  <h2>{t('parent.nextTrial')}</h2>
                  <div className="parent-next-summary">
                    <div>
                      <strong>
                        <SubjectNames values={upcoming[0].subjects ?? [upcoming[0].subject]} />
                      </strong>
                      <p>
                        <time dateTime={upcoming[0].start}>
                          {indiaDate(upcoming[0].start, 'en')}
                        </time>{' '}
                        · {upcoming[0].mode === 'home' ? 'Home Tuition' : 'Online'}
                      </p>
                    </div>
                    <Badge tone={upcoming[0].status === 'confirmed' ? 'teal' : 'neutral'}>
                      {t(`parent.trialStatus.${upcoming[0].status}`)}
                    </Badge>
                    <Link
                      className="student-back-link"
                      to={`${workspaceLink('sessions', learner.id)}&trial=${encodeURIComponent(upcoming[0].id)}`}
                    >
                      View trial <ArrowRight size={16} aria-hidden="true" />
                    </Link>
                  </div>
                </section>
              </div>
            )}
            <nav className="parent-home-paths" aria-label="Your learning essentials">
              <Link to={workspaceLink('learners', learner.id)}>
                <span className="customer-path-icon">
                  <Sprout size={23} aria-hidden="true" />
                </span>
                <span>
                  <strong>Learning progress</strong>
                  <small>Reports, subjects and tutor feedback</small>
                </span>
                <ArrowRight size={18} aria-hidden="true" />
              </Link>
              <Link to="/tuition">
                <span className="customer-path-icon">
                  <BookOpen size={23} aria-hidden="true" />
                </span>
                <span>
                  <strong>{t('parent.classes')}</strong>
                  <small>Bookings and class schedules</small>
                </span>
                <ArrowRight size={18} aria-hidden="true" />
              </Link>
              <Link to={workspaceLink('sessions', learner.id)}>
                <span className="customer-path-icon">
                  <CalendarDays size={23} aria-hidden="true" />
                </span>
                <span>
                  <strong>Trial classes{upcoming.length > 0 ? ` (${upcoming.length})` : ''}</strong>
                  <small>Upcoming and completed trial classes</small>
                </span>
                <ArrowRight size={18} aria-hidden="true" />
              </Link>
            </nav>
            {!!completed.length && (
              <Link
                className="text-link"
                to={`${workspaceLink('sessions', learner.id)}&tab=completed`}
              >
                View completed trials ({completed.length})
              </Link>
            )}
          </ParentHome>
        </>
      )}
      {view === 'learners' && <LearnerProgressReport learner={learner} />}
      {['sessions', 'progress'].includes(view) && (
        <section>
          <h2 className="sr-only">Trial records</h2>
          <TabBar
            id="parent-trials"
            scrollable
            label={t('parent.nav.sessions')}
            value={tab}
            options={Object.entries(queues).map(([value, items]) => ({
              value,
              label: `${t(`parent.trialTabs.${value}`)} (${items.length})`,
            }))}
            onChange={(value) => {
              const next = new URLSearchParams(params)
              next.set('view', 'sessions')
              next.set('learner', learner.id)
              next.set('tab', value)
              setParams(next)
            }}
          />
          {Object.entries(queues).map(([value, items]) => (
            <TabPanel id="parent-trials" value={value} active={tab === value} key={value}>
              <div className="queue">
                {items.length ? (
                  <ParentTrialsTable trials={items} listPath={trialListPath} trialTab={tab} />
                ) : (
                  <p className="parent-empty">
                    {t(
                      value === 'all'
                        ? 'parent.noTrials'
                        : value === 'completed'
                          ? 'parent.noCompleted'
                          : value === 'upcoming'
                            ? 'parent.noUpcoming'
                            : 'parent.noCancelled',
                    )}
                  </p>
                )}
              </div>
            </TabPanel>
          ))}
        </section>
      )}
    </div>
  )
}
