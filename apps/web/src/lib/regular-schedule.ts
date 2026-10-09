import type { Schema } from './api'

type TeachingHours = Pick<Schema['Availability'], 'windows' | 'leaveDates'>

export function regularWeekdays(hours: TeachingHours, minute: number, minutes: number) {
  return [
    ...new Set(
      hours.windows
        .filter((window) => minute >= window.startMinute && minute + minutes <= window.endMinute)
        .map((window) => window.day),
    ),
  ].sort((a, b) => a - b)
}

// Use UTC only to calculate calendar dates, independently of the browser timezone.
// These wall-clock values become Asia/Kolkata class times in the returned schedule.
export function regularPackageSchedule(
  hours: TeachingHours,
  plan: Schema['FeePlan'],
  date: string,
  minute: number,
  now: Date,
) {
  const weekdays = regularWeekdays(hours, minute, plan.minutes)
  const first = new Date(`${date}T00:00:00Z`)
  if (!weekdays.includes(first.getUTCDay())) return []
  const horizon = new Date(now.getTime() + 330 * 60 * 1000)
  horizon.setUTCMonth(horizon.getUTCMonth() + 6)
  const time = `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`
  const starts: string[] = []
  for (let offset = 0; offset < 180 && starts.length < plan.classes; offset++) {
    const day = new Date(first)
    day.setUTCDate(day.getUTCDate() + offset)
    if (!weekdays.includes(day.getUTCDay())) continue
    const localDate = day.toISOString().slice(0, 10)
    if (hours.leaveDates.includes(localDate)) continue
    day.setUTCHours(Math.floor(minute / 60), minute % 60)
    if (day > horizon) return []
    starts.push(`${localDate}T${time}:00+05:30`)
  }
  return starts.length === plan.classes ? starts : []
}
