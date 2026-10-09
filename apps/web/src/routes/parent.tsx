import '../locales/parent'
import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { Dashboard } from '../lib/api'
import { workspaceLink, type WorkspaceView } from '../lib/workspace'
import { Field, LinkButton } from '../components/ui'
import { TabBar, TabPanel } from '../components/workspace-tabs'
import { TrialCard } from '../components/trial-card'
import LearnerProgressReport from '../components/learner-progress'
import '../styles/parent.css'

export default function Parent({ data, view }: { data: Dashboard; view: WorkspaceView }) {
  const { t } = useTranslation()
  const [params, setParams] = useSearchParams()
  const learner =
    data.learners.find((item) => item.id === params.get('learner')) ?? data.learners[0]
  if (!learner)
    return (
      <section className="parent-welcome">
        <h2>{t('parent.welcome')}</h2>
        <p>Add a learner to find tutors and book classes.</p>
        <LinkButton to="/match?new=1&profile=1">{t('parent.add')}</LinkButton>
      </section>
    )
  const trials = data.trials.filter((trial) => trial.learnerId === learner.id)
  const upcoming = trials
    .filter((trial) => ['requested', 'confirmed'].includes(trial.status))
    .sort((a, b) => a.start.localeCompare(b.start))
  const completed = trials
    .filter((trial) => ['completed', 'reviewed'].includes(trial.status))
    .sort((a, b) => b.start.localeCompare(a.start))
  const past = trials.filter((trial) => ['cancelled', 'declined'].includes(trial.status))
  const queues = { upcoming, completed, past }
  const tab =
    view === 'progress' || params.get('tab') === 'completed'
      ? 'completed'
      : params.get('tab') === 'past'
        ? 'past'
        : 'upcoming'
  return (
    <div className="parent-content">
      <section className="parent-home-learner">
        <Field label={t('parent.learner')}>
          <select
            value={learner.id}
            onChange={(event) => {
              const next = new URLSearchParams(params)
              next.set('learner', event.target.value)
              next.delete('subject')
              next.delete('tutor')
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
      </section>
      {view === 'overview' && (
        <>
          <section className="parent-next">
            <h2>Find a tutor for {learner.name}</h2>
            <LinkButton to={`/match?learner=${encodeURIComponent(learner.id)}`}>
              {t('parent.start')}
            </LinkButton>
          </section>
          {upcoming[0] && (
            <section className="parent-next-trial">
              <h2>{t('parent.nextTrial')}</h2>
              <TrialCard trial={upcoming[0]} role="parent" />
            </section>
          )}
          {!!completed.length && (
            <Link
              className="text-link"
              to={`${workspaceLink('sessions', learner.id)}&tab=completed`}
            >
              {t('parent.feedback')} ({completed.length})
            </Link>
          )}
        </>
      )}
      {view === 'learners' && <LearnerProgressReport learner={learner} />}
      {['sessions', 'progress'].includes(view) && (
        <section>
          <h2 className="sr-only">Trial records</h2>
          <TabBar
            id="parent-trials"
            label={t('parent.nav.sessions')}
            value={tab}
            options={Object.entries(queues).map(([value, items]) => ({
              value,
              label: `${t(`parent.${value}`)} (${items.length})`,
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
                  items.map((trial) => <TrialCard trial={trial} role="parent" key={trial.id} />)
                ) : (
                  <p className="parent-empty">
                    {t(
                      value === 'upcoming'
                        ? 'parent.noUpcoming'
                        : value === 'completed'
                          ? 'parent.noCompleted'
                          : 'parent.noPast',
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
