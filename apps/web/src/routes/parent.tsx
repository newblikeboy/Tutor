import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowRight, BookOpen, CalendarDays, ClipboardCheck, Users } from 'lucide-react'
import type { Dashboard } from '../lib/api'
import { initials, workspaceLink, type WorkspaceView } from '../lib/workspace'
import { Field, LinkButton } from '../components/ui'
import { TabBar, TabPanel } from '../components/workspace-tabs'
import { TrialCard } from '../components/trial-card'
import '../styles/parent.css'

export default function Parent({ data, view }: { data: Dashboard; view: WorkspaceView }) {
  const { t } = useTranslation()
  const [params, setParams] = useSearchParams()
  const learner =
    data.learners.find((item) => item.id === params.get('learner')) ?? data.learners[0]
  const selected = learner?.id ?? ''
  const requests = data.requirements
    .filter((r) => r.learnerId === selected)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const trials = data.trials.filter((v) => v.learnerId === selected)
  const pendingRequest = requests.find(
    (request) =>
      !trials.some(
        (trial) =>
          trial.requirementId === request.id && !['cancelled', 'declined'].includes(trial.status),
      ),
  )
  const upcoming = trials
    .filter((v) => ['requested', 'confirmed'].includes(v.status))
    .sort((a, b) => a.start.localeCompare(b.start))
  const completed = trials
    .filter((v) => ['completed', 'reviewed'].includes(v.status))
    .sort((a, b) => b.start.localeCompare(a.start))
  const past = trials
    .filter((v) => ['cancelled', 'declined'].includes(v.status))
    .sort((a, b) => b.start.localeCompare(a.start))
  const queues = { upcoming, completed, past }
  const tab =
    view === 'progress'
      ? 'completed'
      : params.get('tab') === 'completed'
        ? 'completed'
        : params.get('tab') === 'past'
          ? 'past'
          : 'upcoming'
  const trialLink = (tab = 'upcoming') => `${workspaceLink('sessions', selected)}&tab=${tab}`
  const newNeeds = `/match?learner=${encodeURIComponent(selected)}`
  const requestLink = (id: string) => `/match?requirement=${encodeURIComponent(id)}`
  const draft = data.draft && (!data.draft.learnerId || data.draft.learnerId === selected)

  if (!learner)
    return (
      <section className="parent-welcome">
        <span className="parent-welcome-icon">
          <Users size={32} aria-hidden="true" />
        </span>
        <h2>{t('parent.welcome')}</h2>
        <ol className="parent-steps">
          {[0, 1, 2].map((step) => (
            <li key={step}>
              <span aria-hidden="true">{step + 1}</span>
              {t(`parent.steps.${step}`)}
            </li>
          ))}
        </ol>
        <LinkButton to={data.draft ? '/match' : '/match?new=1'}>
          {t(data.draft ? 'parent.continue' : 'parent.add')}
        </LinkButton>
      </section>
    )

  return (
    <div className="parent-content">
      <section className="desk-learner-bar" aria-label={t('selected')}>
        <span className="desk-learner-avatar" aria-hidden="true">
          {initials(learner.name)}
        </span>
        <div className="desk-learner-identity">
          <h2>{learner.name}</h2>
          <span>
            {t('class')} {learner.class} · {learner.board} ·{' '}
            {t(learner.language === 'Hindi' ? 'hindi' : 'english')}
          </span>
        </div>
        {data.learners.length > 1 && (
          <Field label={t('parent.learner')}>
            <select
              value={selected}
              onChange={(event) => {
                const next = new URLSearchParams(window.location.search)
                next.set('learner', event.target.value)
                setParams(next)
              }}
            >
              {data.learners.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </Field>
        )}
      </section>

      {view === 'overview' && (
        <>
          {upcoming[0] ? (
            <section className="parent-next-trial">
              <div className="section-label">
                <h2>{t('parent.nextTrial')}</h2>
                <CalendarDays size={22} aria-hidden="true" />
              </div>
              <TrialCard trial={upcoming[0]} role="parent" />
              <Link className="text-link" to={trialLink()}>
                {t('parent.allTrials')} ({upcoming.length})
                <ArrowRight size={16} aria-hidden="true" />
              </Link>
            </section>
          ) : (
            <section className="parent-next">
              <span className="desk-eyebrow">{t('parent.next')}</span>
              <h2>
                {t(
                  draft
                    ? 'parent.continue'
                    : pendingRequest
                      ? 'parent.choose'
                      : completed.length
                        ? 'parent.feedback'
                        : 'parent.start',
                )}
              </h2>
              <LinkButton
                to={
                  draft
                    ? '/match'
                    : pendingRequest
                      ? requestLink(pendingRequest.id)
                      : completed.length
                        ? trialLink('completed')
                        : newNeeds
                }
              >
                {t(
                  draft
                    ? 'parent.continue'
                    : pendingRequest
                      ? 'parent.choose'
                      : completed.length
                        ? 'parent.feedback'
                        : 'parent.newNeeds',
                )}
              </LinkButton>
            </section>
          )}
          <div className="parent-shortcuts">
            {requests[0] && (
              <Link to={workspaceLink('learners', selected)}>
                <BookOpen size={22} aria-hidden="true" />
                <div>
                  <strong>{t('parent.needs')}</strong>
                  <p>{requests[0].goal}</p>
                </div>
                <ArrowRight size={18} aria-hidden="true" />
              </Link>
            )}
            {completed.length > 0 && upcoming.length > 0 && (
              <Link to={trialLink('completed')}>
                <ClipboardCheck size={22} aria-hidden="true" />
                <strong>
                  {t('parent.feedback')} ({completed.length})
                </strong>
                <ArrowRight size={18} aria-hidden="true" />
              </Link>
            )}
          </div>
        </>
      )}

      {view === 'learners' && (
        <section className="parent-requests">
          <div className="section-label">
            <h2>{t('parent.needs')}</h2>
            <Link className="text-link" to={newNeeds}>
              {t('parent.newNeeds')}
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </div>
          {requests.length ? (
            requests.map((request) => {
              const trial = trials
                .filter(
                  (trial) =>
                    trial.requirementId === request.id &&
                    !['cancelled', 'declined'].includes(trial.status),
                )
                .sort((a, b) => b.start.localeCompare(a.start))[0]
              return (
                <article className="parent-request" key={request.id}>
                  <h3>
                    {t('math')} · {t('class')} {learner.class}
                  </h3>
                  <p>{request.goal}</p>
                  <Link
                    className="text-link"
                    to={
                      trial
                        ? trialLink(
                            ['completed', 'reviewed'].includes(trial.status)
                              ? 'completed'
                              : 'upcoming',
                          )
                        : requestLink(request.id)
                    }
                  >
                    {t(trial ? `parent.trialStatus.${trial.status}` : 'parent.choose')}
                    <ArrowRight size={16} aria-hidden="true" />
                  </Link>
                </article>
              )
            })
          ) : (
            <p className="parent-empty">{t('desk.noNeeds')}</p>
          )}
        </section>
      )}

      {['sessions', 'progress'].includes(view) && (
        <section>
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
              next.set('learner', selected)
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
