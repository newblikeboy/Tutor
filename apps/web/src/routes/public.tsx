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
  MoveUpRight,
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
  return (
    <>
      <section className="container hero">
        <div className="hero-copy">
          <p className="eyebrow">
            <span className="short-line" />
            {t('eyebrow')}
          </p>
          <h1>
            {t('heroA')}
            <br />
            {t('heroB')}
            <br />
            <span>{t('heroC')}</span>
          </h1>
          <p className="hero-body">{t('heroBody')}</p>
          <div className="hero-actions">
            <LinkButton to="/match">{t('find')}</LinkButton>
            <Link to="/tutors" className="text-link">
              {t('browse')}
              <ArrowRight size={17} />
            </Link>
          </div>
          <div className="hero-assurance">
            <ShieldCheck size={19} />
            <span>{t('assessed')}</span>
            <span className="assurance-divider" />
            <span>{t('supported')}</span>
          </div>
        </div>
        <LearningPreview />
      </section>
      <section className="process-section">
        <div className="container">
          <p className="eyebrow">{t('howIntro')}</p>
          <h2>{t('how')}</h2>
          <div className="process-grid">
            {[1, 2, 3].map((n) => (
              <article key={n}>
                <span className="step-number">0{n}</span>
                <h3>{t(`step${n}`)}</h3>
                <p>{t(`step${n}Body`)}</p>
              </article>
            ))}
          </div>
        </div>
      </section>
      <section className="container section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">{t('scoped')}</p>
            <h2>{t('availableTitle')}</h2>
            <p>{t('availableBody')}</p>
          </div>
          <Link to="/tutors" className="text-link">
            {t('viewAll')}
            <ArrowRight size={18} />
          </Link>
        </div>
        {tutors.isPending ? (
          <Loading />
        ) : tutors.isError ? (
          <LoadError retry={() => void tutors.refetch()} />
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
      <section className="continuity-section">
        <div className="container continuity-grid">
          <div className="continuity-visual" aria-hidden="true">
            <div className="book-spine" />
            <BookOpen size={72} strokeWidth={1.2} />
            <div className="continuity-rule" />
            <span>01</span>
            <span>02</span>
            <span>03</span>
            <span>
              <MoveUpRight size={30} />
            </span>
          </div>
          <div>
            <p className="eyebrow">
              <Sprout size={18} />
              {t('continuity')}
            </p>
            <h2>{t('continuousTitle')}</h2>
            <p>{t('continuousBody')}</p>
            <Link className="text-link" to="/approach">
              {t('viewApproach')}
              <ArrowRight size={18} />
            </Link>
          </div>
        </div>
      </section>
      <section className="container section faq-section">
        <h2>{t('faqTitle')}</h2>
        <div>
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
      <section className="container final-cta">
        <div>
          <h2>{t('finalTitle')}</h2>
          <p>{t('finalBody')}</p>
        </div>
        <LinkButton to="/match">{t('find')}</LinkButton>
      </section>
    </>
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
