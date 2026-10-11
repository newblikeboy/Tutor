import '../locales/staff'
import '../styles/interview.css'
import { CalendarDays, ExternalLink, Video } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { api, indiaDate, send, queryClient, type Application, type Schema } from '../lib/api'
import { Alert, Badge, Button, Status } from './ui'
import { GoogleError } from './google-connection'
import { useAuth } from '../lib/session'
import { useMutation } from '@tanstack/react-query'

export function InterviewCard({ application }: { application: Application }) {
  const { t, i18n } = useTranslation()
  const auth = useAuth()
  const review = useMutation({
    mutationFn: () =>
      api<Schema['CalendarReview']>(`/staff/applications/${application.id}/meeting/calendar`),
  })
  const retry = useMutation({
    mutationFn: (calendarETag?: string) =>
      send(`/staff/applications/${application.id}/meeting/retry`, {
        version: application.version,
        calendarETag,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['staff'] }),
  })
  const meeting = application.interview
  if (!meeting) return null
  const google = meeting.provider === 'google'
  function downloadCalendar() {
    if (!meeting) return
    const stamp = (value: string) =>
      new Date(value)
        .toISOString()
        .replace(/[-:]/g, '')
        .replace(/\.\d{3}/, '')
    const escape = (value: string) =>
      value
        .replace(/\\/g, '\\\\')
        .replace(/\r?\n/g, '\\n')
        .replace(/,/g, '\\,')
        .replace(/;/g, '\\;')
    const content = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//GoCoaching//Interviews//EN',
      'BEGIN:VEVENT',
      `UID:interview-${application.id}@tutor-platform`,
      `DTSTAMP:${stamp(application.updatedAt)}`,
      `DTSTART:${stamp(meeting.start)}`,
      `DTEND:${stamp(meeting.end)}`,
      `SUMMARY:${escape(t('staffOps.interview'))}`,
      `DESCRIPTION:${escape(meeting.joinUrl)}`,
      'END:VEVENT',
      'END:VCALENDAR',
      '',
    ].join('\r\n')
    const url = URL.createObjectURL(new Blob([content], { type: 'text/calendar;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = 'tutor-interview.ics'
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  return (
    <section className="staff-interview" aria-label={t('staffOps.interview')}>
      <div className="staff-section-title">
        <h3>
          <Video size={20} aria-hidden="true" />
          {t('staffOps.interview')}
        </h3>
        {google && (meeting.syncStatus === 'pending' || meeting.syncStatus === 'failed') ? (
          <Badge tone="amber">
            {meeting.syncStatus === 'pending'
              ? 'Confirming with Google Calendar'
              : 'Google confirmation failed'}
          </Badge>
        ) : meeting.status === 'completed' ? (
          <Badge tone="teal">{t('staffOps.interviewCompleted')}</Badge>
        ) : (
          <Status status={meeting.status} />
        )}
      </div>
      <time dateTime={meeting.start}>{indiaDate(meeting.start, i18n.language)}</time>
      <p>
        {google ? 'Google Meet' : 'Historical meeting'} ·{' '}
        {meeting.mentorName && <>Mentor: {meeting.mentorName} · </>}
        {t('staffOps.minutes', {
          count: Math.round((Date.parse(meeting.end) - Date.parse(meeting.start)) / 60_000),
        })}
      </p>
      {meeting.rescheduledAt && (
        <p>Rescheduled {indiaDate(meeting.rescheduledAt, i18n.language)}</p>
      )}
      {meeting.notes && <p>{meeting.notes}</p>}
      {google && meeting.status === 'scheduled' && meeting.meetingCode && (
        <p>Meeting code: {meeting.meetingCode}</p>
      )}
      {google && meeting.syncStatus === 'pending' && (
        <p>The meeting is being confirmed. Your join link will appear when Google confirms it.</p>
      )}
      {google && meeting.syncStatus === 'failed' && (
        <Alert kind="error">
          {meeting.lastError === 'google_calendar_conflict'
            ? 'This event changed in Google Calendar. The mentor must review the change before retrying.'
            : meeting.lastError === 'google_calendar_busy'
              ? 'The connected calendar has another event at this time. Cancel this request and choose another time.'
              : meeting.lastError === 'google_event_missing'
                ? 'The event was removed from Google Calendar. Cancel this interview and schedule a new one.'
                : 'The meeting could not be confirmed. The mentor can reconnect Google or retry.'}
        </Alert>
      )}
      {google &&
        meeting.status === 'scheduled' &&
        meeting.joinUrl &&
        ((auth.data?.user.role === 'tutor' && auth.data.user.id === application.id) ||
          (auth.data?.user.role === 'mentor' && auth.data.user.id === application.assessorId)) &&
        meeting.syncStatus === 'ready' && (
          <div className="button-row">
            <a
              className="btn primary"
              href={`/api/v1/applications/${encodeURIComponent(application.id)}/interview/join`}
              target="_blank"
              rel="noopener noreferrer"
              referrerPolicy="no-referrer"
            >
              Join Meeting
              <ExternalLink size={15} aria-hidden="true" />
            </a>
            <Button variant="secondary" onClick={downloadCalendar}>
              <CalendarDays size={16} aria-hidden="true" />
              {t('staffOps.calendar')}
            </Button>
          </div>
        )}
      {google &&
        meeting.syncStatus === 'failed' &&
        auth.data?.user.role === 'mentor' &&
        application.assessorId === auth.data.user.id && (
          <>
            {meeting.lastError === 'google_calendar_conflict' ? (
              <Button variant="secondary" busy={review.isPending} onClick={() => review.mutate()}>
                Review Calendar changes
              </Button>
            ) : (
              <Button
                variant="secondary"
                busy={retry.isPending}
                onClick={() => retry.mutate(undefined)}
              >
                Retry Google confirmation
              </Button>
            )}
            {review.data && (
              <div className="calendar-review">
                <h4>Current Calendar event</h4>
                <p>
                  {review.data.start && indiaDate(review.data.start, 'en')} · {review.data.status}
                </p>
                <p>
                  {review.data.operation === 'delete'
                    ? 'Confirm to cancel this changed Calendar event.'
                    : 'Confirm to apply the GoCoaching interview time shown above to this changed Calendar event.'}
                </p>
                <Button busy={retry.isPending} onClick={() => retry.mutate(review.data?.etag)}>
                  Confirm reviewed change & retry
                </Button>
              </div>
            )}
          </>
        )}
      <GoogleError error={retry.error || review.error} />
    </section>
  )
}
