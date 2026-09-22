import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  BookOpen,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  LockKeyhole,
  Plus,
  ShieldCheck,
} from 'lucide-react'
import { APIError, indiaDate, queryClient, send } from '../lib/api'
import type { Application, Dashboard, Trial } from '../lib/api'
import { useAuth, useDashboard, useConfig } from '../lib/session'
import {
  Alert,
  Button,
  Empty,
  Field,
  LinkButton,
  Loading,
  LoadError,
  Modal,
  MutationError,
  PageHeading,
  Status,
} from '../components/ui'
export default function Workspace() {
  const auth = useAuth()
  const { t } = useTranslation()
  if (auth.isPending)
    return (
      <div className="container section">
        <Loading />
      </div>
    )
  if (!auth.data)
    return (
      <div className="container section permission-panel">
        <Empty title={t('authRequired')} body={t('privacyNote')}>
          <LinkButton to="/login">{t('login')}</LinkButton>
        </Empty>
      </div>
    )
  return <WorkspaceData />
}
function WorkspaceData() {
  const { t } = useTranslation()
  const q = useDashboard()
  if (q.isPending)
    return (
      <div className="container section">
        <Loading />
      </div>
    )
  if (q.isError)
    return (
      <div className="container section">
        {q.error instanceof APIError && q.error.status === 403 ? (
          <Alert>{t('permission')}</Alert>
        ) : (
          <LoadError retry={() => void q.refetch()} />
        )}
      </div>
    )
  const d = q.data
  return (
    <div className="container section">
      <div className="workspace-topline">
        <span className="role-label">
          <BookOpen size={16} />
          {t('learningSpace')} / {t(`${d.user.role}Role`, { defaultValue: d.user.role })}
        </span>
        <span>
          {d.user.name} · {t('sample')}
        </span>
      </div>
      <PageHeading
        eyebrow={t('welcome')}
        title={t(`${d.user.role}Title`)}
        body={t(`${d.user.role}Intro`)}
        action={
          d.user.role === 'parent' ? (
            <LinkButton to="/match">
              <Plus size={17} />
              {t('newRequirement')}
            </LinkButton>
          ) : undefined
        }
      />
      {d.user.role === 'parent' ? (
        <Parent data={d} />
      ) : d.user.role === 'tutor' ? (
        <TutorWorkspace data={d} />
      ) : d.user.role === 'mentor' ? (
        <MentorWorkspace data={d} />
      ) : (
        <AdminWorkspace data={d} />
      )}
    </div>
  )
}
function Parent({ data }: { data: Dashboard }) {
  const { t } = useTranslation()
  const [selected, setSelected] = useState(data.learners[0]?.id ?? '')
  const learner = data.learners.find((l) => l.id === selected)
  const reqs = data.requirements.filter((r) => r.learnerId === selected)
  const trials = data.trials.filter((v) => v.learnerId === selected)
  const reviewed = trials.filter((v) => v.status === 'reviewed')
  return (
    <div className="workspace-grid">
      <div className="workspace-main">
        {!learner ? (
          <Empty title={t('noLearners')} body={t('noLearnersBody')}>
            <LinkButton to="/match">{t('addLearner')}</LinkButton>
          </Empty>
        ) : (
          <section className="learner-focus">
            <div className="focus-top">
              <p className="eyebrow">
                <BookOpen size={16} />
                {t('currentFocus')}
              </p>
              <label>
                <span className="sr-only">{t('selected')}</span>
                <select value={selected} onChange={(e) => setSelected(e.target.value)}>
                  {data.learners.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name} · {t('class')} {l.class}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <h2>
              {t('math')} · {t('class')} {learner.class}
            </h2>
            <p>{reqs.at(-1)?.goal ?? t('emptyProgress')}</p>
          </section>
        )}
        <section>
          <div className="section-label">
            <h2>{t('nextClass')}</h2>
            <CalendarDays size={21} className="teal" />
          </div>
          <div className="queue">
            {trials.filter((v) => v.status !== 'reviewed').length ? (
              trials
                .filter((v) => v.status !== 'reviewed')
                .map((v) => <TrialCard key={v.id} trial={v} role="parent" />)
            ) : reviewed.length ? (
              <div className="small-card">
                <p>{t('noTrials')}</p>
              </div>
            ) : (
              <Empty title={t('noTrials')} body={t('noTrialsBody')} />
            )}
          </div>
        </section>
        <section>
          <div className="section-label">
            <h2>{t('reviewedProgress')}</h2>
            <ClipboardCheck size={22} className="teal" />
          </div>
          <div className="queue">
            {reviewed.length ? (
              reviewed.map((v) => <TrialCard key={v.id} trial={v} role="parent" />)
            ) : (
              <div className="small-card">
                <p>{t('emptyProgress')}</p>
              </div>
            )}
          </div>
        </section>
      </div>
      <aside className="workspace-aside">
        <section className="small-card">
          <h3>{t('requirementTitle')}</h3>
          {reqs.length ? (
            reqs.map((r) => (
              <div key={r.id} className="requirement-row">
                <p>{r.goal}</p>
                <Status status={r.status} />
                <Link className="text-link" to={`/match?requirement=${r.id}`}>
                  {t('selectTutor')} →
                </Link>
              </div>
            ))
          ) : (
            <p>{t('noTrialsBody')}</p>
          )}
        </section>
        <section className="wizard-aside">
          <ShieldCheck size={28} />
          <h3>{t('continuity')}</h3>
          <p>{t('continuousBody')}</p>
          <Link className="text-link" to="/approach">
            {t('viewApproach')} →
          </Link>
        </section>
        <section className="small-card">
          <LockKeyhole size={22} className="teal" />
          <p>{t('privacyNote')}</p>
        </section>
      </aside>
    </div>
  )
}
function TutorWorkspace({ data }: { data: Dashboard }) {
  const { t } = useTranslation()
  const app = data.applications[0]
  return (
    <div className="workspace-grid">
      <div className="workspace-main">
        <section>
          <div className="section-label">
            <h2>{t('nextClass')}</h2>
            <CalendarDays className="teal" size={22} />
          </div>
          <div className="queue">
            {data.trials.length ? (
              data.trials.map((v) => <TrialCard key={v.id} trial={v} role="tutor" />)
            ) : (
              <Empty title={t('noTrials')} body={t('applicationWarning')} />
            )}
          </div>
        </section>
      </div>
      <aside className="workspace-aside">
        <section className="application-status">
          <p className="eyebrow">{t('applicationTitle')}</p>
          {app ? (
            <>
              <h2>{app.name}</h2>
              <Status status={app.status} />
              <p>
                {t('math')} · {t('classes')} {app.scope.minClass}–{app.scope.maxClass} ·{' '}
                {t('online')}
              </p>
              <p>{t(app.status === 'approved' ? 'scopeHelp' : 'profilePrivate')}</p>
              {app.reason && <p>{app.reason}</p>}
            </>
          ) : (
            <>
              <p>{t('applicationWarning')}</p>
              <div className="button-row">
                <LinkButton to="/apply">{t('teach')}</LinkButton>
              </div>
            </>
          )}
        </section>
        <section className="small-card">
          <h3>{t('pipeline')}</h3>
          <ul className="timeline-list">
            {['applicationTitle', 'assessment', 'approval'].map((k) => (
              <li key={k}>
                <CheckCircle2 size={17} />
                <span>{t(k)}</span>
              </li>
            ))}
          </ul>
        </section>
      </aside>
    </div>
  )
}
function MentorWorkspace({ data }: { data: Dashboard }) {
  const { t } = useTranslation()
  return (
    <div className="queue-layout">
      <section>
        <div className="section-label">
          <h2>{t('applications')}</h2>
          <ClipboardCheck size={22} className="teal" />
        </div>
        <div className="queue">
          {data.applications.length ? (
            data.applications.map((v) => <AssessmentCard key={v.id} application={v} />)
          ) : (
            <Empty title={t('noApplications')} body={t('noApplicationsBody')} />
          )}
        </div>
      </section>
      <section>
        <div className="section-label">
          <h2>{t('reviewedProgress')}</h2>
          <BookOpen size={21} className="teal" />
        </div>
        <div className="queue">
          {data.trials.length ? (
            data.trials.map((v) => <TrialCard key={v.id} trial={v} role="mentor" />)
          ) : (
            <Empty title={t('empty')} body={t('pendingReview')} />
          )}
        </div>
      </section>
    </div>
  )
}
function AdminWorkspace({ data }: { data: Dashboard }) {
  const { t, i18n } = useTranslation()
  return (
    <div className="queue-layout">
      <section>
        <div className="section-label">
          <h2>{t('scoped')}</h2>
          <ShieldCheck size={22} className="teal" />
        </div>
        <div className="queue">
          {data.applications.length ? (
            data.applications.map((v) => (
              <article key={v.id} className="record-card">
                <div className="record-header">
                  <div>
                    <h3>{v.name}</h3>
                    <p>
                      {t('math')} · {t('classes')} {v.scope.minClass}–{v.scope.maxClass}
                    </p>
                  </div>
                  <Status status={v.status} />
                </div>
                <div className="record-content">
                  <p>{v.reason || t('applicationWarning')}</p>
                  {v.status === 'approved' && (
                    <Modal
                      title={t('suspend')}
                      description={t('scopeHelp')}
                      trigger={<Button variant="danger">{t('suspend')}</Button>}
                    >
                      <Suspension id={v.id} />
                    </Modal>
                  )}
                </div>
              </article>
            ))
          ) : (
            <Empty title={t('noApplications')} />
          )}
        </div>
      </section>
      <aside className="panel">
        <h2>{t('audit')}</h2>
        {data.events.length ? (
          <ol className="audit-list">
            {[...data.events]
              .sort((a, b) => b.at.localeCompare(a.at))
              .slice(0, 25)
              .map((e) => (
                <li key={e.id}>
                  <strong>{t(e.action.split('.')[1], { defaultValue: e.action })}</strong>
                  <span>{e.actor}</span>
                  <time dateTime={e.at}>{indiaDate(e.at, i18n.language)}</time>
                </li>
              ))}
          </ol>
        ) : (
          <p>{t('noAudit')}</p>
        )}
      </aside>
    </div>
  )
}
function Suspension({ id }: { id: string }) {
  const { t } = useTranslation()
  const [reason, setReason] = useState('')
  const mutation = useMutation({
    mutationFn: () =>
      send(`/applications/${id}/decision`, {
        action: 'suspend',
        reason,
        evidence: '',
        scores: [],
        minClass: 6,
        maxClass: 10,
      }),
    onSuccess: () => void queryClient.invalidateQueries(),
  })
  return (
    <form
      className="form-stack"
      onSubmit={(e) => {
        e.preventDefault()
        mutation.mutate()
      }}
    >
      <Field label={t('reason')}>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          required
          minLength={10}
          maxLength={1000}
        />
      </Field>
      <MutationError error={mutation.error} />
      {mutation.isSuccess ? (
        <Alert kind="success">{t('actionSuccess')}</Alert>
      ) : (
        <Button variant="danger" type="submit" busy={mutation.isPending}>
          {t('suspend')}
        </Button>
      )}
    </form>
  )
}
function AssessmentCard({ application: a }: { application: Application }) {
  const { t } = useTranslation()
  const [scores, setScores] = useState([0, 0, 0, 0, 0, 0])
  const [evidence, setEvidence] = useState('')
  const [reason, setReason] = useState('')
  const [minClass, setMinClass] = useState(6)
  const [maxClass, setMaxClass] = useState(10)
  const mutation = useMutation({
    mutationFn: (action: string) =>
      send(`/applications/${a.id}/decision`, {
        action,
        reason,
        evidence,
        scores,
        minClass,
        maxClass,
      }),
    onSuccess: () => void queryClient.invalidateQueries(),
  })
  const labels = t('scoreLabels', { returnObjects: true }) as string[]
  return (
    <article className="record-card queue-item">
      <div className="record-header">
        <div>
          <h3>{a.name}</h3>
          <p>
            {t('math')} · {t('classes')} 6–10 · {t('online')}
          </p>
        </div>
        <Status status={a.status} />
      </div>
      <div className="record-content">
        <div>
          <h4>{t('education')}</h4>
          <p>{a.education}</p>
        </div>
        <div>
          <h4>{t('teachingApproach')}</h4>
          <p>{a.approach}</p>
        </div>
        {a.status === 'submitted' ? (
          <Button busy={mutation.isPending} onClick={() => mutation.mutate('review')}>
            {t('reviewApplication')}
          </Button>
        ) : a.status === 'under_review' ? (
          <Button busy={mutation.isPending} onClick={() => mutation.mutate('schedule')}>
            {t('schedule')}
          </Button>
        ) : a.status === 'assessment_scheduled' ? (
          <form
            className="record-form"
            onSubmit={(e) => {
              e.preventDefault()
              mutation.mutate('assess')
            }}
          >
            <h4>{t('scores')}</h4>
            <p>{t('assessmentHelp')}</p>
            <div className="score-grid">
              {labels.map((label, index) => (
                <Field key={label} label={label}>
                  <select
                    value={scores[index] || ''}
                    required
                    onChange={(e) =>
                      setScores((old) =>
                        old.map((n, i) => (i === index ? Number(e.target.value) : n)),
                      )
                    }
                  >
                    <option value="">{t('choose')}</option>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <option key={n} value={n}>
                        {n} / 5
                      </option>
                    ))}
                  </select>
                </Field>
              ))}
            </div>
            <Field label={t('evidence')}>
              <textarea
                value={evidence}
                onChange={(e) => setEvidence(e.target.value)}
                minLength={10}
                maxLength={1200}
                required
              />
            </Field>
            <Button type="submit" busy={mutation.isPending}>
              {t('recordAssessment')}
            </Button>
          </form>
        ) : a.status === 'assessed' ? (
          <form
            className="record-form"
            onSubmit={(e) => {
              e.preventDefault()
              mutation.mutate('approve')
            }}
          >
            <div>
              <h4>{t('evidence')}</h4>
              <p>{a.evidence}</p>
            </div>
            <div className="form-grid">
              <Field label={t('minClass')}>
                <input
                  type="number"
                  value={minClass}
                  min={6}
                  max={10}
                  onChange={(e) => setMinClass(Number(e.target.value))}
                />
              </Field>
              <Field label={t('maxClass')}>
                <input
                  type="number"
                  value={maxClass}
                  min={minClass}
                  max={10}
                  onChange={(e) => setMaxClass(Number(e.target.value))}
                />
              </Field>
            </div>
            <Field label={t('reason')}>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                minLength={10}
                maxLength={1000}
                required
              />
            </Field>
            <div className="button-row">
              <Button type="submit" busy={mutation.isPending}>
                {t('approve')}
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={mutation.isPending}
                onClick={() => mutation.mutate('improve')}
              >
                {t('improve')}
              </Button>
              <Button
                type="button"
                variant="text"
                disabled={mutation.isPending}
                onClick={() => mutation.mutate('decline')}
              >
                {t('decline')}
              </Button>
            </div>
          </form>
        ) : (
          <p>{a.reason}</p>
        )}
        <MutationError error={mutation.error} />
      </div>
    </article>
  )
}
function TrialCard({ trial: v, role }: { trial: Trial; role: 'parent' | 'tutor' | 'mentor' }) {
  const { t, i18n } = useTranslation()
  const config = useConfig()
  const [notes, setNotes] = useState('')
  const [nextSteps, setNextSteps] = useState('')
  const [review, setReview] = useState('')
  const mutation = useMutation({
    mutationFn: (action: string) =>
      send(`/trials/${v.id}/action`, { action, notes, nextSteps, review }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
  })
  return (
    <article className={`record-card ${v.status === 'reviewed' ? 'reviewed-record' : ''}`}>
      <div className="record-header">
        <div>
          <h3>
            {v.learnerName || t('learner')} · {t('math')}
          </h3>
          <p>{indiaDate(v.start, i18n.language)}</p>
        </div>
        <Status status={v.status} />
      </div>
      <div className="record-content">
        <small>{t('freeTrialBody')}</small>
        {role === 'tutor' && v.status === 'requested' && (
          <div className="button-row">
            <Button busy={mutation.isPending} onClick={() => mutation.mutate('accept')}>
              {t('acceptTrial')}
            </Button>
            <Button
              variant="text"
              disabled={mutation.isPending}
              onClick={() => mutation.mutate('decline')}
            >
              {t('decline')}
            </Button>
          </div>
        )}
        {role === 'tutor' && v.status === 'confirmed' && (
          <form
            className="record-form"
            onSubmit={(e) => {
              e.preventDefault()
              mutation.mutate('complete')
            }}
          >
            {config.data?.development && <Alert>{t('simulation')}</Alert>}
            <Field label={t('lessonNotes')}>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                required
                minLength={10}
                maxLength={2000}
              />
            </Field>
            <Field label={t('nextSteps')}>
              <textarea
                value={nextSteps}
                onChange={(e) => setNextSteps(e.target.value)}
                required
                minLength={10}
                maxLength={1200}
              />
            </Field>
            <Button type="submit" busy={mutation.isPending}>
              {t('completeLesson')}
            </Button>
          </form>
        )}
        {((role === 'mentor' && ['completed', 'reviewed'].includes(v.status)) ||
          (role === 'parent' && v.status === 'reviewed')) && (
          <>
            <div>
              <h4>{t('lesson')}</h4>
              <p>{v.notes}</p>
            </div>
            <div>
              <h4>{t('practiceNext')}</h4>
              <p>{v.nextSteps}</p>
            </div>
          </>
        )}
        {role === 'mentor' && v.status === 'completed' && (
          <form
            className="record-form"
            onSubmit={(e) => {
              e.preventDefault()
              mutation.mutate('review')
            }}
          >
            <Field label={t('reviewNotes')}>
              <textarea
                value={review}
                onChange={(e) => setReview(e.target.value)}
                required
                minLength={10}
                maxLength={2000}
              />
            </Field>
            <Button type="submit" busy={mutation.isPending}>
              {t('publishReview')}
            </Button>
          </form>
        )}
        {v.status === 'reviewed' && role !== 'tutor' && (
          <div>
            <h4>{t('reviewNotes')}</h4>
            <p>{v.review}</p>
          </div>
        )}
        {role === 'parent' && v.status === 'completed' && <p>{t('pendingReview')}</p>}
        {['requested', 'confirmed'].includes(v.status) && role !== 'mentor' && (
          <Button
            variant="text"
            busy={mutation.isPending}
            onClick={() => mutation.mutate('cancel')}
          >
            {t('cancelTrial')}
          </Button>
        )}
        <MutationError error={mutation.error} />
      </div>
    </article>
  )
}
