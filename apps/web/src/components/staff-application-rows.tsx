import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowRight } from 'lucide-react'
import type { Application } from '../lib/api'
import { indiaDate } from '../lib/api'
import { useAuth } from '../lib/session'
import { useSubjects } from '../lib/subjects'
import { initials } from '../lib/workspace'
import { approvedTutorSubjects, tutorModeLabel } from '../lib/tutors'
import { Status } from './ui'

export function ApplicationRows({
  applications,
  view,
}: {
  applications: Application[]
  view: string
}) {
  const { t, i18n } = useTranslation()
  const subjectCatalog = useSubjects()
  const role = useAuth().data?.user.role
  const mentor = role === 'mentor'
  const structured = mentor || role === 'admin'
  const [params] = useSearchParams()
  return (
    <div className="staff-rows">
      {structured && applications.length > 0 && (
        <div className={mentor ? 'mentor-list-heading' : 'admin-list-heading'} aria-hidden="true">
          <span>{t('staffOps.mentorTutorColumn')}</span>
          <span>{t('staffOps.mentorScopeColumn')}</span>
          <span>{t('staffOps.status')}</span>
        </div>
      )}
      {applications.map((application) => {
        const next = new URLSearchParams(params)
        next.set('view', view)
        next.set('application', application.id)
        const scope = application.profile
          ? application.profile.teachingAreas
              .map(
                (area) =>
                  `${subjectCatalog.label(area.subject)} ${area.minClass}–${area.maxClass} · ${area.modes.map((m) => t(`applicationForm.${m}`)).join(' / ')}`,
              )
              .join('; ')
          : `${approvedTutorSubjects(application.scope).map(subjectCatalog.label).join(', ')} · ${t('classes')} ${application.scope.minClass}–${application.scope.maxClass}${structured ? ` · ${tutorModeLabel(application.scope, t)}` : ''}`
        return (
          <Link className="staff-row" key={application.id} to={`/workspace?${next}`}>
            <span className="staff-avatar" aria-hidden="true">
              {initials(application.name)}
            </span>
            <div className="staff-row-person">
              <strong>{application.name}</strong>
              {structured ? (
                application.sample && <p className="staff-sample">{t('sample')}</p>
              ) : (
                <p>{scope}</p>
              )}
              {view === 'interviews' && application.interview && (
                <time dateTime={application.interview.start}>
                  {indiaDate(application.interview.start, i18n.language)}
                </time>
              )}
            </div>
            {structured && (
              <p className={mentor ? 'mentor-row-scope' : 'admin-row-scope'}>{scope}</p>
            )}
            <Status status={application.status} />
            <ArrowRight size={17} aria-hidden="true" />
          </Link>
        )
      })}
    </div>
  )
}
