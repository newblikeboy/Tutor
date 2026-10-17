import { SubjectNames } from './subject-name'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { indiaDate, type Schema } from '../lib/api'
import { useClock } from '../lib/clock'
import { Alert, Badge, Empty } from './ui'
import LearnerProgressReport from './learner-progress'
import { TutorDistance, tutorDistanceNote } from './tutor-distance'
import '../styles/tutor-students.css'

const currentEnrollment = (en: Schema['Enrollment']) => ['active', 'paused'].includes(en.status)
const currentTrial = (trial: Schema['Trial']) => ['requested', 'confirmed'].includes(trial.status)
const subjects = (en: Schema['Enrollment']) => en.agreement.subjects ?? [en.agreement.subject]
const modeLabel = (mode: string | undefined) => (mode === 'home' ? 'Home Tuition' : 'Online')
const studentsPath = '/workspace?view=learners'

export function TutorStudents({ data }: { data: Schema['TutorWorkspace'] }) {
  const [params] = useSearchParams()
  const now = useClock()
  const selectedID = params.get('learner')
  if (selectedID) {
    const student = data.learners.find((item) => item.id === selectedID)
    return (
      <div className="tutor-learners">
        <Link className="student-back-link" to={studentsPath}>
          <ArrowLeft size={17} aria-hidden="true" />
          Back to My students
        </Link>
        {student ? (
          <StudentReport student={student} data={data} />
        ) : (
          <Alert kind="error">This student is no longer in your current assignments.</Alert>
        )}
      </div>
    )
  }
  if (!data.learners.length)
    return (
      <Empty
        headingLevel={2}
        title="No assigned students yet"
        body="Students appear here when a trial is requested or a regular booking is confirmed."
      />
    )
  return (
    <section className="student-roster" aria-label="My students">
      <div className="student-roster-heading">
        <p>
          {data.learners.length} {data.learners.length === 1 ? 'student' : 'students'}
        </p>
        <p>Choose a student to open their progress report.</p>
      </div>
      <p id="student-table-help" className="student-table-help">
        Scroll across to see all student details.
      </p>
      <div
        className="student-table-scroll"
        role="region"
        aria-label="Student details"
        aria-describedby="student-table-help"
        tabIndex={0}
      >
        <table className="student-table">
          <caption className="sr-only">Students in your current teaching assignments</caption>
          <thead>
            <tr>
              <th scope="col">Student</th>
              <th scope="col">Class &amp; board</th>
              <th scope="col">Subjects &amp; mode</th>
              <th scope="col">Status</th>
              <th scope="col">Distance</th>
              <th scope="col">Next lesson</th>
            </tr>
          </thead>
          <tbody>
            {[...data.learners]
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((student) => {
                const brief = data.briefs.find((item) => item.learnerId === student.id)
                const enrollments = data.enrollments.filter(
                  (en) => en.learnerId === student.id && currentEnrollment(en),
                )
                const trials = data.trials.filter(
                  (trial) => trial.learnerId === student.id && currentTrial(trial),
                )
                const activeIDs = new Set(
                  enrollments.filter((en) => en.status === 'active').map((en) => en.id),
                )
                const teachingSubjects = [
                  ...new Set([
                    ...enrollments.flatMap(subjects),
                    ...trials.flatMap((trial) => trial.subjects ?? [trial.subject]),
                  ]),
                ]
                const modes = [
                  ...new Set([
                    ...enrollments.map((en) => modeLabel(en.agreement.mode)),
                    ...trials.map((trial) => modeLabel(trial.mode)),
                  ]),
                ]
                const status = enrollments.some((en) => en.status === 'active')
                  ? 'Active'
                  : enrollments.length
                    ? 'Paused'
                    : trials.some((trial) => trial.status === 'confirmed')
                      ? 'Trial confirmed'
                      : 'Trial requested'
                const next = [
                  ...data.sessions.filter(
                    (lesson) =>
                      activeIDs.has(lesson.enrollmentId) &&
                      lesson.status === 'scheduled' &&
                      Date.parse(lesson.end) > now,
                  ),
                  ...trials.filter(
                    (trial) => trial.status === 'confirmed' && Date.parse(trial.end) > now,
                  ),
                ].sort((a, b) => a.start.localeCompare(b.start))[0]
                return (
                  <tr key={student.id}>
                    <th scope="row">
                      <Link
                        className="student-report-link"
                        to={`${studentsPath}&learner=${encodeURIComponent(student.id)}`}
                      >
                        <strong>{student.name}</strong>
                        <span>
                          {enrollments.length ? 'View progress report' : 'View student'}{' '}
                          <ArrowRight size={15} aria-hidden="true" />
                        </span>
                      </Link>
                      <p className="student-table-secondary">{student.language}</p>
                    </th>
                    <td>
                      Class {student.class}
                      <p className="student-table-secondary">{student.board}</p>
                    </td>
                    <td>
                      <SubjectNames values={teachingSubjects} />
                      <p className="student-table-secondary">{modes.join(', ')}</p>
                    </td>
                    <td>
                      <Badge
                        tone={
                          status === 'Active' || status === 'Trial confirmed' ? 'teal' : 'neutral'
                        }
                      >
                        {status}
                      </Badge>
                    </td>
                    <td>
                      <TutorDistance brief={brief} />
                    </td>
                    <td>
                      {next ? (
                        <time dateTime={next.start}>{indiaDate(next.start, 'en')}</time>
                      ) : (
                        <span className="student-table-secondary">No lesson scheduled</span>
                      )}
                    </td>
                  </tr>
                )
              })}
          </tbody>
        </table>
      </div>
      <p className="student-distance-note">{tutorDistanceNote}</p>
    </section>
  )
}

function StudentReport({
  student,
  data,
}: {
  student: Schema['Learner']
  data: Schema['TutorWorkspace']
}) {
  const enrolled = data.enrollments.filter(
    (en) => en.learnerId === student.id && currentEnrollment(en),
  )
  const location = data.briefs.find((brief) => brief.learnerId === student.id)?.location
  const trials = data.trials.filter(
    (trial) => trial.learnerId === student.id && currentTrial(trial),
  )
  return (
    <>
      <section className="tu-panel tutor-preparation">
        <h2>Teaching brief</h2>
        <h3>{student.name}</h3>
        <p>
          Class {student.class} · {student.board} · Teaching language: {student.language}
        </p>
        {location && (
          <p>
            <strong>Home teaching address:</strong> {location.address}
          </p>
        )}
        {enrolled.map((en) => (
          <div key={en.id}>
            <p>
              <strong>
                <SubjectNames values={subjects(en)} />
              </strong>{' '}
              · {modeLabel(en.agreement.mode)} · {en.agreement.sessionCount} classes ·{' '}
              {en.agreement.minutes} minutes per class
            </p>
            <Link className="text-link" to={`/tuition/${en.id}`}>
              Open classes and lesson plan
            </Link>
          </div>
        ))}
        {!enrolled.length &&
          trials.map((trial) => (
            <p key={trial.id}>
              <SubjectNames values={trial.subjects ?? [trial.subject]} /> · {modeLabel(trial.mode)}{' '}
              trial · {indiaDate(trial.start, 'en')}
            </p>
          ))}
      </section>
      {enrolled.length ? (
        <LearnerProgressReport key={student.id} learner={student} tutor />
      ) : (
        <Empty
          title="No regular-class progress yet"
          body="A progress report opens after a regular booking is confirmed. Manage this student's trial and feedback in Trial lessons."
        >
          <Link className="text-link" to="/workspace?view=sessions">
            Open trial lessons
          </Link>
        </Empty>
      )}
    </>
  )
}
