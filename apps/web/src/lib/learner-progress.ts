import type { Schema } from './api'

export type ProgressReport = Schema['LearnerProgress']
export type ReportSession = Schema['ProgressSession']
export type ReportFilters = { from: string; to: string; subject: string; tutor: string }
export const reportDate = (value: string) =>
  new Date(value).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })

export function inReportRange(date: string, filters: ReportFilters) {
  const day = reportDate(date)
  return (!filters.from || day >= filters.from) && (!filters.to || day <= filters.to)
}

export function filterReport(report: ProgressReport, filters: ReportFilters) {
  const sessions = report.sessions
    .filter(
      (session) =>
        inReportRange(session.start, filters) &&
        (!filters.tutor || session.tutorId === filters.tutor) &&
        (!filters.subject ||
          (session.progress
            ? session.progress.subject === filters.subject
            : session.subjects.includes(filters.subject)) ||
          (filters.subject === 'All Subjects' && session.subjects.includes('All Subjects'))),
    )
    .sort((a, b) => b.start.localeCompare(a.start))
  const trials = report.trials
    .filter(
      (trial) =>
        inReportRange(trial.start, filters) &&
        (!filters.tutor || trial.tutorId === filters.tutor) &&
        (!filters.subject || (trial.subjects ?? [trial.subject]).includes(filters.subject)),
    )
    .sort((a, b) => b.start.localeCompare(a.start))
  const plans = report.plans
    .filter((plan) => {
      const enrollment = report.enrollments.find((e) => e.id === plan.enrollmentId)
      return (
        inReportRange(plan.createdAt, filters) &&
        (!filters.subject || plan.subjects.includes(filters.subject)) &&
        (!filters.tutor ||
          report.sessions.some(
            (s) => s.enrollmentId === plan.enrollmentId && s.tutorId === filters.tutor,
          ) ||
          enrollment?.tutorId === filters.tutor)
      )
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  return { sessions, trials, plans }
}

export function progressSummary(sessions: ReportSession[]) {
  const completed = sessions.filter((s) => ['completed', 'reviewed'].includes(s.status))
  const marked = sessions.filter((s) => ['present', 'absent'].includes(s.attendance))
  const present = marked.filter((s) => s.attendance === 'present').length
  const checkedHomework = completed.filter((s) =>
    ['completed', 'needs_help'].includes(s.progress?.homeworkStatus ?? ''),
  )
  return {
    completed: completed.length,
    attendance: marked.length ? Math.round((present * 100) / marked.length) : null,
    present,
    marked: marked.length,
    homeworkCompleted: checkedHomework.filter((s) => s.progress?.homeworkStatus === 'completed')
      .length,
    homeworkChecked: checkedHomework.length,
    tests: completed.filter((s) => s.progress?.test).length,
  }
}

export function latestTopics(sessions: ReportSession[]) {
  const latest = new Map<
    string,
    { topic: Schema['LearningTopic']; session: ReportSession; subject: string }
  >()
  for (const session of [...sessions].sort((a, b) => b.start.localeCompare(a.start))) {
    if (!['completed', 'reviewed'].includes(session.status) || !session.progress) continue
    for (const topic of session.progress.topics) {
      const key = `${session.progress.subject}:${topic.title.trim().toLowerCase()}`
      if (!latest.has(key)) latest.set(key, { topic, session, subject: session.progress.subject })
    }
  }
  return [...latest.values()]
}

export function packageBalance(report: ProgressReport, id: string) {
  const sessions = report.sessions.filter((s) => s.enrollmentId === id)
  return {
    completed: sessions.filter((s) => ['completed', 'reviewed'].includes(s.status)).length,
    remaining: sessions.filter((s) =>
      ['scheduled', 'makeup_due', 'awaiting_review'].includes(s.status),
    ).length,
  }
}
