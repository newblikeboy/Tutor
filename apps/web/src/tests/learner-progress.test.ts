import { describe, expect, it } from 'vitest'
import {
  filterReport,
  latestTopics,
  packageBalance,
  progressSummary,
  reportDate,
  type ProgressReport,
  type ReportSession,
} from '../lib/learner-progress'

const session = (id: string, overrides: Partial<ReportSession> = {}): ReportSession => ({
  id,
  enrollmentId: 'package',
  tutorId: 'current',
  tutorName: 'Fictional tutor',
  subjects: ['Mathematics', 'Science'],
  start: '2026-10-08T05:00:00Z',
  end: '2026-10-08T06:00:00Z',
  bufferMinutes: 0,
  status: 'completed',
  timezone: 'Asia/Kolkata',
  notes: 'Fractions practice.',
  homework: 'Practise fractions.',
  review: '',
  attendance: 'present',
  reason: '',
  version: 1,
  proposal: null,
  ...overrides,
})
const progress = (subject: string, status: 'practising' | 'independent') => ({
  subject,
  topics: [
    {
      title: 'Fractions',
      status,
      evidence: 'Recorded observation.',
      practice: 'Use number lines.',
    },
  ],
  homeworkStatus: 'not_checked' as const,
  feedback: 'Works through examples.',
  nextSteps: 'Practise independently.',
  recordedAt: '2026-10-08T06:00:00Z',
})
const report = (sessions: ReportSession[]): ProgressReport => ({
  enrollments: [],
  sessions,
  trials: [],
  plans: [],
  handovers: [],
})
const filters = { from: '', to: '', subject: '', tutor: '' }

describe('learner progress evidence', () => {
  it('uses teaching dates in India at the UTC date boundary', () => {
    expect(reportDate('2026-10-07T20:00:00Z')).toBe('2026-10-08')
    expect(
      filterReport(report([session('night', { start: '2026-10-07T20:00:00Z' })]), {
        ...filters,
        from: '2026-10-08',
        to: '2026-10-08',
      }).sessions,
    ).toHaveLength(1)
  })
  it('does not infer academic or homework progress from class delivery', () => {
    const summary = progressSummary([
      session('done'),
      session('missed', { status: 'missed', attendance: 'absent' }),
      session('scheduled', { status: 'scheduled', attendance: '' }),
      session('disputed', { status: 'awaiting_review', attendance: 'disputed' }),
    ])
    expect(summary).toEqual({
      completed: 1,
      attendance: 50,
      present: 1,
      marked: 2,
      homeworkCompleted: 0,
      homeworkChecked: 0,
      tests: 0,
    })
    expect(progressSummary([]).attendance).toBeNull()
  })
  it('counts only recorded checked homework and retains zero test scores', () => {
    const summary = progressSummary([
      session('checked', {
        progress: {
          ...progress('Mathematics', 'practising'),
          homeworkStatus: 'completed',
          test: { title: 'Quiz', score: 0, maximum: 10 },
        },
      }),
      session('assigned', {
        progress: { ...progress('Mathematics', 'practising'), homeworkStatus: 'assigned' },
      }),
    ])
    expect(summary.homeworkChecked).toBe(1)
    expect(summary.tests).toBe(1)
  })
  it('uses the latest observation per subject and topic across tutors', () => {
    const topics = latestTopics([
      session('old', {
        tutorId: 'old',
        start: '2026-09-01T05:00:00Z',
        progress: progress('Mathematics', 'practising'),
      }),
      session('new', { progress: progress('Mathematics', 'independent') }),
      session('science', { progress: progress('Science', 'practising') }),
    ])
    expect(topics).toHaveLength(2)
    expect(topics.find((topic) => topic.subject === 'Mathematics')?.topic.status).toBe(
      'independent',
    )
  })
  it('filters individual subject evidence without attributing a multi-subject lesson twice', () => {
    const d = report([
      session('specific', { progress: progress('Mathematics', 'independent') }),
      session('legacy'),
    ])
    expect(filterReport(d, { ...filters, subject: 'Science' }).sessions.map((s) => s.id)).toEqual([
      'legacy',
    ])
    expect(filterReport(d, { ...filters, tutor: 'old' }).sessions).toHaveLength(0)
  })
  it('keeps package balance independent of a calendar month report filter', () => {
    const d = report([
      session('september', { start: '2026-09-01T05:00:00Z' }),
      session('october'),
      session('makeup', { status: 'makeup_due', attendance: '' }),
      session('missed', { status: 'missed', attendance: 'absent' }),
    ])
    expect(filterReport(d, { ...filters, from: '2026-10-01' }).sessions).toHaveLength(3)
    expect(packageBalance(d, 'package')).toEqual({ completed: 2, remaining: 1 })
  })
})
