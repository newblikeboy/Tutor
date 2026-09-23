import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  ArrowRight,
  ArrowUpRight,
  Compass,
  RefreshCw,
  Search,
  Sprout,
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
import { initials, workspaceLink, workspaceView } from '../lib/workspace'
import type { WorkspaceView } from '../lib/workspace'
import { useDashboard, useConfig } from '../lib/session'
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
  Status,
} from '../components/ui'
export default function Workspace() {
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
          <h1>{view === 'overview' ? t(`desk.${d.user.role}Title`) : t(`desk.nav.${view}`)}</h1>
          <p>{t(intro)}</p>
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
          {d.user.role === 'parent' && (
            <LinkButton to="/match">
              <Plus size={17} aria-hidden="true" />
              {t('newRequirement')}
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
        <MentorWorkspace data={d} view={view} />
      ) : d.user.role === 'admin' ? (
        <AdminWorkspace data={d} view={view} />
      ) : (
        <Alert>{t('permission')}</Alert>
      )}
    </div>
  )
}
function ParentWelcome() {
  const { t } = useTranslation()
  return (
    <>
      <div className="desk-start-grid">
        <section className="desk-start-card">
          <div className="desk-start-icon" aria-hidden="true">
            <BookOpen size={38} strokeWidth={1.35} />
            <span>01</span>
          </div>
          <p className="desk-eyebrow">{t('desk.startEyebrow')}</p>
          <h2>{t('desk.startTitle')}</h2>
          <p>{t('desk.startBody')}</p>
          <LinkButton to="/match">{t('addLearner')}</LinkButton>
          <small>
            <LockKeyhole size={14} aria-hidden="true" />
            {t('desk.startNote')}
          </small>
        </section>
        <aside className="desk-first-steps">
          <span className="desk-panel-icon">
            <Compass size={23} strokeWidth={1.5} aria-hidden="true" />
          </span>
          <h2>{t('desk.firstSteps')}</h2>
          <ol>
            {[1, 2, 3].map((step) => (
              <li key={step}>
                <span aria-hidden="true">0{step}</span>
                <div>
                  <h3>{t(`desk.firstStep${step}`)}</h3>
                  <p>{t(`desk.firstStep${step}Body`)}</p>
                </div>
              </li>
            ))}
          </ol>
        </aside>
      </div>
      <div className="desk-welcome-bottom">
        <section className="desk-quiet-empty">
          <CalendarDays size={27} strokeWidth={1.4} aria-hidden="true" />
          <div>
            <h2>{t('desk.noSessionTitle')}</h2>
            <p>{t('desk.noSessionBody')}</p>
          </div>
        </section>
        <section className="desk-quiet-empty">
          <Sprout size={28} strokeWidth={1.4} aria-hidden="true" />
          <div>
            <h2>{t('desk.startProgressTitle')}</h2>
            <p>{t('desk.startProgressBody')}</p>
          </div>
        </section>
      </div>
    </>
  )
}
function Parent({ data, view }: { data: Dashboard; view: WorkspaceView }) {
  const { t } = useTranslation()
  const [params, setParams] = useSearchParams()
  const learner =
    data.learners.find((item) => item.id === params.get('learner')) ?? data.learners[0]
  const selected = learner?.id ?? ''
  const reqs = data.requirements.filter((r) => r.learnerId === selected)
  const trials = data.trials.filter((v) => v.learnerId === selected)
  const reviewed = trials.filter((v) => v.status === 'reviewed')
  const open = trials.filter((v) => v.status !== 'reviewed')
  const latestRequirement = [...reqs].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
  if (!learner && view === 'overview') return <ParentWelcome />
  return (
    <>
      {learner ? (
        <section className="desk-learner-bar" aria-label={t('selected')}>
          <span className="desk-learner-avatar" aria-hidden="true">
            {initials(learner.name)}
          </span>
          <div className="desk-learner-identity">
            <p className="desk-eyebrow">{t('desk.learnerLabel')}</p>
            <h2>{learner.name}</h2>
            <span>
              {t('class')} {learner.class} · {learner.board} ·{' '}
              {t(learner.language === 'Hindi' ? 'hindi' : 'english')}
            </span>
          </div>
          <Field label={t('selected')}>
            <select
              value={selected}
              onChange={(e) => {
                // Preserve a view navigation that has reached the URL before
                // BrowserRouter finishes rendering its next screen.
                const next = new URLSearchParams(window.location.search)
                next.set('learner', e.target.value)
                setParams(next)
              }}
            >
              {data.learners.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name} · {t('class')} {l.class}
                </option>
              ))}
            </select>
          </Field>
        </section>
      ) : (
        <Empty title={t('noLearners')} body={t('noLearnersBody')}>
          <LinkButton to="/match">{t('addLearner')}</LinkButton>
        </Empty>
      )}
      <div
        className={`workspace-grid ${view === 'sessions' || view === 'progress' ? 'desk-single-column' : ''}`}
      >
        <div className="workspace-main">
          {learner && ['overview', 'learners'].includes(view) && (
            <section className="learner-focus">
              <p className="desk-eyebrow">
                <BookOpen size={16} aria-hidden="true" />
                {t('currentFocus')}
              </p>
              <h2>
                {t('math')} · {t('class')} {learner.class}
              </h2>
              <p>{latestRequirement?.goal ?? t('desk.noNeeds')}</p>
              {latestRequirement && (
                <Link className="text-link" to={`/match?requirement=${latestRequirement.id}`}>
                  {t('desk.requirementsAction')}
                  <ArrowRight size={16} aria-hidden="true" />
                </Link>
              )}
            </section>
          )}
          {['overview', 'sessions'].includes(view) && (
            <section>
              <div className="section-label">
                <h2>{t('nextClass')}</h2>
                <CalendarDays size={21} className="teal" aria-hidden="true" />
              </div>
              <div className="queue">
                {open.length ? (
                  open.map((v) => <TrialCard key={v.id} trial={v} role="parent" />)
                ) : (
                  <div className="desk-quiet-empty">
                    <CalendarDays size={25} aria-hidden="true" />
                    <div>
                      <h3>{t('noTrials')}</h3>
                      <p>{t('desk.noSessionBody')}</p>
                    </div>
                  </div>
                )}
              </div>
            </section>
          )}
          {['overview', 'progress'].includes(view) && (
            <section>
              <div className="section-label">
                <h2>{t('reviewedProgress')}</h2>
                <ClipboardCheck size={22} className="teal" aria-hidden="true" />
              </div>
              <div className="queue">
                {reviewed.length ? (
                  reviewed.map((v) => <TrialCard key={v.id} trial={v} role="parent" />)
                ) : (
                  <div className="desk-quiet-empty">
                    <Sprout size={26} aria-hidden="true" />
                    <div>
                      <h3>{t('desk.startProgressTitle')}</h3>
                      <p>{t('emptyProgress')}</p>
                    </div>
                  </div>
                )}
              </div>
            </section>
          )}
          {view === 'learners' && (
            <section className="desk-record-note">
              <BookOpen size={25} aria-hidden="true" />
              <h2>{t('desk.familyRecord')}</h2>
              <p>{t('desk.familyRecordBody')}</p>
            </section>
          )}
        </div>
        {['overview', 'learners'].includes(view) && (
          <aside className="workspace-aside">
            <section className="small-card desk-needs">
              <div className="desk-panel-heading">
                <ClipboardCheck size={20} aria-hidden="true" />
                <h2>{t('desk.savedNeeds')}</h2>
              </div>
              {reqs.length ? (
                reqs.map((r) => (
                  <div key={r.id} className="requirement-row">
                    <p>{r.goal}</p>
                    <div>
                      <Status status={r.status} />
                      <Link className="text-link" to={`/match?requirement=${r.id}`}>
                        {t('selectTutor')}
                        <ArrowRight size={15} aria-hidden="true" />
                      </Link>
                    </div>
                  </div>
                ))
              ) : (
                <p>{t('desk.noNeeds')}</p>
              )}
            </section>
            <section className="desk-privacy-card">
              <ShieldCheck size={26} strokeWidth={1.5} aria-hidden="true" />
              <h2>{t('desk.privacyTitle')}</h2>
              <p>{t('privacyNote')}</p>
              <Link to="/tutors" className="text-link">
                {t('desk.exploreTutors')}
                <ArrowRight size={16} aria-hidden="true" />
              </Link>
            </section>
          </aside>
        )}
      </div>
    </>
  )
}
function QueueSummary({
  items,
}: {
  items: { label: string; count: number; href: string; icon: typeof BookOpen }[]
}) {
  const { t } = useTranslation()
  return (
    <>
      <div className="desk-summary">
        {items.map(({ label, count, href, icon: Icon }) => (
          <Link to={href} key={label}>
            <span className="desk-summary-icon">
              <Icon size={21} strokeWidth={1.5} aria-hidden="true" />
            </span>
            <span>
              <strong>{count}</strong>
              <span>{t(label)}</span>
            </span>
            <ArrowUpRight size={17} aria-hidden="true" />
          </Link>
        ))}
      </div>
      <p className="desk-summary-note">{t('desk.recordsScope')}</p>
    </>
  )
}
function TutorWorkspace({ data, view }: { data: Dashboard; view: WorkspaceView }) {
  const { t } = useTranslation()
  const app = data.applications[0]
  const statuses = [
    'submitted',
    'under_review',
    'assessment_scheduled',
    'assessed',
    'approved',
    'improvement_required',
    'declined',
    'suspended',
  ]
  const stage =
    app?.status === 'approved'
      ? 3
      : ['assessed', 'suspended'].includes(app?.status ?? '')
        ? 2
        : app && statuses.includes(app.status)
          ? 1
          : 0
  return (
    <>
      {view === 'overview' && (
        <QueueSummary
          items={[
            {
              label: 'desk.requests',
              count: data.trials.filter((v) => v.status === 'requested').length,
              href: workspaceLink('sessions'),
              icon: CalendarDays,
            },
            {
              label: 'desk.confirmed',
              count: data.trials.filter((v) => v.status === 'confirmed').length,
              href: workspaceLink('sessions'),
              icon: BookOpen,
            },
            {
              label: 'desk.awaitingReview',
              count: data.trials.filter((v) => v.status === 'completed').length,
              href: workspaceLink('sessions'),
              icon: ClipboardCheck,
            },
          ]}
        />
      )}
      <div className={`workspace-grid ${view === 'sessions' ? 'desk-single-column' : ''}`}>
        <div className="workspace-main">
          <section>
            <div className="section-label">
              <h2>{t('nextClass')}</h2>
              <CalendarDays className="teal" size={22} aria-hidden="true" />
            </div>
            <div className="queue">
              {data.trials.length ? (
                data.trials.map((v) => <TrialCard key={v.id} trial={v} role="tutor" />)
              ) : (
                <Empty title={t('noTrials')} body={t('desk.tutorEmpty')} />
              )}
            </div>
          </section>
        </div>
        {view === 'overview' && (
          <aside className="workspace-aside">
            <section className="application-status">
              <p className="desk-eyebrow">{t('desk.applicationStatus')}</p>
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
                <p>{t('applicationWarning')}</p>
              )}
              <LinkButton to="/apply">{t(app ? 'desk.applicationLink' : 'teach')}</LinkButton>
            </section>
            <section className="small-card desk-application-steps">
              <h2>{t('desk.applicationSteps')}</h2>
              <ol>
                {['desk.stepApplication', 'desk.stepAssessment', 'desk.stepApproval'].map(
                  (key, index) => (
                    <li key={key} className={index < stage ? 'complete' : ''}>
                      <span aria-hidden="true">
                        {index < stage ? <CheckCircle2 size={18} /> : `0${index + 1}`}
                      </span>
                      {t(key)}
                    </li>
                  ),
                )}
              </ol>
              <p>{t('applicationWarning')}</p>
            </section>
          </aside>
        )}
      </div>
    </>
  )
}
function ApplicationFilters({ applications }: { applications: Application[] }) {
  const { t } = useTranslation()
  const [params, setParams] = useSearchParams()
  function update(key: string, value: string) {
    // BrowserRouter can still be rendering the previous navigation when the
    // next control changes. Merge with the latest URL to preserve both filters.
    const next = new URLSearchParams(window.location.search)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }
  return (
    <div className="desk-queue-controls">
      <div className="desk-search-field">
        <Search size={17} aria-hidden="true" />
        <Field label={t('desk.queueSearch')}>
          <input
            type="search"
            placeholder={t('desk.queuePlaceholder')}
            value={params.get('q') ?? ''}
            onChange={(e) => update('q', e.target.value)}
          />
        </Field>
      </div>
      <Field label={t('desk.queueStatus')}>
        <select
          value={params.get('status') ?? ''}
          onChange={(e) => update('status', e.target.value)}
        >
          <option value="">{t('desk.allStatuses')}</option>
          {[
            ...new Set([
              ...applications.map((a) => a.status),
              ...(params.get('status') ? [params.get('status')!] : []),
            ]),
          ]
            .sort()
            .map((status) => (
              <option key={status} value={status}>
                {t(status)}
              </option>
            ))}
        </select>
      </Field>
    </div>
  )
}
function filteredApplications(applications: Application[], params: URLSearchParams) {
  const query = (params.get('q') ?? '').trim().toLocaleLowerCase()
  const status = params.get('status') ?? ''
  return applications.filter(
    (a) =>
      (!query || a.name.toLocaleLowerCase().includes(query)) && (!status || a.status === status),
  )
}
function FilterEmpty() {
  const { t } = useTranslation()
  const [params, setParams] = useSearchParams()
  return (
    <Empty title={t('desk.queueEmpty')} body={t('desk.queueEmptyBody')}>
      <Button
        variant="secondary"
        onClick={() => {
          const next = new URLSearchParams(params)
          next.delete('q')
          next.delete('status')
          setParams(next)
        }}
      >
        {t('desk.clearFilters')}
      </Button>
    </Empty>
  )
}
function MentorWorkspace({ data, view }: { data: Dashboard; view: WorkspaceView }) {
  const { t } = useTranslation()
  const [params] = useSearchParams()
  const applications = filteredApplications(data.applications, params)
  return (
    <>
      {view === 'overview' && (
        <QueueSummary
          items={[
            {
              label: 'desk.assessmentQueue',
              count: data.applications.length,
              href: workspaceLink('assessments'),
              icon: ClipboardCheck,
            },
            {
              label: 'desk.awaitingReview',
              count: data.trials.filter((v) => v.status === 'completed').length,
              href: workspaceLink('reviews'),
              icon: BookOpen,
            },
            {
              label: 'desk.completedReviews',
              count: data.trials.filter((v) => v.status === 'reviewed').length,
              href: workspaceLink('reviews'),
              icon: CheckCircle2,
            },
          ]}
        />
      )}
      <div className={`queue-layout ${view !== 'overview' ? 'desk-single-column' : ''}`}>
        {view !== 'reviews' && (
          <section>
            <div className="section-label">
              <h2>{t('applications')}</h2>
              <ClipboardCheck size={22} className="teal" aria-hidden="true" />
            </div>
            <ApplicationFilters applications={data.applications} />
            <p className="desk-result-count" role="status">
              {t('desk.records', { count: applications.length })}
            </p>
            <div className="queue">
              {applications.length ? (
                applications.map((v) => <AssessmentCard key={v.id} application={v} />)
              ) : data.applications.length ? (
                <FilterEmpty />
              ) : (
                <Empty title={t('noApplications')} body={t('noApplicationsBody')} />
              )}
            </div>
          </section>
        )}
        {view !== 'assessments' && (
          <section>
            <div className="section-label">
              <h2>{t('reviewedProgress')}</h2>
              <BookOpen size={21} className="teal" aria-hidden="true" />
            </div>
            <div className="queue">
              {data.trials.length ? (
                data.trials.map((v) => <TrialCard key={v.id} trial={v} role="mentor" />)
              ) : (
                <Empty title={t('desk.reviewEmpty')} body={t('desk.reviewEmptyBody')} />
              )}
            </div>
          </section>
        )}
      </div>
    </>
  )
}
function AdminWorkspace({ data, view }: { data: Dashboard; view: WorkspaceView }) {
  const { t, i18n } = useTranslation()
  const [params] = useSearchParams()
  const applications = filteredApplications(data.applications, params)
  return (
    <>
      {view === 'overview' && (
        <QueueSummary
          items={[
            {
              label: 'desk.activeScopes',
              count: data.applications.filter((a) => a.status === 'approved').length,
              href: workspaceLink('tutors'),
              icon: ShieldCheck,
            },
            {
              label: 'desk.suspendedScopes',
              count: data.applications.filter((a) => a.status === 'suspended').length,
              href: workspaceLink('tutors'),
              icon: LockKeyhole,
            },
            {
              label: 'desk.auditEntries',
              count: data.events.length,
              href: workspaceLink('audit'),
              icon: ClipboardCheck,
            },
          ]}
        />
      )}
      <div className={`queue-layout ${view !== 'overview' ? 'desk-single-column' : ''}`}>
        {view !== 'audit' && (
          <section>
            <div className="section-label">
              <h2>{t('desk.teachingScopes')}</h2>
              <ShieldCheck size={22} className="teal" aria-hidden="true" />
            </div>
            <ApplicationFilters applications={data.applications} />
            <p className="desk-result-count" role="status">
              {t('desk.records', { count: applications.length })}
            </p>
            <div className="queue">
              {applications.length ? (
                applications.map((v) => (
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
              ) : data.applications.length ? (
                <FilterEmpty />
              ) : (
                <Empty title={t('noApplications')} />
              )}
            </div>
          </section>
        )}
        {view !== 'tutors' && (
          <aside className="panel desk-audit">
            <div className="desk-panel-heading">
              <ClipboardCheck size={20} aria-hidden="true" />
              <h2>{t('audit')}</h2>
            </div>
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
        )}
      </div>
    </>
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
            {t('math')} · {t('classes')} {a.scope.minClass}–{a.scope.maxClass} · {t('online')}
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
