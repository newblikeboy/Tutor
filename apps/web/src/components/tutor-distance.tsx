import type { Schema } from '../lib/api'

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
