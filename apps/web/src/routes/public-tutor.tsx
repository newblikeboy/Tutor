import '../styles/home.css'
import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
  BookOpen,
  GraduationCap,
  House,
  LockKeyhole,
  MapPin,
  Monitor,
  Sparkles,
  ShieldCheck,
} from 'lucide-react'
import { api } from '../lib/api'
import type { Tutor } from '../lib/api'
import { approvedTutorSubjects, tutorHasMode, tutorModeLabel } from '../lib/tutors'

import { TutorFees } from '../components/tutor-fees'

import { LinkButton, LoadError, Loading } from '../components/ui'
import { TutorPhotoSymbol } from '../components/tutor-card'
export function TutorDetail() {
  const { id } = useParams()
  const { t } = useTranslation()
  const q = useQuery({
    queryKey: ['tutor', id],
    queryFn: ({ signal }) => api<Tutor>(`/tutors/${id}`, { signal }),
  })
  if (q.isPending)
    return (
      <div className="container section">
        <Loading />
      </div>
    )
  if (q.isError)
    return (
      <div className="container section">
        <LoadError retry={() => void q.refetch()} />
      </div>
    )
  const tutor = q.data
  const subject = approvedTutorSubjects(tutor.scope).join(', ')
  const classRange = `${tutor.scope.minClass}-${tutor.scope.maxClass}`
  const language = t(tutor.language === 'Hindi' ? 'hindi' : 'english')
  const mode = tutorModeLabel(tutor.scope, t)
  const hasOnline = tutorHasMode(tutor, 'online')
  const hasHome = tutorHasMode(tutor, 'home')
  const experienceLabel =
    tutor.experience > 0
      ? t('teacherProofExperienceValue', { count: tutor.experience })
      : t('teacherExperienceNew')
  const bestFor = [
    t('teacherFitScope', { subject, classes: classRange }),
    t('teacherFitMode', { mode }),
    t('teacherFitReview'),
  ]

  return (
    <div className="container section tutor-profile-page">
      <Link className="back-link" to="/tutors?searched=1">
        {t('browse')}
      </Link>
      <div className="profile-layout teacher-profile-layout">
        <main>
          <section className="teacher-hero-card" aria-labelledby="teacher-profile-title">
            <div className="teacher-hero-main">
              <div className="teacher-identity">
                <TutorPhotoSymbol tutor={tutor} large />
                <div>
                  <p className="eyebrow">{t('teacherProfileEyebrow')}</p>
                  <h1 id="teacher-profile-title">{tutor.name}</h1>
                  <p className="teacher-headline">
                    {t('teacherProfileLead', { subject, classes: classRange, mode, language })}
                  </p>
                </div>
              </div>
              <div className="teacher-badges" aria-label={t('teacherProfileFacts')}>
                <span>
                  <BookOpen size={16} />
                  {subject}
                </span>
                <span>
                  {hasOnline && <Monitor size={16} />}
                  {hasHome && <House size={16} />}
                  {mode}
                </span>
                <span>
                  <Sparkles size={16} />
                  {language}
                </span>
              </div>
            </div>
            <aside className="teacher-snapshot" aria-label={t('teacherSnapshot')}>
              <span>{t('teacherSnapshot')}</span>
              <strong>{experienceLabel}</strong>
              <p>{t('experienceParentCopy')}</p>
            </aside>
          </section>

          <section className="teacher-decision-grid" aria-label={t('teacherProfileFacts')}>
            <article>
              <ShieldCheck size={22} />
              <span>{t('staffConfirmed')}</span>
              <strong>
                {subject}, Classes {classRange}
              </strong>
            </article>
            <article>
              {hasHome ? <House size={22} /> : <Monitor size={22} />}
              <span>{t('teacherMode')}</span>
              <strong>{mode}</strong>
            </article>
            <article>
              <Sparkles size={22} />
              <span>{t('preferredLanguage')}</span>
              <strong>{language}</strong>
            </article>
            {hasHome && (tutor.publicLocality || tutor.serviceRadiusKm > 0) && (
              <article>
                <MapPin size={22} />
                <span>{t('homeServiceArea')}</span>
                <strong>
                  {tutor.publicLocality || t('homeTuition')}
                  {tutor.serviceRadiusKm > 0
                    ? ` · ${t('teacherServiceRadius', { count: tutor.serviceRadiusKm })}`
                    : ''}
                </strong>
              </article>
            )}
          </section>

          <section className="profile-section teacher-approach-panel">
            <div>
              <p className="eyebrow">{t('teachingApproach')}</p>
              <h2>{t('teacherApproachTitle')}</h2>
            </div>
            <blockquote>{tutor.sample ? t('step3Body') : tutor.approach}</blockquote>
            {tutor.introVideoUrl && (
              <video
                className="teacher-intro-video"
                controls
                preload="metadata"
                src={tutor.introVideoUrl}
                aria-label={`${tutor.name} introduction video`}
              />
            )}
          </section>

          <section className="profile-section teacher-fit-panel">
            <h2>{t('teacherFitTitle')}</h2>
            <p>{t('teacherFitBody')}</p>
            <ul>
              {bestFor.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
        </main>
        <aside className="trial-summary teacher-action-card panel">
          <span className="summary-icon">
            <GraduationCap size={30} />
          </span>
          <h2>{t('teacherActionTitle')}</h2>
          <p>{t('teacherActionBody', { name: tutor.name })}</p>
          <TutorFees plans={tutor.feePlans} />
          <LinkButton to={`/match?tutor=${tutor.id}`}>{t('teacherActionButton')}</LinkButton>
          <p className="privacy-note">
            <LockKeyhole size={16} />
            {t('privacyNote')}
          </p>
        </aside>
      </div>
    </div>
  )
}
