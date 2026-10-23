import { SubjectNames } from './subject-name'
import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { indiaDate, type Schema } from '../lib/api'
import { workspaceLink } from '../lib/workspace'
import { Badge, LinkButton } from './ui'
import { WorkspaceRecordTable } from './workspace-record-table'
import { DeleteLearner } from './delete-learner'

export function ParentLearnersTable({ learners }: { learners: Schema['Learner'][] }) {
  const { t } = useTranslation()
  return (
    <WorkspaceRecordTable
      label="Your learners"
      countLabel={`${learners.length} ${learners.length === 1 ? 'learner' : 'learners'}`}
      intro="Open a learner to see their progress, class history and tutor feedback."
      columns={['Learner', 'Class', 'Board', 'Teaching language', 'Actions']}
    >
      {learners.map((learner) => (
        <tr key={learner.id}>
          <th scope="row">
            <Link className="student-report-link" to={workspaceLink('learners', learner.id)}>
              <strong>{learner.name}</strong>
              <span>
                View progress <ArrowRight size={15} aria-hidden="true" />
              </span>
            </Link>
          </th>
          <td>Class {learner.class}</td>
          <td>{learner.board}</td>
          <td>{learner.language}</td>
          <td>
            <div className="learner-profile-actions">
              <Link
                className="student-map-link"
                to={`/match?profile=1&edit=1&learner=${encodeURIComponent(learner.id)}`}
              >
                {t('parent.edit')}
              </Link>
              <DeleteLearner learner={learner} />
            </div>
          </td>
        </tr>
      ))}
    </WorkspaceRecordTable>
  )
}

export function ParentTrialsTable({
  trials,
  listPath,
  trialTab,
}: {
  trials: Schema['Trial'][]
  listPath: string
  trialTab: string
}) {
  const { t } = useTranslation()
  return (
    <WorkspaceRecordTable
      label="Your trial classes"
      countLabel={`${trials.length} ${trials.length === 1 ? 'trial' : 'trials'}`}
      intro="Open a trial for class details or book your tutor after it completes."
      columns={['Learner', 'Subjects & mode', 'Trial time', 'Status', 'Booking']}
    >
      {trials.map((trial) => (
        <tr key={trial.id}>
          <th scope="row">
            <Link
              className="student-report-link"
              to={`${listPath}&trial=${encodeURIComponent(trial.id)}`}
            >
              <strong>{trial.learnerName}</strong>
              <span>
                View trial <ArrowRight size={15} aria-hidden="true" />
              </span>
            </Link>
            <p className="student-table-secondary">Class {trial.class}</p>
          </th>
          <td>
            <SubjectNames values={trial.subjects ?? [trial.subject]} />
            <p className="student-table-secondary">
              {trial.mode === 'home' ? 'Home Tuition' : 'Online'}
            </p>
          </td>
          <td>
            <time dateTime={trial.start}>{indiaDate(trial.start, 'en')}</time>
            <p className="student-table-secondary">
              {Math.round((Date.parse(trial.end) - Date.parse(trial.start)) / 60000)} minutes
            </p>
          </td>
          <td>
            <Badge
              tone={
                ['confirmed', 'completed', 'reviewed'].includes(trial.status) ? 'teal' : 'neutral'
              }
            >
              {t(`parent.trialStatus.${trial.status}`)}
            </Badge>
          </td>
          <td>
            {['completed', 'reviewed'].includes(trial.status) ? (
              <LinkButton
                to={`/tuition?trial=${encodeURIComponent(trial.id)}&trialTab=${encodeURIComponent(trialTab)}`}
              >
                {t('bookTutor')}
              </LinkButton>
            ) : (
              <span aria-label="No booking action">—</span>
            )}
          </td>
        </tr>
      ))}
    </WorkspaceRecordTable>
  )
}

export function ParentBookingsTable({
  bookings,
  archive,
  cursor,
}: {
  bookings: Schema['Enrollment'][]
  archive: boolean
  cursor: string
}) {
  const { t } = useTranslation()
  const context = new URLSearchParams()
  if (archive) context.set('history', '1')
  if (cursor) context.set('listCursor', cursor)
  return (
    <WorkspaceRecordTable
      label={archive ? 'Past regular class bookings' : 'Current regular class bookings'}
      countLabel={`${bookings.length} ${bookings.length === 1 ? 'booking' : 'bookings'} on this page`}
      intro="Open a booking for its schedule, progress, saved agreement and class support."
      columns={['Learner', 'Tutor', 'Subjects & mode', 'Package', 'Status']}
    >
      {bookings.map((booking) => (
        <tr key={booking.id}>
          <th scope="row">
            <Link
              className="student-report-link"
              to={`/tuition/${encodeURIComponent(booking.id)}${context.size ? `?${context}` : ''}`}
            >
              <strong>{booking.learnerName}</strong>
              <span>
                View booking <ArrowRight size={15} aria-hidden="true" />
              </span>
            </Link>
            <p className="student-table-secondary">Class {booking.class}</p>
          </th>
          <td>{booking.tutorName}</td>
          <td>
            <SubjectNames values={booking.agreement.subjects ?? [booking.agreement.subject]} />
            <p className="student-table-secondary">
              {booking.agreement.mode === 'home' ? 'Home Tuition' : 'Online'}
            </p>
          </td>
          <td>
            {booking.agreement.sessionCount} classes
            <p className="student-table-secondary">{booking.agreement.minutes} minutes per class</p>
            <p className="student-table-secondary">
              {new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(
                booking.agreement.totalPaise / 100,
              )}{' '}
              saved total
            </p>
          </td>
          <td>
            <Badge tone={['active', 'completed'].includes(booking.status) ? 'teal' : 'neutral'}>
              {t(`tuition.status.${booking.status}`)}
            </Badge>
            {booking.paymentSimulated && (
              <p>
                <Badge tone="amber">Test booking</Badge>
              </p>
            )}
          </td>
        </tr>
      ))}
    </WorkspaceRecordTable>
  )
}
