import { SubjectName, SubjectNames } from './subject-name'
import '../locales/progress'
import { useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { BookOpen, ClipboardCheck, GraduationCap, Sprout } from 'lucide-react'
import { api, APIError, indiaDate, type Learner, type Schema } from '../lib/api'
import {
  filterReport,
  latestTopics,
  packageBalance,
  progressSummary,
  reportDate,
  type ProgressReport,
  type ReportSession,
} from '../lib/learner-progress'
import { Alert, Badge, Button, Empty, Field, Loading, LoadError } from './ui'
import { TabBar, TabPanel } from './workspace-tabs'
import '../styles/learner-progress.css'

const tabs = ['overview', 'subjects', 'history', 'feedback'] as const
type Tab = (typeof tabs)[number]
export default function LearnerProgressReport({
  learner,
  tutor = false,
}: {
  learner: Learner
  tutor?: boolean
}) {
  const { t } = useTranslation()
  const [params, setParams] = useSearchParams()
  const q = useQuery({
    queryKey: ['learner-progress', tutor ? 'tutor' : 'parent', learner.id],
    queryFn: ({ signal }) =>
      api<ProgressReport>(
        `${tutor ? '/tutor' : ''}/learners/${encodeURIComponent(learner.id)}/progress`,
        { signal },
      ),
    refetchInterval: 20000,
  })
  const set = (values: Record<string, string>) => {
    const next = new URLSearchParams(params)
    for (const [key, value] of Object.entries(values)) {
      if (value) next.set(key, value)
      else next.delete(key)
    }
    setParams(next)
  }
  const visibleTabs = tutor
    ? tabs
    : tabs.filter((value) => value === 'overview' || value === 'history')
  const tab: Tab = visibleTabs.find((value) => value === params.get('reportTab')) ?? 'overview'
  const range = ['month', 'custom'].includes(params.get('range') ?? '')
    ? params.get('range')!
    : 'all'
  const today = reportDate(new Date().toISOString())
  const filters = {
    from:
      range === 'month'
        ? `${today.slice(0, 7)}-01`
        : range === 'custom'
          ? (params.get('from') ?? '')
          : '',
    to: range === 'month' ? today : range === 'custom' ? (params.get('to') ?? '') : '',
    subject: params.get('subject') ?? '',
    tutor: params.get('tutor') ?? '',
  }
  if (q.isPending) return <Loading />
  if (q.isError)
    return q.error instanceof APIError && [403, 404].includes(q.error.status) ? (
      <Alert kind="error">{t('permission')}</Alert>
    ) : (
      <LoadError retry={() => void q.refetch()} />
    )
  const d = q.data
  const subjectOptions = [
    ...new Set([
      ...d.enrollments.flatMap((e) => e.agreement.subjects ?? [e.agreement.subject]),
      ...d.sessions.flatMap((s) => (s.progress ? [s.progress.subject] : s.subjects)),
      ...d.trials.flatMap((trial) => trial.subjects ?? [trial.subject]),
    ]),
  ].sort()
  const tutors = new Map(d.enrollments.map((e) => [e.tutorId, e.tutorName]))
  for (const item of [...d.sessions, ...d.trials]) tutors.set(item.tutorId, item.tutorName)
  const valid = !filters.from || !filters.to || filters.from <= filters.to
  const { sessions, plans } = filterReport(d, filters)
  // A scheduled date passing does not create a recorded class outcome.
  const historySessions = sessions.filter((s) =>
    [
      'completed',
      'reviewed',
      'missed',
      'cancelled',
      'cancelled_consumed',
      'awaiting_review',
    ].includes(s.status),
  )
  const summary = progressSummary(sessions)
  const evidence = sessions.filter(
    (s) => ['completed', 'reviewed'].includes(s.status) && (s.progress || s.notes),
  )
  const latest = evidence[0]
  const topics = latestTopics(sessions)
  const activePackages = d.enrollments.filter(
    (e) =>
      ['active', 'paused'].includes(e.status) &&
      (!filters.tutor ||
        e.tutorId === filters.tutor ||
        d.sessions.some((s) => s.enrollmentId === e.id && s.tutorId === filters.tutor)) &&
      (!filters.subject ||
        (e.agreement.subjects ?? [e.agreement.subject]).includes(filters.subject) ||
        (learner.class <= 5 && e.agreement.subject === 'All Subjects')),
  )
  const feedback = latest?.progress?.feedback || latest?.notes
  const practice = latest?.progress?.nextSteps || latest?.homework || plans[0]?.nextSteps
  return (
    <div className={`child-report${tutor ? '' : ' child-report-parent'}`}>
      {tutor ? (
        <header className="child-report-heading">
          <div>
            <span className="eyebrow">Student progress report</span>
            <h2>{learner.name}</h2>
            <p>Progress recorded in your current teaching assignments.</p>
          </div>
        </header>
      ) : (
        <h2 className="sr-only">{learner.name}</h2>
      )}
      <div className="child-report-filters">
        <Field label={t('childProgress.range')}>
          <select
            value={range}
            onChange={(e) => set({ range: e.target.value === 'all' ? '' : e.target.value })}
          >
            <option value="all">{t('childProgress.allTime')}</option>
            <option value="month">{t('childProgress.month')}</option>
            <option value="custom">{t('childProgress.custom')}</option>
          </select>
        </Field>
        <Field label={t('childProgress.subject')}>
          <select value={filters.subject} onChange={(e) => set({ subject: e.target.value })}>
            <option value="">{t('childProgress.allSubjects')}</option>
            {subjectOptions.map((subject) => (
              <option key={subject} value={subject}>
                <SubjectName value={subject} />
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('childProgress.tutor')}>
          <select value={filters.tutor} onChange={(e) => set({ tutor: e.target.value })}>
            <option value="">{t('childProgress.allTutors')}</option>
            {[...tutors].map(([id, name]) => (
              <option key={id} value={id}>
                {name || t('childProgress.nameUnavailable')}
              </option>
            ))}
          </select>
        </Field>
        <Button
          variant="text"
          onClick={() => set({ range: '', from: '', to: '', subject: '', tutor: '' })}
        >
          {t('childProgress.reset')}
        </Button>
        {range === 'custom' && (
          <>
            <Field label={t('childProgress.from')}>
              <input
                type="date"
                value={filters.from}
                onChange={(e) => set({ from: e.target.value })}
              />
            </Field>
            <Field label={t('childProgress.to')}>
              <input
                type="date"
                value={filters.to}
                min={filters.from || undefined}
                onChange={(e) => set({ to: e.target.value })}
              />
            </Field>
          </>
        )}
      </div>
      {!valid ? (
        <Alert kind="error">{t('childProgress.invalidRange')}</Alert>
      ) : (
        <>
          <TabBar
            id="child-report"
            scrollable
            label={tutor ? 'Student progress report' : t('childProgress.title')}
            value={tab}
            options={visibleTabs.map((value) => ({ value, label: t(`childProgress.${value}`) }))}
            onChange={(value) => set({ reportTab: value === 'overview' ? '' : value })}
          />
          <TabPanel id="child-report" value="overview" active={tab === 'overview'}>
            <div className="child-report-summary">
              {[
                { icon: BookOpen, label: 'completed', value: summary.completed, body: '' },
                {
                  icon: GraduationCap,
                  label: 'attendance',
                  value: summary.attendance === null ? '—' : `${summary.attendance}%`,
                  body:
                    summary.attendance === null
                      ? t('childProgress.unchecked')
                      : t('childProgress.attended', {
                          present: summary.present,
                          count: summary.marked,
                        }),
                },
                {
                  icon: ClipboardCheck,
                  label: 'homework',
                  value: summary.homeworkChecked
                    ? `${summary.homeworkCompleted}/${summary.homeworkChecked}`
                    : '—',
                  body: summary.homeworkChecked
                    ? t('childProgress.homeworkCount', {
                        completed: summary.homeworkCompleted,
                        count: summary.homeworkChecked,
                      })
                    : t('childProgress.noHomework'),
                },
                { icon: Sprout, label: 'tests', value: summary.tests, body: '' },
              ].map(({ icon: Icon, label, value, body }) => (
                <div key={label}>
                  <Icon size={20} aria-hidden="true" />
                  <span>{t(`childProgress.${label}`)}</span>
                  <strong>{value}</strong>
                  {body && <small>{body}</small>}
                </div>
              ))}
            </div>
            <div className="child-report-columns">
              <section className="child-report-panel child-report-focus">
                <div className="child-report-remarks">
                  <h3>{t('childProgress.latestFeedback')}</h3>
                  <p>{feedback || t('childProgress.noRemarks')}</p>
                  {latest && (
                    <small>
                      {latest.tutorName || t('childProgress.nameUnavailable')} ·{' '}
                      {indiaDate(latest.start, 'en')}
                    </small>
                  )}
                </div>
                <div className="child-report-homework">
                  <h3>{t('childProgress.homeWork')}</h3>
                  <p>{practice || t('childProgress.noHomeGiven')}</p>
                </div>
              </section>
              <section className="child-report-panel">
                <div className="child-report-section-title">
                  <h3>{t('childProgress.packages')}</h3>
                </div>
                {activePackages.length ? (
                  activePackages.map((e) => {
                    const balance = packageBalance(d, e.id)
                    return (
                      <div className="child-report-package" key={e.id}>
                        {e.paymentSimulated && <Badge tone="amber">Test booking</Badge>}
                        <strong>
                          <SubjectNames values={e.agreement.subjects ?? [e.agreement.subject]} />
                        </strong>
                        <span>{e.tutorName || t('childProgress.nameUnavailable')}</span>
                        <progress
                          value={balance.completed}
                          max={e.agreement.sessionCount}
                          aria-label={t('childProgress.delivered', {
                            completed: balance.completed,
                            total: e.agreement.sessionCount,
                          })}
                        />
                        <p>
                          {t('childProgress.delivered', {
                            completed: balance.completed,
                            total: e.agreement.sessionCount,
                          })}
                        </p>
                        <small>{t('childProgress.remaining', { count: balance.remaining })}</small>
                        <Link className="text-link" to={`/tuition/${e.id}`}>
                          {t('childProgress.viewDetails')}
                        </Link>
                      </div>
                    )
                  })
                ) : (
                  <p>{t('childProgress.noPackages')}</p>
                )}
              </section>
            </div>
            <LearningJourney report={d} sessions={sessions} plans={plans} filters={filters} />
          </TabPanel>
          {tutor && (
            <TabPanel id="child-report" value="subjects" active={tab === 'subjects'}>
              <div className="child-report-stack">
                {(filters.subject ? [filters.subject] : subjectOptions).map((subject) => {
                  const subjectTopics = topics.filter(
                    (topic) =>
                      topic.subject === subject ||
                      (subject === 'All Subjects' &&
                        topic.session.subjects.includes('All Subjects')),
                  )
                  const subjectSessions = sessions.filter(
                    (s) =>
                      s.progress?.subject === subject ||
                      (subject === 'All Subjects' && s.subjects.includes(subject)),
                  )
                  return (
                    <section className="child-report-panel" key={subject}>
                      <h3>
                        <SubjectName value={subject} />
                      </h3>
                      {subjectTopics.length ? (
                        <div className="child-report-topics">
                          {subjectTopics.map(({ topic, session }) => (
                            <Topic
                              key={`${session.id}:${topic.title}`}
                              topic={topic}
                              author={session.tutorName}
                              date={session.start}
                            />
                          ))}
                        </div>
                      ) : (
                        <p>{t('childProgress.noTopics')}</p>
                      )}
                      <TestResults sessions={subjectSessions} />
                    </section>
                  )
                })}
                {!subjectOptions.length && (
                  <Empty
                    title={t('childProgress.noTopics')}
                    body={t('childProgress.noTopicsBody')}
                  />
                )}
                {plans.map((plan) => (
                  <Plan key={plan.id} plan={plan} />
                ))}
              </div>
            </TabPanel>
          )}
          <TabPanel id="child-report" value="history" active={tab === 'history'}>
            <div className="child-report-stack">
              {historySessions.length ? (
                historySessions.map((s) => <Lesson key={s.id} session={s} />)
              ) : (
                <Empty
                  title={t('childProgress.noClasses')}
                  body={t('childProgress.noClassesBody')}
                />
              )}
            </div>
          </TabPanel>
          {tutor && (
            <TabPanel id="child-report" value="feedback" active={tab === 'feedback'}>
              <div className="child-report-stack">
                {evidence.map((s) => (
                  <Lesson key={s.id} session={s} expanded />
                ))}
                {!evidence.length && (
                  <Empty
                    title={t('childProgress.noFeedback')}
                    body={t('childProgress.noRecordBody')}
                  />
                )}
              </div>
            </TabPanel>
          )}
        </>
      )}
    </div>
  )
}

function Topic({
  topic,
  author,
  date,
}: {
  topic: Schema['LearningTopic']
  author: string
  date: string
}) {
  const { t } = useTranslation()
  return (
    <article className="child-report-topic">
      <div>
        <h4>{topic.title}</h4>
        <Badge
          tone={
            topic.status === 'needs_review'
              ? 'amber'
              : topic.status === 'independent'
                ? 'teal'
                : 'neutral'
          }
        >
          {t(`childProgress.${topic.status}`)}
        </Badge>
      </div>
      <p>{topic.evidence}</p>
      <p>
        <strong>{t('childProgress.practice')}: </strong>
        {topic.practice}
      </p>
      <small>
        {author || t('childProgress.authorUnavailable')} · {indiaDate(date, 'en')}
      </small>
    </article>
  )
}

function Lesson({ session: s, expanded = false }: { session: ReportSession; expanded?: boolean }) {
  const { t } = useTranslation()
  const body = (
    <div className="child-report-lesson-body">
      <h4>{t('childProgress.notes')}</h4>
      <p>{s.notes || t('childProgress.noFeedback')}</p>
      {s.review && (
        <>
          <h4>{t('childProgress.historicalReview')}</h4>
          <p>{s.review}</p>
        </>
      )}
      {!s.progress && s.subjects.length > 1 && <p>{t('childProgress.sharedBody')}</p>}
      <h4>{t('childProgress.assignedHomework')}</h4>
      <p>{s.homework || t('childProgress.noPractice')}</p>
      {s.attendance && (
        <p>
          {t('childProgress.attendanceLabel')}: {t(`childProgress.${s.attendance}`)}
        </p>
      )}
      <p>
        {t('childProgress.status')}:{' '}
        {t(
          `childProgress.${s.progress?.homeworkStatus === 'completed' ? 'homeworkComplete' : (s.progress?.homeworkStatus ?? 'not_checked')}`,
        )}
      </p>
      {s.progress && (
        <>
          <h4>{t('childProgress.feedback')}</h4>
          <p>{s.progress.feedback}</p>
          <h4>{t('childProgress.nextSteps')}</h4>
          <p>{s.progress.nextSteps}</p>
          <div className="child-report-topics">
            {s.progress.topics.map((topic) => (
              <Topic key={topic.title} topic={topic} author={s.tutorName} date={s.start} />
            ))}
          </div>
          <TestResults sessions={[s]} />
          <small>
            {t('childProgress.updated', { date: indiaDate(s.progress.recordedAt, 'en') })}
          </small>
        </>
      )}
    </div>
  )
  return (
    <article className="child-report-panel child-report-lesson">
      <div className="child-report-section-title">
        <div>
          <h3>
            <SubjectNames values={s.progress ? [s.progress.subject] : s.subjects} />
          </h3>
          <small>
            {indiaDate(s.start, 'en')} · {s.tutorName || t('childProgress.nameUnavailable')}
          </small>
        </div>
        <Badge tone={s.status === 'missed' ? 'amber' : 'neutral'}>
          {t(`childProgress.${s.status === 'completed' ? 'homeworkComplete' : s.status}`)}
        </Badge>
      </div>
      {expanded ? (
        body
      ) : (
        <details>
          <summary>{t('childProgress.lessonDetails')}</summary>
          {body}
        </details>
      )}
    </article>
  )
}

function TestResults({ sessions }: { sessions: ReportSession[] }) {
  const { t } = useTranslation()
  const tests = [...sessions]
    .filter((s) => s.progress?.test)
    .sort((a, b) => a.start.localeCompare(b.start))
  return (
    <section className="child-report-tests">
      <h4>{t('childProgress.testResults')}</h4>
      {tests.length ? (
        <>
          {tests.length > 1 && (
            <figure>
              <svg viewBox="0 0 600 160" role="img" aria-label={t('childProgress.testTrend')}>
                <line x1="30" y1="135" x2="570" y2="135" stroke="currentColor" opacity="0.3" />
                <polyline
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  points={tests
                    .map(
                      (s, index) =>
                        `${30 + (index * 540) / (tests.length - 1)},${135 - (110 * s.progress!.test!.score) / s.progress!.test!.maximum}`,
                    )
                    .join(' ')}
                />
                {tests.map((s, index) => (
                  <circle
                    key={s.id}
                    cx={30 + (index * 540) / (tests.length - 1)}
                    cy={135 - (110 * s.progress!.test!.score) / s.progress!.test!.maximum}
                    r="5"
                    fill="currentColor"
                  >
                    <title>
                      {s.progress!.test!.title}: {s.progress!.test!.score}/
                      {s.progress!.test!.maximum}
                    </title>
                  </circle>
                ))}
              </svg>
              <figcaption>{t('childProgress.testTrendBody')}</figcaption>
            </figure>
          )}
          <ol>
            {tests.map((s) => (
              <li key={s.id}>
                <div>
                  <strong>{s.progress!.test!.title}</strong>
                  <small>
                    {indiaDate(s.start, 'en')} · {s.tutorName || t('childProgress.nameUnavailable')}
                  </small>
                </div>
                <span>
                  {s.progress!.test!.score}/{s.progress!.test!.maximum}{' '}
                  <small>
                    ({Math.round((s.progress!.test!.score * 100) / s.progress!.test!.maximum)}%)
                  </small>
                </span>
              </li>
            ))}
          </ol>
        </>
      ) : (
        <p>{t('childProgress.noTests')}</p>
      )}
    </section>
  )
}

function Plan({ plan }: { plan: Schema['ProgressPlan'] }) {
  const { t } = useTranslation()
  return (
    <section className="child-report-panel">
      <Badge tone="neutral">
        {t('childProgress.plan')} · {plan.version}
      </Badge>
      <h3>
        <SubjectNames values={plan.subjects} />
      </h3>
      {plan.subjects.length > 1 && <p>{t('childProgress.sharedBody')}</p>}
      <small>
        {plan.authorName || t('childProgress.authorUnavailable')} ·{' '}
        {indiaDate(plan.createdAt, 'en')}
      </small>
      <h4>{t('childProgress.startingPoint')}</h4>
      <p>{plan.startingPoint}</p>
      <h4>{t('childProgress.goals')}</h4>
      <p>{plan.goals}</p>
      <div className="child-report-topics">
        {plan.topics.map((topic) => (
          <Topic key={topic.title} topic={topic} author={plan.authorName} date={plan.createdAt} />
        ))}
      </div>
      <h4>{t('childProgress.nextSteps')}</h4>
      <p>{plan.nextSteps}</p>
      <small>
        {t('childProgress.reviewDate')}: {indiaDate(plan.reviewDate, 'en')}
      </small>
    </section>
  )
}

function LearningJourney({
  report,
  sessions,
  plans,
  filters,
}: {
  report: ProgressReport
  sessions: ReportSession[]
  plans: Schema['ProgressPlan'][]
  filters: { from: string; to: string; subject: string; tutor: string }
}) {
  const { t } = useTranslation()
  const entries = [
    ...sessions
      .filter((s) => ['completed', 'reviewed'].includes(s.status) && (s.progress || s.notes))
      .map((s) => ({
        id: s.id,
        date: s.start,
        type: 'learningUpdate',
        title: s.progress?.subject ?? s.subjects.join(', '),
        body: s.progress?.feedback ?? s.notes,
      })),
    ...plans.map((plan) => ({
      id: plan.id,
      date: plan.createdAt,
      type: 'plan',
      title: plan.subjects.join(', '),
      body: plan.nextSteps,
    })),
    ...report.handovers
      .filter((h) => {
        const enrollment = report.enrollments.find((e) => e.id === h.enrollmentId)
        const date = reportDate(h.createdAt)
        return (
          (!filters.from || date >= filters.from) &&
          (!filters.to || date <= filters.to) &&
          (!filters.tutor || [h.oldTutorId, h.newTutorId].includes(filters.tutor)) &&
          (!filters.subject ||
            (enrollment?.agreement.subjects ?? [enrollment?.agreement.subject]).includes(
              filters.subject,
            ))
        )
      })
      .map((h) => ({
        id: h.id,
        date: h.createdAt,
        type: 'handover',
        title: t('childProgress.handover'),
        body: h.nextSteps,
      })),
  ].sort((a, b) => b.date.localeCompare(a.date))
  const item = (entry: (typeof entries)[number]) => (
    <li key={entry.id}>
      <small>
        {indiaDate(entry.date, 'en')} / {t(`childProgress.${entry.type}`)}
      </small>
      <h4>{entry.title}</h4>
      <p>{entry.body}</p>
    </li>
  )
  return (
    <section className="child-report-panel">
      <h3>{t('childProgress.journey')}</h3>
      {entries.length ? (
        <>
          <ol className="child-report-timeline">{entries.slice(0, 6).map(item)}</ol>
          {entries.length > 6 && (
            <details className="child-report-older">
              <summary>{t('childProgress.olderHistory', { count: entries.length - 6 })}</summary>
              <ol className="child-report-timeline" start={7}>
                {entries.slice(6).map(item)}
              </ol>
            </details>
          )}
        </>
      ) : (
        <p>{t('childProgress.noRecordBody')}</p>
      )}
    </section>
  )
}
