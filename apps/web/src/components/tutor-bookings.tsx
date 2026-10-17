import { SubjectNames } from './subject-name'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ArrowRight, MapPin } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { api, indiaDate, type Schema } from '../lib/api'
import { useClock } from '../lib/clock'
import { Badge, Loading, LoadError } from './ui'
import { WorkspaceRecordTable } from './workspace-record-table'
import { TutorDistance, tutorDistanceNote } from './tutor-distance'

export function TutorBookingsTable({
  bookings,
  archive,
  cursor,
}: {
  bookings: Schema['Enrollment'][]
  archive: boolean
  cursor: string
}) {
  const now = useClock()
  const { t } = useTranslation()
  const q = useQuery({
    queryKey: ['tutor-workspace'],
    queryFn: ({ signal }) => api<Schema['TutorWorkspace']>('/tutor/workspace', { signal }),
    enabled: !archive,
    refetchInterval: 15000,
  })
  if (!archive && q.isPending) return <Loading />
  if (!archive && q.isError) return <LoadError retry={() => void q.refetch()} />
  return (
    <WorkspaceRecordTable
      label={archive ? 'Past regular class bookings' : 'Current regular class bookings'}
      countLabel={`${bookings.length} ${bookings.length === 1 ? 'booking' : 'bookings'} on this page`}
      intro="Open a booking to see its classes, lesson plan and saved agreement."
      columns={['Student', 'Subjects & mode', 'Package', 'Status', 'Distance', 'Next lesson']}
      note={tutorDistanceNote}
    >
      {bookings.map((en) => {
        const location =
          !archive && en.agreement.mode === 'home' && ['active', 'paused'].includes(en.status)
            ? q.data?.briefs.find((brief) => brief.learnerId === en.learnerId)?.location
            : undefined
        const next =
          !archive && en.status === 'active'
            ? q.data?.sessions
                .filter(
                  (lesson) =>
                    lesson.enrollmentId === en.id &&
                    lesson.status === 'scheduled' &&
                    Date.parse(lesson.end) > now,
                )
                .sort((a, b) => a.start.localeCompare(b.start))[0]
            : undefined
        const context = new URLSearchParams()
        if (archive) context.set('history', '1')
        if (cursor) context.set('listCursor', cursor)
        const href = `/tuition/${encodeURIComponent(en.id)}${context.size ? `?${context}` : ''}`
        return (
          <tr key={en.id}>
            <th scope="row">
              <Link className="student-report-link" to={href}>
                <strong>{en.learnerName}</strong>
                <span>
                  View booking <ArrowRight size={15} aria-hidden="true" />
                </span>
              </Link>
              <p className="student-table-secondary">Class {en.class}</p>
              {location && (
                <a
                  className="student-map-link"
                  href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${location.latitude},${location.longitude}`)}&travelmode=driving`}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Directions to ${en.learnerName}'s teaching address`}
                >
                  <MapPin size={15} aria-hidden="true" /> Directions
                </a>
              )}
            </th>
            <td>
              <SubjectNames values={en.agreement.subjects ?? [en.agreement.subject]} />
              <p className="student-table-secondary">
                {en.agreement.mode === 'home' ? 'Home Tuition' : 'Online'}
              </p>
            </td>
            <td>
              {en.agreement.sessionCount} classes
              <p className="student-table-secondary">{en.agreement.minutes} minutes per class</p>
              <p className="student-table-secondary">
                {new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(
                  en.agreement.totalPaise / 100,
                )}{' '}
                saved total
              </p>
            </td>
            <td>
              <Badge
                tone={['active', 'completed', 'reviewed'].includes(en.status) ? 'teal' : 'neutral'}
              >
                {t(`tuition.status.${en.status}`)}
              </Badge>
              {en.paymentSimulated && (
                <p>
                  <Badge tone="amber">Test booking</Badge>
                </p>
              )}
            </td>
            <td>
              <TutorDistance
                brief={
                  !archive && ['active', 'paused'].includes(en.status)
                    ? q.data?.briefs.find((brief) => brief.learnerId === en.learnerId)
                    : undefined
                }
                unavailable={archive ? 'Unavailable for past bookings' : 'Not available yet'}
              />
            </td>
            <td>
              {next ? (
                <time dateTime={next.start}>{indiaDate(next.start, 'en')}</time>
              ) : (
                <span className="student-table-secondary">
                  {en.status === 'paused'
                    ? 'Booking paused'
                    : archive
                      ? '—'
                      : 'No lesson scheduled'}
                </span>
              )}
            </td>
          </tr>
        )
      })}
    </WorkspaceRecordTable>
  )
}
