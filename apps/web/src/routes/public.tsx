import { useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronRight,
  Compass,
  GraduationCap,
  House,
  LockKeyhole,
  MapPin,
  Monitor,
  Sparkles,
  ShieldCheck,
  SlidersHorizontal,
  Target,
  Sprout,
} from 'lucide-react'
import { api } from '../lib/api'
import type { Tutor } from '../lib/api'
import { tutorHasMode, tutorModeLabel } from '../lib/tutors'
import { LocationSearchField, type StoredLocation } from '../components/location-search'
import { TutorFees } from '../components/tutor-fees'
import { SubjectSelect } from '../components/subject-select'
import {
  Alert,
  Badge,
  Button,
  Empty,
  Field,
  LinkButton,
  LoadError,
  Loading,
  Modal,
  PageHeading,
} from '../components/ui'
export function LearningPreview() {
  const { t } = useTranslation()
  return (
    <div className="learning-preview">
      <div className="preview-label">
        <span className="short-line" />
        {t('preview')}
      </div>
      <div className="plan-paper">
        <div className="plan-top">
          <div className="plan-icon">
            <BookOpen size={24} />
          </div>
          <Badge>{t('planSubject')}</Badge>
        </div>
        <h2>{t('plan')}</h2>
        <div className="lesson-focus">
          <span className="eyebrow">01 / {t('currentFocus')}</span>
          <h3>{t('focus')}</h3>
          <p>{t('focusBody')}</p>
          <div className="fraction-art" aria-hidden="true">
            <div className="fraction-square">
              <i />
              <i />
              <i />
              <i />
            </div>
            <span>½</span>
            <span className="equals">=</span>
            <div className="fraction-bar">
              <i />
              <i />
              <i />
              <i />
            </div>
            <span>²⁄₄</span>
          </div>
        </div>
        <div className="topic-steps">
          <span>
            <Check size={14} />
            {t('introduced')}
          </span>
          <span className="active">{t('practising')}</span>
          <span>{t('independent')}</span>
        </div>
        <div className="mentor-note">
          <span className="mentor-icon">
            <Compass size={21} />
          </span>
          <div>
            <strong>{t('nextReview')}</strong>
            <p>{t('nextReviewBody')}</p>
          </div>
        </div>
      </div>
      <div className="scope-note">
        <ShieldCheck size={28} />
        <div>
          <strong>{t('approval')}</strong>
          <p>{t('approvalBody')}</p>
        </div>
      </div>
    </div>
  )
}
export function TutorCard({ tutor }: { tutor: Tutor }) {
  const { t } = useTranslation()
  const subject = tutor.scope.subject === 'Mathematics' ? t('math') : tutor.scope.subject
  const classRange = `${tutor.scope.minClass}-${tutor.scope.maxClass}`
  const language = t(tutor.language === 'Hindi' ? 'hindi' : 'english')
  const mode = tutorModeLabel(tutor.scope, t)
  const hasOnline = tutorHasMode(tutor, 'online')
  const hasHome = tutorHasMode(tutor, 'home')
  const experienceLabel =
    tutor.experience > 0
      ? t('teacherProofExperienceValue', { count: tutor.experience })
      : t('teacherExperienceNew')
  return (
    <article className="tutor-card tutor-result-card">
      <div className="tutor-card-main">
        <TutorPhotoSymbol tutor={tutor} />
        <div className="tutor-card-copy">
          <div className="tutor-card-kicker">
            <Badge tone="teal">{t('teacherAvailable')}</Badge>
            <span>{experienceLabel}</span>
          </div>
          <h3>
            <Link to={`/tutors/${tutor.id}`}>{tutor.name}</Link>
          </h3>
          <p className="tutor-card-title">
            {subject} teacher for Classes {classRange}
          </p>
          <p className="tutor-approach">{tutor.sample ? t('step3Body') : tutor.approach}</p>
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
              {t('staffConfirmed')}
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
      <aside className="tutor-card-action" aria-label={t('teacherCardAction')}>
        <TutorFees plans={tutor.feePlans} />
        <LinkButton to={`/tutors/${tutor.id}`}>{t('viewCompleteProfile')}</LinkButton>
      </aside>
    </article>
  )
}
function QuickTutorFinder() {
  const { t } = useTranslation()
  const classOptions = [
    { value: 5, label: t('landing.finderClassPrimary') },
    { value: 8, label: t('landing.finderClassMiddle') },
    { value: 10, label: t('landing.finderClassBoard') },
    { value: 12, label: t('landing.finderClassSenior') },
  ]
  const modeOptions = [
    { value: 'online', label: t('online') },
    { value: 'home', label: t('landing.finderOffline') },
  ]
  const [finderClass, setFinderClass] = useState(classOptions[1].value)
  const [finderMode, setFinderMode] = useState('online')
  const [finderSubjects, setFinderSubjects] = useState<string[]>([])
  const [finderTime, setFinderTime] = useState('17:00')
  const finderGoal = t('landing.finderGoal', {
    mode: t(finderMode === 'online' ? 'online' : 'landing.finderOffline'),
    time: finderTime,
  })
  const finderParams = new URLSearchParams({
    searched: '1',
    class: String(finderClass),
    mode: finderMode,
    time: finderTime,
    goal: finderGoal,
  })
  finderSubjects.forEach((subject) => finderParams.append('subject', subject))
  const finderLink = `/tutors?${finderParams}`
  return (
    <aside
      id="quick-tutor-finder"
      className="home-finder tutor-search-finder"
      aria-label={t('landing.finderTitle')}
    >
      <div className="home-finder-group">
        <span>{t('landing.finderClassLabel')}</span>
        <div className="home-finder-options">
          {classOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={finderClass === option.value}
              onClick={() => setFinderClass(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
      <div className="home-finder-group">
        <span>{t('landing.finderModeLabel')}</span>
        <div className="home-finder-options two">
          {modeOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={finderMode === option.value}
              onClick={() => setFinderMode(option.value)}
            >
              {option.value === 'online' ? (
                <Monitor size={15} aria-hidden="true" />
              ) : (
                <House size={15} aria-hidden="true" />
              )}
              {option.label}
            </button>
          ))}
        </div>
      </div>
      <SubjectSelect value={finderSubjects} onChange={setFinderSubjects} />
      <Field label={t('landing.finderPreferredTime')}>
        <input
          type="time"
          value={finderTime}
          onChange={(event) => setFinderTime(event.target.value)}
        />
      </Field>
      <LinkButton to={finderLink}>{t('landing.finderButton')}</LinkButton>
      <p className="home-finder-note">{t('landing.finderNote')}</p>
    </aside>
  )
}

export function Home() {
  const { t } = useTranslation()
  const pillars = [ShieldCheck, Compass, Sprout]
  const requestIcons = [GraduationCap, Target, Compass, CheckCircle2]
  const stageIcons = [BookOpen, Compass, Target, GraduationCap]
  return (
    <div className="home-page">
      <div className="home-hero-wrap">
        <section className="container hero home-hero" aria-labelledby="home-title">
          <div className="hero-copy">
            <p className="eyebrow home-location">
              <span className="home-location-dot" aria-hidden="true" />
              {t('landing.place')}
            </p>
            <h1 id="home-title">
              {t('landing.title')} <span>{t('landing.titleAccent')}</span>
            </h1>
            <p className="home-intro">{t('landing.intro')}</p>
            <div className="home-actions">
              <LinkButton to="/tutors">{t('landing.start')}</LinkButton>
              <Link to="/apply" className="home-apply-link">
                {t('landing.apply')} <ArrowUpRight size={18} aria-hidden="true" />
              </Link>
            </div>
          </div>
          <div className="home-hero-visual">
            <figure className="home-hero-figure">
              <div className="home-photo-frame">
                <img
                  className="home-hero-image"
                  src="/images/purnea-learning-1200.webp"
                  srcSet="/images/purnea-learning-640.webp 640w, /images/purnea-learning-960.webp 960w, /images/purnea-learning-1200.webp 1200w, /images/purnea-learning-1536.webp 1536w"
                  sizes="(max-width: 760px) calc(100vw - 40px), (max-width: 1000px) 680px, 520px"
                  width={1536}
                  height={1024}
                  fetchPriority="high"
                  alt={t('landing.imageAlt')}
                />
              </div>
            </figure>
          </div>
        </section>
      </div>

      <section className="container home-pillars" aria-label={t('landing.pillars')}>
        {pillars.map((Icon, i) => (
          <div className="home-pillar" key={i}>
            <span className="home-pillar-icon">
              <Icon size={24} strokeWidth={1.5} aria-hidden="true" />
            </span>
            <div>
              <h2>{t(`landing.pillar${i + 1}`)}</h2>
              <p>{t(`landing.pillar${i + 1}Body`)}</p>
            </div>
          </div>
        ))}
      </section>

      <section className="home-process home-section" aria-labelledby="home-process-title">
        <div className="container">
          <div className="home-section-heading">
            <div>
              <p className="eyebrow">{t('landing.processEyebrow')}</p>
              <h2 id="home-process-title">{t('landing.processTitle')}</h2>
            </div>
          </div>
          <ol className="home-steps">
            {[1, 2, 3].map((n) => (
              <li key={n}>
                <div className="home-step-top">
                  <span className="home-step-number" aria-hidden="true">
                    0{n}
                  </span>
                  <span className="eyebrow">{t(`landing.step${n}Label`)}</span>
                </div>
                <div className={`home-step-art home-step-art-${n}`} aria-hidden="true">
                  {n === 1 ? (
                    <div className="home-note-art">
                      <span />
                      <i />
                      <i />
                      <i />
                      <Check size={26} />
                    </div>
                  ) : n === 2 ? (
                    <>
                      <span className="home-person-art">
                        <GraduationCap size={34} strokeWidth={1.3} />
                      </span>
                      <span className="home-match-line" />
                      <span className="home-person-art">
                        <BookOpen size={31} strokeWidth={1.3} />
                      </span>
                      <span className="home-match-seal">
                        <Check size={18} />
                      </span>
                    </>
                  ) : (
                    <div className="home-growth-art">
                      <i />
                      <i />
                      <i />
                      <Sprout size={45} strokeWidth={1.2} />
                    </div>
                  )}
                </div>
                <h3>{t(`landing.step${n}Title`)}</h3>
                <p>{t(`landing.step${n}Body`)}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section
        className="container home-section home-learning-stages"
        aria-labelledby="home-stages-title"
      >
        <div className="home-section-heading">
          <div>
            <p className="eyebrow">{t('landing.stagesEyebrow')}</p>
            <h2 id="home-stages-title">{t('landing.stagesTitle')}</h2>
            <p className="home-section-intro">{t('landing.stagesBody')}</p>
          </div>
        </div>
        <div className="home-stage-grid">
          {[1, 2, 3, 4].map((n) => {
            const Icon = stageIcons[n - 1]
            return (
              <article className="home-stage-card" key={n}>
                <div className="home-stage-top">
                  <span className="home-stage-number" aria-hidden="true">
                    0{n}
                  </span>
                  <span className="home-stage-symbol" aria-hidden="true">
                    <Icon size={30} strokeWidth={1.45} />
                  </span>
                </div>
                <div>
                  <p className="eyebrow">{t(`landing.stage${n}Range`)}</p>
                  <h3>{t(`landing.stage${n}Title`)}</h3>
                  <p>{t(`landing.stage${n}Body`)}</p>
                </div>
              </article>
            )
          })}
        </div>
      </section>

      <section className="container home-request" aria-labelledby="home-request-title">
        <div className="home-request-copy">
          <p className="eyebrow">{t('landing.requestEyebrow')}</p>
          <h2 id="home-request-title">{t('landing.requestTitle')}</h2>
          <p>{t('landing.requestBody')}</p>
          <LinkButton to="/tutors">{t('landing.start')}</LinkButton>
        </div>
        <div className="home-request-list" aria-label={t('landing.requestListLabel')}>
          {[1, 2, 3, 4].map((n) => {
            const Icon = requestIcons[n - 1]
            return (
              <div className="home-request-item" key={n}>
                <span aria-hidden="true">
                  <Icon size={19} strokeWidth={1.6} />
                </span>
                <div>
                  <strong>{t(`landing.request${n}Title`)}</strong>
                  <p>{t(`landing.request${n}Body`)}</p>
                </div>
              </div>
            )
          })}
        </div>
      </section>

      <section className="container home-story" aria-labelledby="home-story-title">
        <div className="home-story-copy">
          <p className="eyebrow">{t('landing.storyEyebrow')}</p>
          <h2 id="home-story-title">
            {t('landing.storyTitle')} <em>{t('landing.storyAccent')}</em>
          </h2>
          <p>{t('landing.storyBody')}</p>
          <Link className="text-link" to="/approach">
            {t('viewApproach')} <ArrowRight size={18} />
          </Link>
        </div>
        <div className="home-record">
          <div className="home-record-heading">
            <p className="eyebrow">{t('landing.recordEyebrow')}</p>
            <BookOpen size={25} strokeWidth={1.4} aria-hidden="true" />
          </div>
          <h3>{t('landing.recordTitle')}</h3>
          <ol>
            {[1, 2, 3].map((n) => (
              <li key={n}>
                <span className="home-record-number" aria-hidden="true">
                  0{n}
                </span>
                <div>
                  <h4>{t(`landing.record${n}Title`)}</h4>
                  <p>{t(`landing.record${n}Body`)}</p>
                </div>
              </li>
            ))}
          </ol>
          <p className="home-record-footer">
            <LockKeyhole size={15} aria-hidden="true" />
            {t('landing.recordFooter')}
          </p>
        </div>
      </section>

      <section className="container home-section home-faq" aria-labelledby="home-faq-title">
        <div>
          <p className="eyebrow">{t('landing.faqEyebrow')}</p>
          <h2 id="home-faq-title">{t('faqTitle')}</h2>
        </div>
        <div className="home-faq-list">
          {[1, 2, 3].map((n) => (
            <details key={n}>
              <summary>
                {t(`faq${n}`)}
                <span aria-hidden="true">+</span>
              </summary>
              <p>{t(`faq${n}Body`)}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="container home-closing" aria-labelledby="home-closing-title">
        <div className="home-closing-art" aria-hidden="true">
          <div className="home-crystal">
            <i />
            <i />
            <i />
            <i />
          </div>
        </div>
        <div className="home-closing-copy">
          <p className="eyebrow">{t('landing.finalEyebrow')}</p>
          <h2 id="home-closing-title">{t('landing.finalTitle')}</h2>
        </div>
        <div className="home-closing-actions">
          <LinkButton to="/tutors">{t('landing.start')}</LinkButton>
          <div className="home-teach-link">
            <span>{t('landing.teach')}</span>
            <Link to="/apply">
              {t('landing.teachLink')} <ArrowRight size={15} />
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}
export function Search() {
  const { t } = useTranslation()
  const [params, setParams] = useSearchParams()
  const subjects = params.getAll('subject').filter(Boolean)
  const language = params.get('language') ?? ''
  const hasSearched =
    params.get('searched') === '1' ||
    params.has('class') ||
    params.has('mode') ||
    params.has('subject')
  const requestedClass = Number(params.get('class'))
  const classFilter =
    Number.isInteger(requestedClass) && requestedClass >= 1 && requestedClass <= 12
      ? requestedClass
      : null
  const modeFilter = params.get('mode')
  const selectedMode = modeFilter === 'home' || modeFilter === 'online' ? modeFilter : ''
  const timeFilter = params.get('time')?.trim() ?? ''
  const locationText = params.get('locality')?.trim() ?? ''
  const latitude = params.get('latitude') ?? ''
  const longitude = params.get('longitude') ?? ''
  const radiusKm = params.get('radiusKm') ?? '5'
  const modeLabel = selectedMode
    ? t(selectedMode === 'home' ? 'landing.homeMode' : 'landing.onlineMode')
    : t('allModes')
  const query = useQuery({
    queryKey: [
      'tutors',
      subjects,
      language,
      classFilter,
      selectedMode,
      latitude,
      longitude,
      radiusKm,
    ],
    queryFn: ({ signal }) => {
      const request = new URLSearchParams()
      subjects.forEach((subject) => request.append('subject', subject))
      if (language) request.set('language', language)
      if (classFilter) request.set('class', String(classFilter))
      if (selectedMode) request.set('mode', selectedMode)
      if (selectedMode === 'home' && latitude && longitude) {
        request.set('latitude', latitude)
        request.set('longitude', longitude)
        request.set('radiusKm', radiusKm)
      }
      return api<Tutor[]>(`/tutors?${request}`, { signal })
    },
    enabled: hasSearched,
  })
  const results =
    query.data?.filter((tutor) => {
      return !selectedMode || tutorHasMode(tutor, selectedMode)
    }) ?? []
  function filter(key: string, value: string) {
    const next = new URLSearchParams(params)
    if (value) {
      next.set(key, value)
      next.set('searched', '1')
    } else {
      next.delete(key)
    }
    setParams(next)
  }
  function updateSearch(values: Record<string, string | null>) {
    const next = new URLSearchParams(params)
    next.set('searched', '1')
    for (const [key, value] of Object.entries(values)) {
      if (value) next.set(key, value)
      else next.delete(key)
    }
    setParams(next)
  }
  function setSearchLocation(location: StoredLocation | null) {
    if (!location) {
      updateSearch({ latitude: null, longitude: null })
      return
    }
    updateSearch({
      locality: location.address || location.locality || location.city,
      latitude: String(location.latitude),
      longitude: String(location.longitude),
    })
  }
  const fields = (
    <div className="filter-fields">
      <SubjectSelect
        value={subjects}
        onChange={(values) => {
          const next = new URLSearchParams(params)
          next.delete('subject')
          values.forEach((subject) => next.append('subject', subject))
          next.set('searched', '1')
          setParams(next)
        }}
      />
      <Field label={t('preferredLanguage')}>
        <select value={language} onChange={(e) => filter('language', e.target.value)}>
          <option value="">{t('allLanguages')}</option>
          <option value="Hindi">{t('hindi')}</option>
          <option value="English">{t('english')}</option>
        </select>
      </Field>
      <Field label={t('classes')}>
        <select value={classFilter ?? ''} onChange={(e) => filter('class', e.target.value)}>
          <option value="">{t('allClasses')}</option>
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((klass) => (
            <option key={klass} value={klass}>
              {klass}
            </option>
          ))}
        </select>
      </Field>
      <Field label={t('landing.finderModeLabel')}>
        <select value={selectedMode} onChange={(e) => filter('mode', e.target.value)}>
          <option value="">{t('allModes')}</option>
          <option value="home">{t('landing.homeMode')}</option>
          <option value="online">{t('landing.onlineMode')}</option>
        </select>
      </Field>
      {selectedMode === 'home' && (
        <>
          <LocationSearchField
            label={t('parentSearchLocation')}
            value={locationText}
            onChange={(value) => updateSearch({ locality: value, latitude: null, longitude: null })}
            onLocationChange={setSearchLocation}
            maxLength={160}
            hint={t('parentSearchLocationHint')}
          />
          <Field label={t('searchRadius')}>
            <select value={radiusKm} onChange={(e) => filter('radiusKm', e.target.value)}>
              {['2', '5', '10', '15', '25'].map((value) => (
                <option key={value} value={value}>
                  {t('radiusKm', { count: Number(value) })}
                </option>
              ))}
            </select>
          </Field>
        </>
      )}
      <div className="scope-filter">
        {selectedMode === 'home' ? <House size={18} /> : <Monitor size={18} />}
        <div>
          <strong>{t('yourSearch')}</strong>
          <p>
            {classFilter ? `${t('classes')} ${classFilter}` : t('allClasses')}
            {` - ${modeLabel}`}
            {timeFilter ? ` - ${timeFilter}` : ''}
            {selectedMode === 'home' && locationText ? ` - ${locationText}` : ''}
          </p>
        </div>
      </div>
      <Button variant="text" onClick={() => setParams({})}>
        {t('reset')}
      </Button>
    </div>
  )
  if (!hasSearched) {
    return (
      <div className="container section tutor-finder-page">
        <PageHeading title={t('landing.finderTitle')} body={t('searchIntro')} />
        <QuickTutorFinder />
      </div>
    )
  }
  return (
    <div className="container section tutor-results-page">
      <div className="tutor-results-heading">
        <div>
          <p className="eyebrow">{t('teacherResultsEyebrow')}</p>
          <h1>{t('searchTitle')}</h1>
          <p>{t('searchIntro')}</p>
        </div>
        <Link to="/tutors" className="text-link">
          {t('editNeed')} <ArrowRight size={17} />
        </Link>
      </div>
      <div className="search-layout tutor-results-layout">
        <aside className="filter-rail tutor-filter-rail">
          <h2>{t('filters')}</h2>
          {fields}
        </aside>
        <div className="tutor-results-main">
          <div className="results-bar">
            <p aria-live="polite">
              <strong>{query.data ? results.length : '...'}</strong> {t('results')}
            </p>
            <div className="mobile-filters">
              <Modal
                title={t('filters')}
                drawer
                trigger={
                  <Button variant="secondary">
                    <SlidersHorizontal size={18} />
                    {t('filters')}
                  </Button>
                }
              >
                {fields}
              </Modal>
            </div>
          </div>
          <div className="filter-chips">
            {subjects.map((subject) => (
              <Badge key={subject} tone="neutral">
                {subject}
              </Badge>
            ))}
            {classFilter && <Badge tone="neutral">{`${t('classes')} ${classFilter}`}</Badge>}
            {selectedMode && <Badge tone="neutral">{modeLabel}</Badge>}
            {selectedMode === 'home' && locationText && (
              <Badge tone="neutral">{locationText}</Badge>
            )}
            {selectedMode === 'home' && latitude && longitude && (
              <Badge tone="neutral">{t('radiusKm', { count: Number(radiusKm) })}</Badge>
            )}
            {timeFilter && <Badge tone="neutral">{timeFilter}</Badge>}
            {language && (
              <button className="filter-chip" onClick={() => filter('language', '')}>
                {t(language === 'Hindi' ? 'hindi' : 'english')} ?
              </button>
            )}
          </div>
          {query.isPending ? (
            <Loading />
          ) : query.isError ? (
            <LoadError retry={() => void query.refetch()} />
          ) : results.length ? (
            <div className="search-cards">
              {results.map((tutor) => (
                <TutorCard key={tutor.id} tutor={tutor} />
              ))}
            </div>
          ) : (
            <Empty title={t('noTutors')} body={t('noTutorsBody')}>
              <LinkButton to="/match">{t('requestMatch')}</LinkButton>
            </Empty>
          )}
        </div>
      </div>
    </div>
  )
}
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
  const subject = tutor.scope.subject === 'Mathematics' ? t('math') : tutor.scope.subject
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
                  {tutor.publicLocality || t('applicationForm.home')}
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
export function Info({ page }: { page: string }) {
  const { t } = useTranslation()
  const prefix = page === 'how-it-works' ? 'approach' : page
  const title = page === '404' ? 'notFound' : `${prefix}Title`
  const body = page === '404' ? '' : `${prefix}Body`
  return (
    <div className="container section prose-page">
      <p className="eyebrow">{t('brand')}</p>
      <h1>{t(title)}</h1>
      {body && <p className="intro">{t(body)}</p>}
      {page === 'privacy' && <Alert>{t('consentHelp')}</Alert>}
      <LinkButton to={page === '404' ? '/' : '/match'}>
        {t(page === '404' ? 'returnHome' : 'find')}
      </LinkButton>
    </div>
  )
}

function TutorPhotoSymbol({ tutor, large = false }: { tutor: Tutor; large?: boolean }) {
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
export function Showcase() {
  const { t } = useTranslation()
  const [tab, setTab] = useState('controls')
  return (
    <div className="container section">
      <PageHeading title={t('showcaseTitle')} body={t('showcaseBody')} />
      <div className="tabs" role="tablist" aria-label={t('components')}>
        {['controls', 'states'].map((key) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            tabIndex={tab === key ? 0 : -1}
            onClick={() => setTab(key)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                setTab(tab === 'controls' ? 'states' : 'controls')
                ;(
                  e.currentTarget.parentElement?.querySelector(
                    `[aria-selected="false"]`,
                  ) as HTMLElement
                )?.focus()
              }
            }}
          >
            {t(key)}
          </button>
        ))}
      </div>
      <div role="tabpanel" className="panel">
        {tab === 'controls' ? (
          <>
            <div className="button-row">
              <Button>
                {t('save')}
                <ChevronRight size={16} />
              </Button>
              <Button variant="secondary">{t('back')}</Button>
              <Button disabled>{t('unavailable')}</Button>
              <Button busy>{t('saving')}</Button>
            </div>
            <div className="form-grid">
              <Field label={t('name')}>
                <input placeholder={t('name')} />
              </Field>
              <Field label={t('authPassword')} hint={t('authPasswordHint')}>
                <input type="password" autoComplete="new-password" />
              </Field>
              <Field label={t('startTime')}>
                <input type="datetime-local" />
              </Field>
              <Field label={t('subject')}>
                <select>
                  <option>{t('math')}</option>
                </select>
              </Field>
            </div>
            <Modal
              title={t('dialogTitle')}
              description={t('dialogBody')}
              trigger={<Button variant="secondary">{t('dialog')}</Button>}
            >
              <Field label={t('name')}>
                <input />
              </Field>
            </Modal>
            <div className="badge-row">
              <Badge>
                <CheckCircle2 size={14} />
                {t('scoped')}
              </Badge>
              <Badge tone="amber">{t('wait')}</Badge>
              <Badge tone="neutral">{t('draft')}</Badge>
            </div>
          </>
        ) : (
          <>
            <Alert kind="success">{t('actionSuccess')}</Alert>
            <Alert kind="error">{t('actionError')}</Alert>
            <Loading />
            <Empty title={t('empty')} />
          </>
        )}
      </div>
      <div className="showcase-preview">
        <LearningPreview />
      </div>
    </div>
  )
}
