import { useEffect, useRef } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { indiaDate, type Schema } from '../lib/api'
import { Alert, Badge, Empty, Status } from './ui'
import { TrialCard } from './trial-card'
import { TutorRecordTable } from './tutor-record-table'

const queues = ['all', 'requested', 'confirmed', 'completed', 'reviewed', 'cancelled', 'declined']
const trialListPath = (queue: string) =>
  `/workspace?view=sessions${queue === 'all' ? '' : `&queue=${queue}`}`

export function TutorTrials({ data }: { data: Schema['TutorWorkspace'] }) {
  const [params] = useSearchParams()
  const queue = queues.includes(params.get('queue') ?? '') ? params.get('queue')! : 'all'
  const trials = [...data.trials].sort((a, b) => b.start.localeCompare(a.start))
  const selectedID = params.get('trial')
  const filters = useRef<HTMLElement>(null)
  useEffect(() => {
    const strip = filters.current
    if (!strip) return
    const reveal = () => {
      const active = strip.querySelector('[aria-current="page"]')
      if (!active || strip.scrollWidth <= strip.clientWidth) return
      const bounds = strip.getBoundingClientRect()
      const link = active.getBoundingClientRect()
      if (link.left < bounds.left + 4) strip.scrollLeft += link.left - bounds.left - 4
      else if (link.right > bounds.right - 4) strip.scrollLeft += link.right - bounds.right + 4
    }
    reveal()
    const observer = new ResizeObserver(reveal)
    observer.observe(strip)
    return () => observer.disconnect()
  }, [queue, selectedID])
  if (selectedID) {
    const selected = trials.find((trial) => trial.id === selectedID)
    return (
      <div className="tutor-learners">
        <Link className="student-back-link" to={trialListPath(queue)}>
          <ArrowLeft size={17} aria-hidden="true" />
          Back to Trial lessons
        </Link>
        {selected ? (
          <TrialCard
            key={`${selected.id}:${selected.version}`}
            trial={selected}
            role="tutor"
            headingLevel={2}
          />
        ) : (
          <Alert kind="error">This trial is not available.</Alert>
        )}
      </div>
    )
  }
  const visible = trials.filter((trial) => queue === 'all' || trial.status === queue)
  return (
    <section className="teacher-sessions" aria-label="Trial lessons">
      <nav ref={filters} className="teacher-filters" aria-label="Filter trial lessons">
        {queues.map((value) => (
          <Link
            key={value}
            to={trialListPath(value)}
            aria-current={queue === value ? 'page' : undefined}
          >
            {value === 'reviewed'
              ? 'Historical reviews'
              : value === 'all'
                ? 'All trials'
                : value[0].toUpperCase() + value.slice(1)}
            <span>
              {value === 'all'
                ? trials.length
                : trials.filter((trial) => trial.status === value).length}
            </span>
          </Link>
        ))}
      </nav>
      {visible.length ? (
        <TutorRecordTable
          label="Tutor trial lessons"
          countLabel={`${visible.length} ${visible.length === 1 ? 'trial' : 'trials'}`}
          intro="Open a trial to confirm its time, join the lesson or record feedback."
          columns={['Student', 'Subjects & mode', 'Trial time', 'Status', 'Feedback status']}
        >
          {visible.map((trial) => (
            <tr key={trial.id}>
              <th scope="row">
                <Link
                  className="student-report-link"
                  to={`${trialListPath(queue)}&trial=${encodeURIComponent(trial.id)}`}
                >
                  <strong>{trial.learnerName || 'Student'}</strong>
                  <span>
                    View trial <ArrowRight size={15} aria-hidden="true" />
                  </span>
                </Link>
                <p className="student-table-secondary">Class {trial.class}</p>
              </th>
              <td>
                {(trial.subjects ?? [trial.subject]).join(', ')}
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
                {trial.status === 'completed' ? (
                  <Badge tone="teal">Completed</Badge>
                ) : (
                  <Status status={trial.status} />
                )}
              </td>
              <td>
                <Badge tone={trial.review?.trim() ? 'teal' : 'neutral'}>
                  {trial.review?.trim()
                    ? 'Submitted'
                    : ['cancelled', 'declined'].includes(trial.status)
                      ? 'Not required'
                      : 'Pending'}
                </Badge>
              </td>
            </tr>
          ))}
        </TutorRecordTable>
      ) : (
        <Empty headingLevel={2} title="No trials in this view" />
      )}
    </section>
  )
}
