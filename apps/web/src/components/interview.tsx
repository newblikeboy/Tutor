import { CalendarDays, ExternalLink, Video } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { indiaDate, send, queryClient, type Application } from '../lib/api'
import { Badge, Button, Status, MutationError } from './ui'
import { useAuth } from '../lib/session'
import { useMutation } from '@tanstack/react-query'

export function InterviewCard({ application }: { application: Application }) {
  const { t, i18n } = useTranslation()
  const auth = useAuth()
  const retry = useMutation({
    mutationFn: () =>
      send(`/staff/applications/${application.id}/meeting/retry`, { version: application.version }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['staff'] }),
  })
  const meeting = application.interview
  if (!meeting) return null
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
      'PRODID:-//TheGyanSetu//Interviews//EN',
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
        {meeting.syncStatus === 'pending' || meeting.syncStatus === 'failed' ? (
          <Badge tone="amber">
            {t(meeting.syncStatus === 'pending' ? 'staffOps.zoomPending' : 'staffOps.zoomFailed')}
          </Badge>
        ) : meeting.status === 'completed' ? (
          <Badge tone="teal">{t('staffOps.interviewCompleted')}</Badge>
        ) : (
          <Status status={meeting.status} />
        )}
      </div>
      <time dateTime={meeting.start}>{indiaDate(meeting.start, i18n.language)}</time>
      <p>
        {t('staffOps.minutes', {
          count: Math.round((Date.parse(meeting.end) - Date.parse(meeting.start)) / 60_000),
        })}
      </p>
      {meeting.status === 'scheduled' &&
        meeting.joinUrl &&
        (!meeting.provider || meeting.syncStatus === 'ready') && (
          <div className="button-row">
            <a
              className="btn primary"
              href={meeting.joinUrl}
              target="_blank"
              rel="noopener noreferrer"
              referrerPolicy="no-referrer"
            >
              {t('staffOps.join')}
              <ExternalLink size={15} aria-hidden="true" />
            </a>
            <Button variant="secondary" onClick={downloadCalendar}>
              <CalendarDays size={16} aria-hidden="true" />
              {t('staffOps.calendar')}
            </Button>
          </div>
        )}
      {meeting.syncStatus === 'failed' &&
        ['admin', 'mentor'].includes(auth.data?.user.role ?? '') && (
          <Button variant="secondary" busy={retry.isPending} onClick={() => retry.mutate()}>
            {t('staffOps.retryZoom')}
          </Button>
        )}
      <MutationError error={retry.error} />
    </section>
  )
}
