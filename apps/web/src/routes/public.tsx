import { useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronRight,
  Compass,
  GraduationCap,
  LockKeyhole,
  Monitor,
  ShieldCheck,
  SlidersHorizontal,
  Sprout,
} from 'lucide-react'
import { api, indiaDate } from '../lib/api'
import type { Tutor } from '../lib/api'
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
  return (
    <article className="tutor-card">
      <div className="tutor-card-top">
        <div className="initial-avatar" aria-hidden="true">
          {tutor.name.slice(0, 1)}
        </div>
        <div>
          <span className="overline">{tutor.sample ? t('sampleProfile') : t('scoped')}</span>
          <h3>
            <Link to={`/tutors/${tutor.id}`}>{tutor.name}</Link>
          </h3>
          <p>
            {t('math')} · {t('classes')} {tutor.scope.minClass}–{tutor.scope.maxClass}
          </p>
        </div>
        <ShieldCheck size={22} className="teal" aria-label={t('scoped')} />
      </div>
      <p className="tutor-approach">
        {t('teachingApproach')}: {tutor.sample ? t('step3Body') : tutor.approach}
      </p>
      <div className="tutor-meta">
        <span>
          <Monitor size={15} />
          {t('online')}
        </span>
        <span>{t(tutor.language === 'Hindi' ? 'hindi' : 'english')}</span>
      </div>
      <div className="tutor-bottom">
        <span>{t('freeTrial')}</span>
        <Link to={`/tutors/${tutor.id}`} className="text-link">
          {t('profile')}
          <ArrowRight size={17} />
        </Link>
      </div>
    </article>
  )
}
export function Home() {
  const { t } = useTranslation()
  const tutors = useQuery({
    queryKey: ['tutors', 'home'],
    queryFn: ({ signal }) => api<Tutor[]>('/tutors', { signal }),
  })
  const pillars = [ShieldCheck, Compass, Sprout]
  return (
    <div className="home-page">
      <section className="container hero home-hero" aria-labelledby="home-title">
        <div className="hero-copy">
          <p className="eyebrow home-location">
            <span className="home-location-dot" aria-hidden="true" />
            {t('landing.place')}
          </p>
          <h1 id="home-title">
            {t('landing.title')}
            <span>{t('landing.titleAccent')}</span>
          </h1>
          <p className="home-intro">{t('landing.intro')}</p>
          <div className="home-actions">
            <LinkButton to="/match">{t('landing.start')}</LinkButton>
            <Link to="/tutors" className="text-link">
              {t('landing.explore')} <ArrowRight size={17} />
            </Link>
          </div>
          <p className="home-reassurance">
            <ShieldCheck size={16} aria-hidden="true" />
            {t('landing.reassurance')}
          </p>
        </div>
        <figure className="home-hero-figure">
          <div className="home-photo-frame">
            <img
              className="home-hero-image"
              src="/images/purnea-learning-1200.webp"
              srcSet="/images/purnea-learning-640.webp 640w, /images/purnea-learning-960.webp 960w, /images/purnea-learning-1200.webp 1200w, /images/purnea-learning-1536.webp 1536w"
              sizes="(max-width: 760px) calc(114vw - 46px), (max-width: 1000px) calc(100vw - 80px), (max-width: 1328px) calc(61.5vw - 84px), 733px"
              width={1536}
              height={1024}
              fetchPriority="high"
              alt={t('landing.imageAlt')}
            />
          </div>
          <figcaption className="home-photo-caption">
            <span className="home-photo-icon">
              <BookOpen size={23} strokeWidth={1.5} aria-hidden="true" />
            </span>
            <span>
              <strong>{t('landing.photoTitle')}</strong>
              <span>{t('landing.photoBody')}</span>
            </span>
            <Sprout className="home-photo-sprout" size={32} strokeWidth={1.3} aria-hidden="true" />
          </figcaption>
          <small className="home-image-credit">{t('landing.imageCredit')}</small>
        </figure>
      </section>

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
            <p className="home-section-intro">{t('landing.processBody')}</p>
          </div>
          <ol className="home-steps">
            {[1, 2, 3].map((n) => (
              <li key={n}>
                <div className="home-step-top">
                  <span className="home-step-number" aria-hidden="true">
                    0{n}
                  </span>
                  <span className="eyebrow">{t(`landing.step${n}Label`)}</span>
                  <ArrowRight size={20} aria-hidden="true" />
                </div>
                <h3>{t(`step${n}`)}</h3>
                <p>{t(`step${n}Body`)}</p>
              </li>
            ))}
          </ol>
          <Link to="/how-it-works" className="text-link home-process-link">
            {t('landing.processLink')} <ArrowRight size={17} />
          </Link>
        </div>
      </section>

      <section className="container home-section home-tutors" aria-labelledby="home-tutors-title">
        <div className="home-section-heading">
          <div>
            <p className="eyebrow">{t('landing.tutorEyebrow')}</p>
            <h2 id="home-tutors-title">{t('landing.tutorTitle')}</h2>
            <p className="home-section-intro">{t('landing.tutorBody')}</p>
          </div>
          <Link to="/tutors" className="text-link">
            {t('viewAll')} <ArrowRight size={18} />
          </Link>
        </div>
        {tutors.isPending ? (
          <Loading />
        ) : tutors.isError ? (
          <LoadError
            title={t('landing.tutorsErrorTitle')}
            body={t('landing.tutorsErrorBody')}
            retry={() => void tutors.refetch()}
          />
        ) : tutors.data.length ? (
          <div className="tutor-grid">
            {tutors.data.slice(0, 2).map((v) => (
              <TutorCard key={v.id} tutor={v} />
            ))}
          </div>
        ) : (
          <Empty title={t('noTutors')} body={t('noTutorsBody')}>
            <LinkButton to="/match">{t('requestMatch')}</LinkButton>
          </Empty>
        )}
      </section>

      <section className="container home-story" aria-labelledby="home-story-title">
        <div className="home-story-copy">
          <span className="home-story-icon">
            <Sprout size={30} strokeWidth={1.3} aria-hidden="true" />
          </span>
          <p className="eyebrow">{t('continuity')}</p>
          <h2 id="home-story-title">{t('continuousTitle')}</h2>
          <p>{t('continuousBody')}</p>
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
          <p className="home-section-intro">{t('landing.faqIntro')}</p>
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
        <p className="eyebrow">{t('landing.finalEyebrow')}</p>
        <h2 id="home-closing-title">{t('landing.finalTitle')}</h2>
        <p>{t('landing.finalBody')}</p>
        <LinkButton to="/match">{t('landing.start')}</LinkButton>
        <div className="home-teach-link">
          <span>{t('landing.teach')}</span>
          <Link to="/apply">
            {t('landing.teachLink')} <ArrowRight size={15} />
          </Link>
        </div>
      </section>
    </div>
  )
}
export function Search() {
  const { t } = useTranslation()
  const [params, setParams] = useSearchParams()
  const subject = params.get('subject') ?? 'Mathematics'
  const language = params.get('language') ?? ''
  const query = useQuery({
    queryKey: ['tutors', subject, language],
    queryFn: ({ signal }) =>
      api<Tutor[]>(`/tutors?${new URLSearchParams({ subject, language })}`, { signal }),
  })
  function filter(key: string, value: string) {
    const next = new URLSearchParams(params)
    if (value) {
      next.set(key, value)
    } else {
      next.delete(key)
    }
    setParams(next)
  }
  const fields = (
    <div className="filter-fields">
      <Field label={t('subject')}>
        <select value={subject} onChange={(e) => filter('subject', e.target.value)}>
          <option value="Mathematics">{t('math')}</option>
          <option value="Science">{t('science')}</option>
        </select>
      </Field>
      <Field label={t('preferredLanguage')}>
        <select value={language} onChange={(e) => filter('language', e.target.value)}>
          <option value="">{t('allLanguages')}</option>
          <option value="Hindi">{t('hindi')}</option>
          <option value="English">{t('english')}</option>
        </select>
      </Field>
      <div className="scope-filter">
        <Monitor size={18} />
        <div>
          <strong>{t('online')}</strong>
          <p>{t('classes')} 6–10</p>
        </div>
      </div>
      <Button variant="text" onClick={() => setParams({})}>
        {t('reset')}
      </Button>
    </div>
  )
  return (
    <div className="container section">
      <PageHeading eyebrow={t('scoped')} title={t('searchTitle')} body={t('searchIntro')} />
      <div className="search-layout">
        <aside className="filter-rail">
          <h2>{t('filters')}</h2>
          {fields}
        </aside>
        <div>
          <div className="results-bar">
            <p aria-live="polite">
              <strong>{query.data?.length ?? '—'}</strong> {t('results')}
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
            <Badge tone="neutral">{t(subject === 'Science' ? 'science' : 'math')}</Badge>
            {language && (
              <button className="filter-chip" onClick={() => filter('language', '')}>
                {t(language === 'Hindi' ? 'hindi' : 'english')} ×
              </button>
            )}
          </div>
          {query.isPending ? (
            <Loading />
          ) : query.isError ? (
            <LoadError retry={() => void query.refetch()} />
          ) : query.data.length ? (
            <div className="search-cards">
              {query.data.map((tutor) => (
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
  const { t, i18n } = useTranslation()
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
  return (
    <div className="container section">
      <Link className="back-link" to="/tutors">
        ← {t('browse')}
      </Link>
      <div className="profile-layout">
        <div>
          <div className="profile-header">
            <div className="initial-avatar large">{tutor.name.slice(0, 1)}</div>
            <div>
              <p className="eyebrow">{t('sampleProfile')}</p>
              <h1>{tutor.name}</h1>
              <p>
                {t('math')} · {t('online')} · {t(tutor.language === 'Hindi' ? 'hindi' : 'english')}
              </p>
            </div>
          </div>
          <section className="panel scope-panel">
            <ShieldCheck className="teal" />
            <h2>{t('scopeTitle')}</h2>
            <div className="scope-grid">
              <div>
                <small>{t('subject')}</small>
                <strong>{t('math')}</strong>
              </div>
              <div>
                <small>{t('classes')}</small>
                <strong>
                  {tutor.scope.minClass}–{tutor.scope.maxClass}
                </strong>
              </div>
              <div>
                <small>{t('online')}</small>
                <strong>{t('scoped')}</strong>
              </div>
            </div>
            <p>{t('scopeHelp')}</p>
            <small>
              {t('assessedOn')}: {indiaDate(tutor.assessmentAt, i18n.language)}
            </small>
            <small>
              {t('until')}: {indiaDate(tutor.scope.expiresAt, i18n.language)}
            </small>
          </section>
          <section className="profile-section">
            <h2>{t('teachingApproach')}</h2>
            <p>{tutor.approach}</p>
            <Alert>{t('sampleProfile')}</Alert>
          </section>
          <section className="profile-section">
            <h2>{t('step3')}</h2>
            <p>{t('step3Body')}</p>
          </section>
        </div>
        <aside className="trial-summary panel">
          <span className="summary-icon">
            <GraduationCap size={30} />
          </span>
          <h2>{t('trialTitle')}</h2>
          <p>{t('trialBody')}</p>
          <div className="price">
            <strong>{t('freeTrial')}</strong>
            <span>{t('freeTrialBody')}</span>
          </div>
          <LinkButton to={`/match?tutor=${tutor.id}`}>{t('requestMatch')}</LinkButton>
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
