import { describe, expect, it } from 'vitest'
import type { Schema } from '../lib/api'
import { regularPackageSchedule } from '../lib/regular-schedule'
const now = new Date('2030-01-01T00:00:00+05:30')
const plan = (period: Schema['FeePlan']['period'], classes: number): Schema['FeePlan'] => ({
  mode: 'home',
  period,
  classes,
  minutes: 60,
  amountPaise: 200000,
})
const hours = (days: number[], leaveDates: string[] = []) => ({
  windows: days.map((day) => ({ day, startMinute: 600, endMinute: 720 })),
  leaveDates,
})
describe('class-count packages', () => {
  it('schedules all six weekly classes across calendar weeks and months', () => {
    const schedule = regularPackageSchedule(hours([1]), plan('week', 6), '2030-01-07', 600, now)
    expect(schedule).toHaveLength(6)
    expect(schedule[0]).toBe('2030-01-07T10:00:00+05:30')
    expect(schedule.at(-1)).toBe('2030-02-11T10:00:00+05:30')
  })
  it('schedules all 24 monthly classes without a calendar-month deadline', () => {
    const schedule = regularPackageSchedule(hours([1]), plan('month', 24), '2030-01-07', 600, now)
    expect(schedule).toHaveLength(24)
    expect(schedule.at(-1)).toBe('2030-06-17T10:00:00+05:30')
  })
  it('skips planned leave and preserves every included class', () => {
    const schedule = regularPackageSchedule(
      hours([1], ['2030-01-14']),
      plan('week', 6),
      '2030-01-07',
      600,
      now,
    )
    expect(schedule).toHaveLength(6)
    expect(schedule[1]).toBe('2030-01-21T10:00:00+05:30')
    expect(schedule.at(-1)).toBe('2030-02-18T10:00:00+05:30')
    expect(regularPackageSchedule(hours([1]), plan('week', 6), '2030-01-07', 690, now)).toEqual([])
  })
  it('retains the booking horizon and Online hourly class', () => {
    expect(regularPackageSchedule(hours([1]), plan('month', 24), '2030-02-04', 600, now)).toEqual(
      [],
    )
    expect(regularPackageSchedule(hours([3]), plan('hour', 1), '2030-01-09', 600, now)).toEqual([
      '2030-01-09T10:00:00+05:30',
    ])
  })
})
