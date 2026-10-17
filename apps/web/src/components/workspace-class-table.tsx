import { Link, useSearchParams } from 'react-router-dom'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { indiaDate, type Schema } from '../lib/api'
import { Badge, Empty } from './ui'
import { WorkspaceRecordTable } from './workspace-record-table'

export function WorkspaceClassTable({
  sessions,
  parent = false,
}: {
  sessions: Schema['ClassSession'][]
  parent?: boolean
}) {
  const [params] = useSearchParams()
  const { t } = useTranslation()
  if (!sessions.length) return <Empty title="No classes in this booking" />
  return (
    <WorkspaceRecordTable
      label="Classes in this booking"
      countLabel={`${sessions.length} ${sessions.length === 1 ? 'class' : 'classes'}`}
      intro={
        parent
          ? 'Open a class to join, view progress, check schedule changes or report a concern.'
          : 'Open a class to join, plan, record attendance or manage its schedule.'
      }
      columns={['Class time', 'Subject', 'Status', 'Attendance', 'Progress']}
    >
      {[...sessions]
        .sort((a, b) => a.start.localeCompare(b.start))
        .map((lesson) => {
          const next = new URLSearchParams(params)
          next.set('tab', 'classes')
          next.set('class', lesson.id)
          return (
            <tr key={lesson.id}>
              <th scope="row">
                <Link className="student-report-link" to={`?${next}`}>
                  <strong>
                    <time dateTime={lesson.start}>{indiaDate(lesson.start, 'en')}</time>
                  </strong>
                  <span>
                    View class <ArrowRight size={15} aria-hidden="true" />
                  </span>
                </Link>
                <p className="student-table-secondary">
                  {Math.round((Date.parse(lesson.end) - Date.parse(lesson.start)) / 60000)} minutes
                </p>
              </th>
              <td>{lesson.progress?.subject || lesson.plannedSubject || 'Subject not planned'}</td>
              <td>
                <Badge
                  tone={['completed', 'reviewed'].includes(lesson.status) ? 'teal' : 'neutral'}
                >
                  {t(`tuition.status.${lesson.status}`)}
                </Badge>
                {lesson.proposal && (
                  <p className="student-table-secondary">Schedule change proposed</p>
                )}
              </td>
              <td>
                {lesson.attendance ? (
                  t(`tuition.${lesson.attendance}`)
                ) : (
                  <span className="student-table-secondary">Not recorded</span>
                )}
              </td>
              <td>
                {lesson.progress ? (
                  'Recorded'
                ) : (
                  <span className="student-table-secondary">Not recorded</span>
                )}
              </td>
            </tr>
          )
        })}
    </WorkspaceRecordTable>
  )
}

export function WorkspaceClassBack() {
  const [params] = useSearchParams()
  const next = new URLSearchParams(params)
  next.delete('class')
  next.set('tab', 'classes')
  return (
    <Link className="student-back-link" to={`?${next}`}>
      <ArrowLeft size={17} aria-hidden="true" />
      Back to class list
    </Link>
  )
}
