import { useId, type ReactNode } from 'react'
import type { Schema } from '../lib/api'
import '../styles/tutor-students.css'

export function TutorRecordTable({
  label,
  countLabel,
  intro,
  columns,
  children,
  note,
}: {
  label: string
  countLabel: string
  intro: string
  columns: string[]
  children: ReactNode
  note?: ReactNode
}) {
  const helpID = useId()
  return (
    <section className="student-roster" aria-label={`${label} overview`}>
      <div className="student-roster-heading">
        <p>{countLabel}</p>
        <p>{intro}</p>
      </div>
      <p id={helpID} className="student-table-help">
        Scroll across to see all details.
      </p>
      <div
        className="student-table-scroll"
        role="region"
        aria-label={label}
        aria-describedby={helpID}
        tabIndex={0}
      >
        <table className="student-table">
          <caption className="sr-only">{label}</caption>
          <thead>
            <tr>
              {columns.map((column) => (
                <th scope="col" key={column}>
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>{children}</tbody>
        </table>
      </div>
      {note && <p className="student-distance-note">{note}</p>}
    </section>
  )
}

export function TutorDistance({
  brief,
  unavailable = 'Distance unavailable',
}: {
  brief?: Schema['TutorLearnerBrief']
  unavailable?: string
}) {
  return brief?.distanceKm !== undefined ? (
    <span className="student-distance">
      {brief.distanceKm < 0.1 ? '<0.1' : brief.distanceKm.toFixed(1)} km
    </span>
  ) : (
    <span className="student-table-secondary">
      {brief?.distanceUnavailable === 'tutor_location_missing'
        ? 'Set tutor location'
        : brief?.distanceUnavailable === 'student_location_missing'
          ? 'Student location not set'
          : unavailable}
    </span>
  )
}

export const tutorDistanceNote =
  "Distance is approximate, measured in a straight line to the student's saved household location."
