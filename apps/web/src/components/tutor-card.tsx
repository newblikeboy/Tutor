import { useState } from 'react'
import '../styles/tutor-card.css'
import { Link } from 'react-router-dom'

import { useTranslation } from 'react-i18next'
import { GraduationCap, House, MapPin, Monitor, Sparkles, ShieldCheck } from 'lucide-react'

import type { Tutor } from '../lib/api'
import {
  approvedTutorSubjects,
  tutorHasMode,
  tutorModeLabel,
  tutorProfileLink,
  tutorExperience,
} from '../lib/tutors'

import { TutorFees } from '../components/tutor-fees'

import { Badge, LinkButton } from '../components/ui'
export function TutorCard({
  tutor,
  context = new URLSearchParams(),
}: {
  tutor: Tutor
  context?: URLSearchParams
}) {
  const { t } = useTranslation()
  const subject = approvedTutorSubjects(tutor.scope).join(', ')
  const classRange = `${tutor.scope.minClass}-${tutor.scope.maxClass}`
  const language = tutor.teachingLanguages.join(' · ') || 'Not added'
  const mode = tutorModeLabel(tutor.scope, t)
  const hasOnline = tutorHasMode(tutor, 'online')
  const hasHome = tutorHasMode(tutor, 'home')
  const experienceLabel = tutorExperience(tutor)
  const link = tutorProfileLink(tutor.id, context)
  const selectedMode = context.get('mode') || (hasOnline ? 'online' : 'home')
  const plans = tutor.feePlans.filter((plan) => !selectedMode || plan.mode === selectedMode)
  return (
    <article className="tutor-card tutor-result-card">
      <div className="tutor-card-main">
        <TutorPhotoSymbol tutor={tutor} />
        <div className="tutor-card-copy">
          <div className="tutor-card-kicker">
            <Badge tone="teal">{tutor.sample ? 'Sample profile' : 'Assessed by GoCoaching'}</Badge>
            <span>{experienceLabel}</span>
          </div>
          <h3>
            <Link to={link}>{tutor.name}</Link>
          </h3>
          <p className="tutor-card-title">
            {subject} teacher for Classes {classRange}
          </p>
          <p className="tutor-approach">{tutor.approach}</p>
          <div className="tutor-highlights" aria-label={t('teacherProfileFacts')}>
            <span>
              {hasOnline && <Monitor size={16} />}
              {hasHome && <House size={16} />}
              {mode}
            </span>
            <span>
              <Sparkles size={16} />
              {language}
            </span>
            <span>
              <ShieldCheck size={16} />
              {tutor.teachingHoursSet ? 'Teaching hours saved' : 'Teaching hours not set'}
            </span>
          </div>
          {hasHome &&
            (tutor.distanceKm != null || tutor.serviceRadiusKm > 0 || tutor.publicLocality) && (
              <div className="tutor-distance-line">
                <MapPin size={16} aria-hidden="true" />
                <span>
                  {tutor.distanceKm != null
                    ? t('teacherDistanceAway', { distance: tutor.distanceKm.toFixed(1) })
                    : tutor.publicLocality || t('locationSearchPlaceholder')}
                  {tutor.serviceRadiusKm > 0
                    ? ` · ${t('teacherServiceRadius', { count: tutor.serviceRadiusKm })}`
                    : ''}
                </span>
              </div>
            )}
        </div>
      </div>
      <div
        className="tutor-card-action"
        role="group"
        aria-label={`${tutor.name} pricing and profile`}
      >
        <TutorFees plans={plans} />
        <LinkButton to={link}>{t('viewCompleteProfile')}</LinkButton>
      </div>
    </article>
  )
}
export function TutorPhotoSymbol({ tutor, large = false }: { tutor: Tutor; large?: boolean }) {
  const [failed, setFailed] = useState(false)
  return (
    <div className={large ? 'teacher-photo-symbol' : 'tutor-photo-symbol'} aria-hidden="true">
      {tutor.photoUrl && !failed ? (
        <img src={tutor.photoUrl} alt="" onError={() => setFailed(true)} />
      ) : (
        <>
          <span>{tutor.name.slice(0, 1)}</span>
          <GraduationCap size={large ? 36 : 28} strokeWidth={large ? 1.35 : 1.45} />
        </>
      )}
    </div>
  )
}
