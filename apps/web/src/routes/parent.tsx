import { useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowRight, BookOpen, CalendarDays, ClipboardCheck, Users } from 'lucide-react'
import { api, errorKey, queryClient, type Dashboard, type Requirement } from '../lib/api'
import { initials, workspaceLink, type WorkspaceView } from '../lib/workspace'
import { Alert, Button, Field, LinkButton } from '../components/ui'
import { TabBar, TabPanel } from '../components/workspace-tabs'
import { TrialCard } from '../components/trial-card'
import '../styles/parent.css'

function DeleteLearningNeed({
  request,
  learnerName,
  onDeleted,
}: {
  request: Requirement
  learnerName: string
  onDeleted: () => void
}) {
  const { t } = useTranslation()
  const [confirming, setConfirming] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const remove = useMutation({
    mutationFn: () => api(`/requirements/${encodeURIComponent(request.id)}`, { method: 'DELETE' }),
    onSuccess: async () => {
      onDeleted()
      queryClient.setQueryData<Dashboard>(
        ['dashboard'],
        (current) =>
          current && {
            ...current,
            requirements: current.requirements.filter((item) => item.id !== request.id),
          },
      )
      await queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
  return (
    <div className="parent-delete-need">
      <button
        ref={trigger}
        type="button"
        className="text-link"
        aria-expanded={confirming}
        onClick={() => {
          remove.reset()
          setConfirming(!confirming)
        }}
        disabled={remove.isPending}
      >
        {t('parent.deleteNeed')}
      </button>
      {confirming && (
        <div className="parent-delete-confirm">
          <p>{t('parent.deleteNeedConfirm', { name: learnerName })}</p>
          {remove.isError && <Alert kind="error">{t(errorKey(remove.error))}</Alert>}
          <div className="parent-delete-buttons">
            <Button
              variant="secondary"
              disabled={remove.isPending}
              onClick={() => {
                setConfirming(false)
                trigger.current?.focus()
              }}
            >
              {t('cancel')}
            </Button>
            <Button variant="danger" busy={remove.isPending} onClick={() => remove.mutate()}>
              {t('parent.confirmDelete')}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function Parent({ data, view }: { data: Dashboard; view: WorkspaceView }) {
  const { t } = useTranslation()
  const [deleted, setDeleted] = useState(false)
  const needsHeading = useRef<HTMLHeadingElement>(null)
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
        <LinkButton to={data.draft ? '/match' : '/match?new=1&profile=1'}>
          {t(data.draft ? 'parent.continue' : 'parent.add')}
        </LinkButton>
      </section>
    )

  return (
    <div className="parent-content">
      {view === 'overview' && (
        <section className="parent-home-learner" aria-label={t('selected')}>
          <Field label={t('parent.learner')}>
            <select
              value={selected}
              onChange={(event) => {
                const next = new URLSearchParams(params)
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
          <p>
            {t('class')} {learner.class} · {learner.board} ·{' '}
            {t(learner.language === 'Hindi' ? 'hindi' : 'english')}
          </p>
        </section>
      )}
      {view !== 'overview' && (
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
          {view === 'learners' && (
            <Link
              className="text-link"
              to={`/match?profile=1&edit=1&learner=${encodeURIComponent(selected)}`}
            >
              {t('parent.edit')}
            </Link>
          )}
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
      )}

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
            <h2 ref={needsHeading} tabIndex={-1}>
              {t('parent.needs')}
            </h2>
            <Link className="text-link" to={newNeeds}>
              {t('parent.newNeeds')}
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </div>
          <p className="sr-only" role="status">
            {deleted ? t('parent.needDeleted') : ''}
          </p>
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
                  <div className="parent-request-actions">
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
                    {!trials.some((item) => item.requirementId === request.id) && (
                      <DeleteLearningNeed
                        request={request}
                        learnerName={learner.name}
                        onDeleted={() => {
                          setDeleted(true)
                          needsHeading.current?.focus()
                        }}
                      />
                    )}
                  </div>
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
