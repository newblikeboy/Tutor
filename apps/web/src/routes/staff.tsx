import { useEffect, useState } from 'react'
import { useInfiniteQuery, useMutation, useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  ClipboardCheck,
  FileText,
  GraduationCap,
  RefreshCw,
  ShieldCheck,
  Video,
} from 'lucide-react'
import { api, indiaDate, queryClient, send, type Application, type Schema } from '../lib/api'
import { initials, workspaceLink, workspaceView } from '../lib/workspace'
import { useAuth, useConfig } from '../lib/session'
import {
  Alert,
  Button,
  Empty,
  Field,
  Loading,
  LoadError,
  Modal,
  MutationError,
  Status,
} from '../components/ui'
import { InterviewCard } from '../components/interview'
import { PrivateFiles } from './files'
import { ApplicationScope, ApplicationSummary } from '../components/application-summary'
import { TabBar, TabPanel, useActivePanel } from '../components/workspace-tabs'
import '../styles/staff.css'

type Decision = Omit<Schema['DecisionInput'], 'version'>
function useClock() {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(timer)
  }, [])
  return now
}
function useDecision(application: Application) {
  return useMutation({
    mutationFn: (body: Decision) =>
      send(`/applications/${application.id}/decision`, { ...body, version: application.version }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['staff'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
      ])
    },
  })
}
function useStaffPage<T extends { nextCursor: string }>(path: string) {
  const active = useActivePanel()
  return useInfiniteQuery({
    enabled: active,
    queryKey: ['staff', path],
    initialPageParam: '',
    queryFn: ({ pageParam, signal }) =>
      api<T>(`${path}${path.includes('?') ? '&' : '?'}cursor=${encodeURIComponent(pageParam)}`, {
        signal,
      }),
    getNextPageParam: (last) => last.nextCursor || undefined,
  })
}
function applicationURL(id: string, view = 'applications') {
  return `/workspace?view=${view}&application=${encodeURIComponent(id)}`
}

export default function StaffWorkspace() {
  const { t } = useTranslation()
  const auth = useAuth()
  const [params, setParams] = useSearchParams()
  const role = auth.data!.user.role
  const view = workspaceView(role, params.get('view'))
  const application = params.get('application')
  const queueView = role === 'admin' ? 'applications' : 'assessments'
  const network = ['tutors', 'followups'].includes(view)
  const queueTabs = network
    ? [
        { value: 'tutors', label: t('staffOps.tutors') },
        { value: 'followups', label: t('staffOps.followups') },
      ]
    : [
        { value: queueView, label: t('staffOps.applications') },
        { value: 'interviews', label: t('staffOps.interviews') },
      ]
  return (
    <div className={`desk-content staff-content desk-view-${view}`} data-role={role}>
      <div className="desk-page-heading staff-page-heading">
        <div>
          <p className="desk-eyebrow">{t('staffOps.label')}</p>
          <h1>
            {application
              ? t('staffOps.applications')
              : view === 'overview'
                ? t('staffOps.title')
                : t(`desk.nav.${network ? 'tutors' : view === 'interviews' ? queueView : view}`)}
          </h1>
        </div>
        <Button
          variant="secondary"
          aria-label={t('desk.refresh')}
          onClick={() => void queryClient.invalidateQueries({ queryKey: ['staff'] })}
        >
          <RefreshCw size={18} aria-hidden="true" />
        </Button>
      </div>
      {application ? (
        <ApplicationDetail key={application} id={application} />
      ) : view === 'overview' ? (
        <StaffOverview queueView={queueView} />
      ) : view === 'audit' ? (
        <History />
      ) : (
        <>
          <TabBar
            id="staff-queue"
            label={t(network ? 'staffOps.tutors' : 'staffOps.applications')}
            value={view}
            options={queueTabs}
            onChange={(nextView) => {
              const next = new URLSearchParams(params)
              next.set('view', nextView)
              for (const key of ['status', 'application', 'tab', 'cursor']) next.delete(key)
              setParams(next)
            }}
          />
          {queueTabs.map((tab) => (
            <TabPanel
              id="staff-queue"
              key={tab.value}
              value={tab.value}
              active={view === tab.value}
            >
              <h2 className="sr-only">{tab.label}</h2>
              {tab.value === 'followups' ? (
                <Followups />
              ) : (
                <ApplicationQueue
                  kind={
                    tab.value === 'tutors'
                      ? 'tutors'
                      : tab.value === 'interviews'
                        ? 'interviews'
                        : 'applications'
                  }
                />
              )}
            </TabPanel>
          ))}
        </>
      )}
    </div>
  )
}

function StaffOverview({ queueView }: { queueView: string }) {
  const { t } = useTranslation()
  const auth = useAuth()
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') === 'applications' ? 'applications' : 'interviews'
  const query = useQuery({
    queryKey: ['staff', 'overview'],
    queryFn: ({ signal }) => api<Schema['StaffOverview']>('/staff/overview', { signal }),
  })
  if (query.isPending) return <Loading />
  if (query.isError) return <LoadError retry={() => void query.refetch()} />
  const { counts, upcoming, followups } = query.data
  const metrics = [
    {
      label: 'newApplications',
      count: counts.submitted ?? 0,
      icon: FileText,
      view: queueView,
      status: 'submitted',
    },
    {
      label: 'inReview',
      count: (counts.under_review ?? 0) + (counts.assessed ?? 0),
      icon: ClipboardCheck,
      view: queueView,
      status: '',
    },
    {
      label: 'scheduled',
      count: counts.assessment_scheduled ?? 0,
      icon: Video,
      view: 'interviews',
      status: '',
    },
    {
      label: 'approved',
      count: counts.approved ?? 0,
      icon: GraduationCap,
      view: auth.data!.user.role === 'admin' ? 'tutors' : queueView,
      status: 'approved',
    },
  ]
  return (
    <>
      <nav className="staff-metrics" aria-label={t('desk.nav.overview')}>
        {metrics.map(({ label, count, icon: Icon, view, status }) => (
          <Link key={label} to={`/workspace?view=${view}${status ? `&status=${status}` : ''}`}>
            <Icon size={21} aria-hidden="true" />
            <strong>{count}</strong>
            <span>{t(`staffOps.${label}`)}</span>
            <ArrowRight size={16} aria-hidden="true" />
          </Link>
        ))}
      </nav>
      {followups > 0 && (
        <Link className="staff-followup-alert" to={workspaceLink('followups')}>
          <ShieldCheck size={22} aria-hidden="true" />
          <span>{t('staffOps.followupCount', { count: followups })}</span>
          <ArrowRight size={18} aria-hidden="true" />
        </Link>
      )}
      <TabBar
        id="staff-overview"
        label={t('staffOps.title')}
        value={tab}
        options={[
          { value: 'interviews', label: t('staffOps.nextInterviews') },
          { value: 'applications', label: t('staffOps.newQueue') },
        ]}
        onChange={(value) => {
          const next = new URLSearchParams(params)
          next.set('tab', value)
          setParams(next)
        }}
      />
      <TabPanel id="staff-overview" value="applications" active={tab === 'applications'}>
        <section className="staff-panel">
          <div className="staff-section-title">
            <h2>{t('staffOps.newQueue')}</h2>
            <Link to={`/workspace?view=${queueView}`}>
              {t('staffOps.viewAll')}
              <ArrowRight size={15} aria-hidden="true" />
            </Link>
          </div>
          <ApplicationQueue compact kind="applications" />
        </section>
      </TabPanel>
      <TabPanel id="staff-overview" value="interviews" active={tab === 'interviews'}>
        <section className="staff-panel">
          <div className="staff-section-title">
            <h2>{t('staffOps.nextInterviews')}</h2>
            <CalendarDays size={20} aria-hidden="true" />
          </div>
          {upcoming.length ? (
            <ApplicationRows applications={upcoming} view="interviews" />
          ) : (
            <Empty title={t('staffOps.noInterviews')} />
          )}
        </section>
      </TabPanel>
    </>
  )
}

function ApplicationRows({ applications, view }: { applications: Application[]; view: string }) {
  const { t, i18n } = useTranslation()
  const [params] = useSearchParams()
  return (
    <div className="staff-rows">
      {applications.map((application) => {
        const next = new URLSearchParams(params)
        next.set('view', view)
        next.set('application', application.id)
        return (
          <Link className="staff-row" key={application.id} to={`/workspace?${next}`}>
            <span className="staff-avatar" aria-hidden="true">
              {initials(application.name)}
            </span>
            <div className="staff-row-person">
              <strong>{application.name}</strong>
              <p>
                {application.profile ? (
                  application.profile.teachingAreas
                    .map(
                      (area) =>
                        `${t(`applicationForm.${area.subject}`)} ${area.minClass}–${area.maxClass} · ${area.modes.map((m) => t(`applicationForm.${m}`)).join(' / ')}`,
                    )
                    .join('; ')
                ) : (
                  <>
                    {t('math')} · {t('classes')} {application.scope.minClass}–
                    {application.scope.maxClass}
                  </>
                )}
              </p>
              {view === 'interviews' && application.interview && (
                <time dateTime={application.interview.start}>
                  {indiaDate(application.interview.start, i18n.language)}
                </time>
              )}
            </div>
            <Status status={application.status} />
            <ArrowRight size={17} aria-hidden="true" />
          </Link>
        )
      })}
    </div>
  )
}

function ApplicationQueue({ kind, compact = false }: { kind: string; compact?: boolean }) {
  const { t } = useTranslation()
  const auth = useAuth()
  const [params, setParams] = useSearchParams()
  const request = new URLSearchParams({ kind })
  for (const key of ['status', 'q', 'assignee', 'mode']) {
    const value = params.get(key)
    if (value && !compact) request.set(key, value)
  }
  if (compact) request.set('status', 'submitted')
  const query = useStaffPage<Schema['StaffApplications']>(`/staff/applications?${request}`)
  function update(key: string, value: string) {
    const next = new URLSearchParams(window.location.search)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }
  const statuses =
    kind === 'tutors'
      ? ['approved', 'suspended', 'terminated', 'expired']
      : kind === 'interviews'
        ? []
        : [
            'submitted',
            'under_review',
            'assessment_scheduled',
            'assessed',
            'improvement_required',
            'declined',
            'approved',
            'suspended',
            'terminated',
            'expired',
          ]
  const view =
    kind === 'applications'
      ? auth.data!.user.role === 'admin'
        ? 'applications'
        : 'assessments'
      : kind
  const applications = query.data?.pages.flatMap((p) => p.items) ?? []
  return (
    <>
      {!compact && (
        <div className="staff-filters">
          <Field label={t('staffOps.search')}>
            <input
              aria-label={t('staffOps.search')}
              value={params.get('q') ?? ''}
              maxLength={80}
              placeholder={t('staffOps.searchPlaceholder')}
              onChange={(event) => update('q', event.target.value)}
            />
          </Field>
          {statuses.length > 0 && (
            <Field label={t('staffOps.status')}>
              <select
                value={params.get('status') ?? ''}
                onChange={(event) => update('status', event.target.value)}
              >
                <option value="">{t('staffOps.all')}</option>
                {statuses.map((status) => (
                  <option key={status} value={status}>
                    {t(
                      status === 'expired'
                        ? 'staffOps.expired'
                        : status === 'assessed'
                          ? 'assessmentRecorded'
                          : status,
                    )}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <Field label={t('staffOps.assigneeFilter')}>
            <select
              value={params.get('assignee') ?? ''}
              onChange={(event) => update('assignee', event.target.value)}
            >
              <option value="">{t('staffOps.everyone')}</option>
              <option value="mine">{t('staffOps.mine')}</option>
            </select>
          </Field>
          <Field label={t('applicationForm.requestedMode')}>
            <select
              value={params.get('mode') ?? ''}
              onChange={(event) => update('mode', event.target.value)}
            >
              <option value="">{t('staffOps.all')}</option>
              <option value="home">{t('applicationForm.home')}</option>
              <option value="online">{t('applicationForm.online')}</option>
            </select>
          </Field>
          {['q', 'status', 'assignee', 'mode'].some((key) => params.has(key)) && (
            <Button
              variant="text"
              onClick={() => {
                const next = new URLSearchParams(params)
                for (const key of ['q', 'status', 'assignee', 'mode']) next.delete(key)
                setParams(next, { replace: true })
              }}
            >
              {t('desk.clearFilters')}
            </Button>
          )}
        </div>
      )}
      {query.isPending ? (
        <Loading />
      ) : query.isError ? (
        <LoadError retry={() => void query.refetch()} />
      ) : applications.length ? (
        <ApplicationRows
          applications={compact ? applications.slice(0, 5) : applications}
          view={view}
        />
      ) : (
        <Empty
          title={t(kind === 'interviews' ? 'staffOps.noInterviews' : 'staffOps.noApplications')}
        />
      )}
      {!compact && query.hasNextPage && (
        <Button
          variant="secondary"
          busy={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
        >
          {t('staffOps.more')}
        </Button>
      )}
    </>
  )
}

function ApplicationDetail({ id }: { id: string }) {
  const { t, i18n } = useTranslation()
  const [params, setParams] = useSearchParams()
  const auth = useAuth()
  const now = useClock()
  const query = useQuery({
    queryKey: ['staff', 'application', id],
    queryFn: ({ signal }) =>
      api<Schema['StaffDetail']>(`/staff/applications/${encodeURIComponent(id)}`, { signal }),
    refetchInterval: (q) =>
      q.state.data?.application.interview?.syncStatus === 'pending' ? 2000 : false,
  })
  const back = new URLSearchParams(params)
  back.delete('application')
  back.delete('tab')
  if (query.isPending) return <Loading />
  if (query.isError) return <LoadError retry={() => void query.refetch()} />
  const { application: a, email, assessor } = query.data
  const admin = auth.data!.user.role === 'admin'
  const assigned = a.assessorId === auth.data!.user.id
  const expired = Date.parse(a.scope.expiresAt) <= now
  const tabs = [
    { value: 'application', label: t('staffOps.applicationTab') },
    { value: 'review', label: t('staffOps.reviewTab') },
    ...(admin || assigned ? [{ value: 'documents', label: t('staffOps.documentsTab') }] : []),
    { value: 'history', label: t('staffOps.historyTab') },
  ]
  const tab = tabs.find((item) => item.value === params.get('tab'))?.value ?? 'application'

  return (
    <>
      <Link className="staff-back" to={`/workspace?${back}`}>
        <ArrowLeft size={17} aria-hidden="true" />
        {t('staffOps.back')}
      </Link>
      <article className="staff-detail" aria-labelledby="staff-applicant-name">
        <header className="staff-person-heading">
          <span className="staff-avatar" aria-hidden="true">
            {initials(a.name)}
          </span>
          <div>
            <h2 id="staff-applicant-name">{a.name}</h2>
            <p>{email}</p>
            {a.sample && <span className="staff-sample">{t('sample')}</span>}
          </div>
          <Status status={a.status} />
        </header>
        <TabBar
          id="staff-detail"
          label={t('staffOps.applications')}
          value={tab}
          options={tabs}
          onChange={(value) => {
            const next = new URLSearchParams(params)
            next.set('tab', value)
            setParams(next)
          }}
        />
        <TabPanel id="staff-detail" value="application" active={tab === 'application'}>
          <div className="staff-detail-main">
            {a.profile ? (
              <>
                <ApplicationScope application={a} />
                <ApplicationSummary profile={a.profile} email={email} />
              </>
            ) : (
              <section className="staff-panel">
                <h3>{t('staffOps.details')}</h3>
                <dl className="staff-facts">
                  <div>
                    <dt>{t('staffOps.scope')}</dt>
                    <dd>
                      {t('math')} · {t('classes')} {a.scope.minClass}–{a.scope.maxClass} ·{' '}
                      {t(a.scope.mode)}
                    </dd>
                  </div>
                  <div>
                    <dt>{t('experience')}</dt>
                    <dd>{t('staffOps.experience', { count: a.experience })}</dd>
                  </div>
                  <div>
                    <dt>{t('preferredLanguage')}</dt>
                    <dd>{t(a.language.toLowerCase())}</dd>
                  </div>
                  <div>
                    <dt>{t('staffOps.reviewer')}</dt>
                    <dd>{assessor.name || t('staffOps.unassigned')}</dd>
                  </div>
                </dl>
                <h4>{t('education')}</h4>
                <p className="staff-prose">{a.education}</p>
                <h4>{t('teachingApproach')}</h4>
                <p className="staff-prose">{a.approach}</p>
              </section>
            )}
          </div>
        </TabPanel>
        <TabPanel id="staff-detail" value="review" active={tab === 'review'} preserve>
          <div className="staff-detail-grid">
            <div className="staff-detail-main">
              <ApplicationScope application={a} />
              <section className="staff-panel">
                <h3>{t('staffOps.reviewer')}</h3>
                <p>{assessor.name || t('staffOps.unassigned')}</p>
              </section>
              <InterviewCard application={a} />
              {!!a.scores?.length && (
                <section className="staff-panel">
                  <h3>{t('staffOps.assessment')}</h3>
                  <div className="staff-score-summary">
                    {(t('scoreLabels', { returnObjects: true }) as string[]).map((label, index) => (
                      <div key={label}>
                        <span>{label}</span>
                        <strong>
                          {a.scores[index]}
                          <small> / 5</small>
                        </strong>
                      </div>
                    ))}
                  </div>
                  <p className="staff-prose">{a.evidence}</p>
                </section>
              )}
              {a.reason && (
                <section className="staff-panel">
                  <h3>{t('staffOps.decision')}</h3>
                  <p className="staff-prose">{a.reason}</p>
                  {['approved', 'suspended'].includes(a.status) && (
                    <p className="muted">
                      {t('staffOps.reviewDate')}: {indiaDate(a.scope.expiresAt, i18n.language)}
                    </p>
                  )}
                </section>
              )}
            </div>
            <aside className="staff-actions" key={a.id} aria-label={t('staffOps.decision')}>
              {a.profile && (
                <section className="staff-panel">
                  <h3>{t('applicationForm.eligibility')}</h3>
                  <p>{t(`applicationForm.${a.eligibility?.status ?? 'pending'}`)}</p>
                  {a.eligibility?.reason && <p>{a.eligibility.reason}</p>}
                  {admin &&
                    [
                      'submitted',
                      'under_review',
                      'assessment_scheduled',
                      'assessed',
                      'improvement_required',
                    ].includes(a.status) && (
                      <details
                        className="staff-eligibility-edit"
                        open={['pending', 'blocked'].includes(a.eligibility?.status ?? 'pending')}
                      >
                        <summary>{t('applicationForm.recordReview')}</summary>
                        <EligibilityForm application={a} />
                      </details>
                    )}
                </section>
              )}
              {a.status === 'submitted' && (
                <section className="staff-panel">
                  <h3>{t('staffOps.takeReview')}</h3>
                  <ReviewForm application={a} />
                </section>
              )}
              {assigned && a.status === 'under_review' && !a.conflictClear && (
                <section className="staff-panel">
                  <h3>{t('staffOps.confirmConflict')}</h3>
                  <ReviewForm application={a} confirm />
                </section>
              )}
              {assigned && a.conflictClear && a.status === 'under_review' && (
                <section className="staff-panel">
                  <h3>{t('staffOps.schedule')}</h3>
                  <InterviewForm application={a} />
                </section>
              )}
              {assigned && a.status === 'assessment_scheduled' && (
                <>
                  <section className="staff-panel">
                    <h3>{t('staffOps.assessment')}</h3>
                    <AssessmentForm application={a} />
                  </section>
                  <details className="staff-panel">
                    <summary>{t('staffOps.reschedule')}</summary>
                    <InterviewForm application={a} reschedule />
                  </details>
                  <ActionDialog application={a} action="cancel_interview" label="cancelInterview" />
                  {a.interview && Date.parse(a.interview.start) <= now && (
                    <ActionDialog application={a} action="no_show" label="noShow" />
                  )}
                </>
              )}
              {assigned && a.status === 'assessed' && (
                <section className="staff-panel">
                  <h3>{t('staffOps.approve')}</h3>
                  <ApprovalForm application={a} />
                </section>
              )}
              {assigned &&
                a.conflictClear &&
                ['under_review', 'assessment_scheduled', 'assessed'].includes(a.status) && (
                  <div className="staff-action-pair">
                    <ActionDialog application={a} action="improve" label="improve" />
                    <ActionDialog application={a} action="decline" label="decline" />
                  </div>
                )}
              {!assigned &&
                ![
                  'submitted',
                  'approved',
                  'suspended',
                  'terminated',
                  'declined',
                  'improvement_required',
                ].includes(a.status) && <Alert>{t('staffOps.awaitingReviewer')}</Alert>}
              {admin &&
                ['submitted', 'under_review', 'assessment_scheduled'].includes(a.status) && (
                  <details className="staff-panel">
                    <summary>{t(assessor.id ? 'staffOps.reassign' : 'staffOps.assign')}</summary>
                    <AssignmentForm application={a} />
                  </details>
                )}
              {admin && a.status === 'approved' && (
                <ActionDialog
                  application={a}
                  action="suspend"
                  label="suspend"
                  description="suspendBody"
                  danger
                />
              )}
              {admin && a.status === 'suspended' && !expired && (
                <ActionDialog
                  application={a}
                  action="reinstate"
                  label="reinstate"
                  description="reinstateBody"
                />
              )}
              {admin && ['approved', 'suspended'].includes(a.status) && (
                <ActionDialog
                  application={a}
                  action="terminate"
                  label="terminate"
                  description="terminateBody"
                  danger
                />
              )}
              {admin &&
                (a.status === 'declined' ||
                  (expired && ['approved', 'suspended'].includes(a.status))) && (
                  <ActionDialog
                    application={a}
                    action="reopen"
                    label="reopen"
                    description="reopenBody"
                  />
                )}
              {(admin || assigned) && (
                <details className="staff-panel">
                  <summary>{t('staffOps.note')}</summary>
                  <ReasonForm application={a} action="note" label="addNote" hint="noteHint" />
                </details>
              )}
            </aside>
          </div>
        </TabPanel>
        {(admin || assigned) && (
          <TabPanel id="staff-detail" value="documents" active={tab === 'documents'}>
            <PrivateFiles target="applications" id={a.id} canUpload={false} />
          </TabPanel>
        )}
        <TabPanel id="staff-detail" value="history" active={tab === 'history'}>
          <section className="staff-panel">
            <h3>{t('staffOps.history')}</h3>
            <History application={a.id} applicantName={a.name} />
          </section>
        </TabPanel>
      </article>
    </>
  )
}

function ReviewForm({
  application,
  confirm = false,
}: {
  application: Application
  confirm?: boolean
}) {
  const { t } = useTranslation()
  const mutation = useDecision(application)
  return (
    <form
      className="form-stack"
      onSubmit={(event) => {
        event.preventDefault()
        mutation.mutate({ action: confirm ? 'confirm_conflict' : 'review', conflictClear: true })
      }}
    >
      <label className="staff-check">
        <input type="checkbox" required />
        <span>{t('staffOps.conflictClear')}</span>
      </label>
      <MutationError error={mutation.error} />
      <Button type="submit" busy={mutation.isPending}>
        {t(confirm ? 'staffOps.confirmConflict' : 'staffOps.takeReview')}
      </Button>
    </form>
  )
}

function InterviewForm({
  application,
  reschedule = false,
}: {
  application: Application
  reschedule?: boolean
}) {
  const { t } = useTranslation()
  const config = useConfig()
  const mutation = useDecision(application)
  const [start, setStart] = useState(() =>
    new Date(
      (application.interview ? Date.parse(application.interview.start) : Date.now() + 86_400_000) +
        19_800_000,
    )
      .toISOString()
      .slice(0, 16),
  )
  const [duration, setDuration] = useState(
    application.interview
      ? Math.round(
          (Date.parse(application.interview.end) - Date.parse(application.interview.start)) / 60000,
        )
      : 30,
  )
  const [reason, setReason] = useState('')
  return (
    <form
      className="form-stack"
      aria-label={t(reschedule ? 'staffOps.reschedule' : 'staffOps.schedule')}
      onSubmit={(event) => {
        event.preventDefault()
        const instant = new Date(`${start}+05:30`)
        mutation.mutate({
          action: reschedule ? 'reschedule' : 'schedule',
          reason,
          interview: {
            start: instant.toISOString(),
            end: new Date(instant.getTime() + duration * 60_000).toISOString(),
            timezone: 'Asia/Kolkata',
            joinUrl: '',
            status: 'scheduled',
          },
        })
      }}
    >
      <Field label={t('staffOps.start')}>
        <input
          type="datetime-local"
          value={start}
          onChange={(event) => setStart(event.target.value)}
          required
        />
      </Field>
      <Field label={t('staffOps.duration')}>
        <select value={duration} onChange={(event) => setDuration(Number(event.target.value))}>
          {[15, 30, 45, 60, 90, 120].map((count) => (
            <option key={count} value={count}>
              {t('staffOps.minutes', { count })}
            </option>
          ))}
        </select>
      </Field>
      {!config.data?.meetingsEnabled && <Alert>{t('staffOps.zoomUnconfigured')}</Alert>}
      {reschedule && (
        <Field label={t('staffOps.reason')}>
          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            minLength={10}
            maxLength={1000}
            required
          />
        </Field>
      )}
      <MutationError error={mutation.error} />
      <Button
        type="submit"
        busy={mutation.isPending}
        disabled={!config.data?.meetingsEnabled || application.interview?.syncStatus === 'pending'}
      >
        {t(reschedule ? 'staffOps.updateZoom' : 'staffOps.createZoom')}
      </Button>
    </form>
  )
}

function AssessmentForm({ application }: { application: Application }) {
  const { t } = useTranslation()
  const mutation = useDecision(application)
  const [scores, setScores] = useState([0, 0, 0, 0, 0, 0])
  const [evidence, setEvidence] = useState('')
  const now = useClock()
  const future = !!application.interview && Date.parse(application.interview.start) > now
  return (
    <form
      className="form-stack"
      aria-label={t('staffOps.assessment')}
      onSubmit={(event) => {
        event.preventDefault()
        mutation.mutate({ action: 'assess', scores, evidence })
      }}
    >
      <div className="staff-score-inputs">
        {(t('scoreLabels', { returnObjects: true }) as string[]).map((label, index) => (
          <Field label={label} key={label}>
            <select
              required
              value={scores[index] || ''}
              onChange={(event) =>
                setScores((old) =>
                  old.map((score, i) => (i === index ? Number(event.target.value) : score)),
                )
              }
            >
              <option value="">{t('choose')}</option>
              {[1, 2, 3, 4, 5].map((score) => (
                <option key={score} value={score}>
                  {score} / 5
                </option>
              ))}
            </select>
          </Field>
        ))}
      </div>
      <Field label={t('evidence')}>
        <textarea
          value={evidence}
          onChange={(event) => setEvidence(event.target.value)}
          required
          minLength={10}
          maxLength={1200}
        />
      </Field>
      <MutationError error={mutation.error} />
      {future && <p className="muted">{t('staffOps.afterInterview')}</p>}
      <Button
        type="submit"
        busy={mutation.isPending}
        disabled={
          future ||
          (!!application.interview?.provider && application.interview.syncStatus !== 'ready')
        }
      >
        {t('staffOps.recordAssessment')}
      </Button>
    </form>
  )
}

function EligibilityForm({ application }: { application: Application }) {
  const { t } = useTranslation(),
    mutation = useDecision(application)
  const [outcome, setOutcome] = useState<'cleared' | 'blocked'>('cleared'),
    [reason, setReason] = useState('')
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        mutation.mutate({ action: 'eligibility', eligibility: outcome, reason })
      }}
    >
      <Field label={t('applicationForm.eligibility')}>
        <select
          value={outcome}
          onChange={(e) => setOutcome(e.target.value as 'cleared' | 'blocked')}
        >
          <option value="cleared">{t('applicationForm.cleared')}</option>
          <option value="blocked">{t('applicationForm.blocked')}</option>
        </select>
      </Field>
      <Field label={t('applicationForm.reason')}>
        <textarea
          required
          minLength={10}
          maxLength={1000}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </Field>
      <MutationError error={mutation.error} />
      <Button busy={mutation.isPending}>{t('applicationForm.recordReview')}</Button>
    </form>
  )
}
function ApprovalForm({ application }: { application: Application }) {
  const { t } = useTranslation()
  const mutation = useDecision(application)
  const firstArea = application.profile?.teachingAreas.find(
    (a) => a.id === application.profile?.firstAreaId,
  )
  const [minClass, setMinClass] = useState(
    firstArea ? Math.max(6, firstArea.minClass) : application.scope.minClass,
  )
  const [maxClass, setMaxClass] = useState(
    firstArea ? Math.min(10, firstArea.maxClass) : application.scope.maxClass,
  )
  const [reason, setReason] = useState('')
  const auth = useAuth()
  const [mentorId, setMentorId] = useState(
    application.mentorId || (auth.data!.user.role === 'mentor' ? auth.data!.user.id : ''),
  )
  const members = useStaffPage<Schema['StaffMembers']>('/staff/members')
  if (
    application.profile &&
    (!firstArea ||
      firstArea.subject !== 'Mathematics' ||
      !firstArea.modes.includes('online') ||
      firstArea.minClass > 10 ||
      firstArea.maxClass < 6)
  )
    return <Alert>{t('applicationForm.scopeBoundary')}</Alert>
  if (application.eligibility && ['pending', 'blocked'].includes(application.eligibility.status))
    return <Alert>{t('applicationForm.eligibilityPending')}</Alert>
  return (
    <form
      className="form-stack"
      aria-label={t('staffOps.approve')}
      onSubmit={(event) => {
        event.preventDefault()
        mutation.mutate({ action: 'approve', minClass, maxClass, reason, mentorId })
      }}
    >
      {members.isError ? (
        <LoadError retry={() => void members.refetch()} />
      ) : (
        <Field label={t('staffOps.academicMentor')}>
          <select value={mentorId} onChange={(event) => setMentorId(event.target.value)} required>
            <option value="">{t('choose')}</option>
            {members.data?.pages
              .flatMap((page) => page.items)
              .filter((member) => member.role === 'mentor')
              .map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}
                </option>
              ))}
          </select>
        </Field>
      )}
      {members.hasNextPage && (
        <Button type="button" variant="text" onClick={() => void members.fetchNextPage()}>
          {t('staffOps.more')}
        </Button>
      )}
      <div className="staff-score-inputs">
        <Field label={t('minClass')}>
          <input
            type="number"
            min={6}
            max={10}
            value={minClass}
            onChange={(event) => setMinClass(Number(event.target.value))}
            required
          />
        </Field>
        <Field label={t('maxClass')}>
          <input
            type="number"
            min={minClass}
            max={10}
            value={maxClass}
            onChange={(event) => setMaxClass(Number(event.target.value))}
            required
          />
        </Field>
      </div>
      <Field label={t('staffOps.reason')} hint={t('staffOps.decisionReason')}>
        <textarea
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          required
          minLength={10}
          maxLength={1000}
        />
      </Field>
      <MutationError error={mutation.error} />
      <Button type="submit" busy={mutation.isPending}>
        <Check size={17} aria-hidden="true" />
        {t('staffOps.approve')}
      </Button>
    </form>
  )
}

function ActionDialog({
  application,
  action,
  label,
  description,
  danger = false,
}: {
  application: Application
  action: Decision['action']
  label: string
  description?: string
  danger?: boolean
}) {
  const { t } = useTranslation()
  return (
    <Modal
      title={t(`staffOps.${label}`)}
      description={description ? t(`staffOps.${description}`) : t('staffOps.decisionReason')}
      trigger={<Button variant={danger ? 'danger' : 'secondary'}>{t(`staffOps.${label}`)}</Button>}
    >
      <ReasonForm application={application} action={action} label={label} danger={danger} />
    </Modal>
  )
}

function ReasonForm({
  application,
  action,
  label,
  danger = false,
  hint,
}: {
  application: Application
  action: Decision['action']
  label: string
  danger?: boolean
  hint?: string
}) {
  const { t } = useTranslation()
  const mutation = useDecision(application)
  const [reason, setReason] = useState('')
  return (
    <form
      className="form-stack"
      aria-label={t(`staffOps.${label}`)}
      onSubmit={(event) => {
        event.preventDefault()
        mutation.mutate({ action, reason })
      }}
    >
      <Field
        label={t(action === 'note' ? 'staffOps.note' : 'staffOps.reason')}
        hint={hint ? t(`staffOps.${hint}`) : undefined}
      >
        <textarea
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          minLength={10}
          maxLength={1000}
          required
        />
      </Field>
      {action === 'terminate' && (
        <label className="staff-check">
          <input type="checkbox" required />
          <span>{t('staffOps.terminateConfirm', { name: application.name })}</span>
        </label>
      )}
      <MutationError error={mutation.error} />
      <Button type="submit" variant={danger ? 'danger' : 'primary'} busy={mutation.isPending}>
        {t(`staffOps.${label}`)}
      </Button>
    </form>
  )
}

function AssignmentForm({ application }: { application: Application }) {
  const { t } = useTranslation()
  const query = useStaffPage<Schema['StaffMembers']>('/staff/members')
  const mutation = useDecision(application)
  const [assessorId, setAssessorId] = useState(application.assessorId)
  const [reason, setReason] = useState('')
  if (query.isPending) return <Loading />
  if (query.isError) return <LoadError retry={() => void query.refetch()} />
  return (
    <form
      className="form-stack"
      aria-label={t('staffOps.assign')}
      onSubmit={(event) => {
        event.preventDefault()
        mutation.mutate({ action: 'assign', assessorId, reason })
      }}
    >
      <Field label={t('staffOps.reviewer')}>
        <select value={assessorId} onChange={(event) => setAssessorId(event.target.value)} required>
          <option value="">{t('choose')}</option>
          {query.data.pages
            .flatMap((p) => p.items)
            .filter((person) => person.id !== application.id)
            .map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
        </select>
      </Field>
      {query.hasNextPage && (
        <Button
          type="button"
          variant="text"
          busy={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
        >
          {t('staffOps.more')}
        </Button>
      )}
      <Field label={t('staffOps.reason')}>
        <textarea
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          minLength={10}
          maxLength={1000}
          required
        />
      </Field>
      <MutationError error={mutation.error} />
      <Button type="submit" busy={mutation.isPending}>
        {t('staffOps.assign')}
      </Button>
    </form>
  )
}

function History({ application, applicantName }: { application?: string; applicantName?: string }) {
  const { t, i18n } = useTranslation()
  const query = useStaffPage<Schema['StaffEvents']>(
    `/staff/events${application ? `?application=${encodeURIComponent(application)}` : ''}`,
  )
  if (query.isPending) return <Loading />
  if (query.isError) return <LoadError retry={() => void query.refetch()} />
  const events = query.data.pages.flatMap((page) => page.items)
  return (
    <div className="staff-history">
      {events.length ? (
        <ol>
          {events.map((event) => (
            <li key={event.id}>
              <span className="staff-history-dot" aria-hidden="true" />
              <div>
                <strong>
                  {t(`staffOps.actions.${event.action.replace('application.', '')}`, {
                    defaultValue: t(`auditAction.${event.action}`, { defaultValue: event.action }),
                  })}
                </strong>
                <p>
                  {event.actorName ||
                    (event.actor === application
                      ? applicantName
                      : t('staffOps.recordedByTeam'))}{' '}
                  · <time dateTime={event.at}>{indiaDate(event.at, i18n.language)}</time>
                </p>
                {event.reason && <blockquote>{event.reason}</blockquote>}
                {event.action === 'application.eligibility' && event.eligibility && (
                  <p>{t(`applicationForm.${event.eligibility.status}`)}</p>
                )}
                {event.evidence && event.action === 'application.assess' && (
                  <details>
                    <summary>{t('evidence')}</summary>
                    <p className="staff-prose">{event.evidence}</p>
                    <dl className="staff-facts">
                      {(t('scoreLabels', { returnObjects: true }) as string[]).map(
                        (label, index) => (
                          <div key={label}>
                            <dt>{label}</dt>
                            <dd>{event.scores?.[index]} / 5</dd>
                          </div>
                        ),
                      )}
                    </dl>
                  </details>
                )}
                {!application && event.action.startsWith('application.') && (
                  <Link to={applicationURL(event.target)}>
                    {t('staffOps.openApplication')}
                    <ArrowRight size={14} aria-hidden="true" />
                  </Link>
                )}
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <Empty title={t('staffOps.noHistory')} />
      )}
      {query.hasNextPage && (
        <Button
          variant="secondary"
          busy={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
        >
          {t('staffOps.more')}
        </Button>
      )}
    </div>
  )
}

function Followups() {
  const { t, i18n } = useTranslation()
  const [params, setParams] = useSearchParams()
  const resolved = params.get('status') === 'resolved_operator'
  const query = useStaffPage<Schema['TutorFollowups']>(
    `/staff/followups?status=${resolved ? 'resolved_operator' : 'pending_operator'}`,
  )
  return (
    <>
      <div className="staff-filters">
        <Field label={t('staffOps.status')}>
          <select
            value={resolved ? 'resolved_operator' : 'pending_operator'}
            onChange={(event) => {
              const next = new URLSearchParams(params)
              next.set('status', event.target.value)
              setParams(next)
            }}
          >
            <option value="pending_operator">{t('staffOps.pending')}</option>
            <option value="resolved_operator">{t('staffOps.resolved')}</option>
          </select>
        </Field>
      </div>
      {query.isPending ? (
        <Loading />
      ) : query.isError ? (
        <LoadError retry={() => void query.refetch()} />
      ) : query.data.pages.flatMap((p) => p.items).length ? (
        <div className="staff-followups">
          {query.data.pages
            .flatMap((p) => p.items)
            .map((item) => (
              <article className="staff-panel" key={`${item.id}:${item.version}`}>
                <div className="staff-section-title">
                  <h2>{item.tutorName || item.tutorId}</h2>
                  <Link to={applicationURL(item.tutorId)}>
                    {t('staffOps.openApplication')}
                    <ArrowRight size={15} aria-hidden="true" />
                  </Link>
                </div>
                <p className="staff-prose">{item.reason}</p>
                <time>{indiaDate(item.createdAt, i18n.language)}</time>
                <div className="staff-affected">
                  <span>{t('staffOps.affectedTrials', { count: item.trials })}</span>
                  <span>{t('staffOps.affectedTuition', { count: item.enrollments })}</span>
                </div>
                {resolved ? (
                  <p className="staff-prose">{item.resolution}</p>
                ) : (
                  <ResolveFollowup followup={item} />
                )}
              </article>
            ))}
        </div>
      ) : (
        <Empty title={t('staffOps.noFollowups')} />
      )}
      {query.hasNextPage && (
        <Button
          variant="secondary"
          busy={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
        >
          {t('staffOps.more')}
        </Button>
      )}
    </>
  )
}

function ResolveFollowup({ followup }: { followup: Schema['TutorFollowup'] }) {
  const { t } = useTranslation()
  const [reason, setReason] = useState('')
  const mutation = useMutation({
    mutationFn: () =>
      send(`/staff/followups/${encodeURIComponent(followup.id)}/resolve`, {
        reason,
        confirmed: true,
        version: followup.version,
      }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['staff'] }),
  })
  return (
    <details>
      <summary>{t('staffOps.resolve')}</summary>
      <form
        className="form-stack"
        onSubmit={(event) => {
          event.preventDefault()
          mutation.mutate()
        }}
      >
        <Field label={t('staffOps.resolution')} hint={t('staffOps.followupBody')}>
          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            required
            minLength={10}
            maxLength={1000}
          />
        </Field>
        <label className="staff-check">
          <input type="checkbox" required />
          <span>{t('staffOps.followupConfirm')}</span>
        </label>
        <MutationError error={mutation.error} />
        <Button type="submit" busy={mutation.isPending}>
          {t('staffOps.resolve')}
        </Button>
      </form>
    </details>
  )
}
