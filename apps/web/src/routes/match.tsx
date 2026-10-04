import { useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
  ArrowLeft,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Search,
  ShieldCheck,
  SlidersHorizontal,
} from 'lucide-react'
import { z } from 'zod'
import { api, indiaDate, queryClient, send } from '../lib/api'
import type { Dashboard, Learner, Requirement, Schema, Tutor } from '../lib/api'
import { useAuth, useDashboard } from '../lib/session'
import { tutorHasMode, tutorModeLabel } from '../lib/tutors'
import { workspaceLink } from '../lib/workspace'
import { TrialCard } from '../components/trial-card'
import {
  LocationSearchField,
  type StoredLocation,
} from '../components/location-search'
import { ParentLocationControl } from '../components/parent-location-control'
import { TutorFees } from '../components/tutor-fees'
import '../styles/parent.css'
import {
  Alert,
  Button,
  Field,
  LinkButton,
  Loading,
  LoadError,
  MutationError,
} from '../components/ui'
export default function Match() {
  const { t } = useTranslation()
  const auth = useAuth()
  const [params] = useSearchParams()
  const returnTo = `/match${params.toString() ? `?${params}` : ''}`
  return (
    <div className="container section wizard-container parent-match">
      <Link
        className="text-link parent-match-back"
        to={workspaceLink('overview', params.get('learner'))}
      >
        <ArrowLeft size={16} aria-hidden="true" />
        {t('parent.back')}
      </Link>
      <h1 className="sr-only">{t('parent.start')}</h1>
      {auth.isPending ? (
        <Loading />
      ) : !auth.data ? (
        <div className="panel">
          <p>{t('privacyNote')}</p>
          <LinkButton to={`/login?return=${encodeURIComponent(returnTo)}`}>
            {t('authRequired')}
          </LinkButton>
        </div>
      ) : auth.data.user.role !== 'parent' ? (
        <Alert>{t('permission')}</Alert>
      ) : (
        <MatchData />
      )}
    </div>
  )
}
function MatchData() {
  const q = useDashboard()
  const [params] = useSearchParams()
  if (q.isPending) return <Loading />
  if (q.isError) return <LoadError retry={() => void q.refetch()} />
  return <Wizard key={params.toString()} initial={q.data} />
}
function Wizard({ initial }: { initial: Dashboard }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const existingRequest = initial.requirements.find((r) => r.id === params.get('requirement'))
  const addingLearner = params.get('new') === '1'
  const profileOnly = addingLearner && params.get('profile') === '1'
  const requestedLearner = initial.learners.find((item) => item.id === params.get('learner'))
  const draft =
    !addingLearner && (!params.has('learner') || initial.draft?.learnerId === requestedLearner?.id)
      ? initial.draft
      : undefined
  const initialLearnerId = addingLearner
    ? ''
    : (requestedLearner?.id ?? draft?.learnerId ?? initial.learners[0]?.id ?? '')
  // A new minor's consent is intentionally never recovered from browser storage.
  const [step, setStep] = useState(draft?.learnerId ? draft.step : requestedLearner ? 2 : 1)
  const [learnerId, setLearnerId] = useState(initialLearnerId)
  const [learners, setLearners] = useState(initial.learners)
  const [kind, setKind] = useState<'minor' | 'adult_self'>('minor')
  const [guardian, setGuardian] = useState(false)
  const [accepted, setAccepted] = useState(false)
  const [consentId, setConsentId] = useState('')
  const [name, setName] = useState('')
  const requestedClass = Number(params.get('class'))
  const initialClass =
    Number.isInteger(requestedClass) && requestedClass >= 1 && requestedClass <= 12
      ? requestedClass
      : 8
  const requestedGoal = params.get('goal')?.trim() ?? ''
  const requestedLocality = params.get('locality')?.trim() ?? ''
  const [classNumber, setClassNumber] = useState(initialClass)
  const [board, setBoard] = useState('CBSE')
  const [language, setLanguage] = useState('Hindi')
  const [goal, setGoal] = useState(draft?.goal ?? requestedGoal)
  const [locality, setLocality] = useState((draft?.locality ?? requestedLocality) || 'Purnea')
  const [location, setLocation] = useState<StoredLocation | null>(
    (draft?.location as StoredLocation | null | undefined) ?? null,
  )
  const [validation, setValidation] = useState(false)
  const errorRef = useRef<HTMLDivElement>(null)
  const saveDraft = async (next: number, id = learnerId) => {
    await send('/draft', { step: next, learnerId: id, goal, locality, location }, 'PUT')
    setStep(next)
    await queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    if (id) {
      const updated = new URLSearchParams(params)
      updated.delete('new')
      updated.set('learner', id)
      setParams(updated, { replace: true })
    }
  }
  const next = useMutation({
    mutationFn: async () => {
      setValidation(false)
      if (step === 1) {
        if (learnerId) {
          await saveDraft(2)
          return
        }
        if (kind === 'minor') {
          if (!guardian || !accepted) {
            setValidation(true)
            requestAnimationFrame(() => errorRef.current?.focus())
            return
          }
          if (!consentId) {
            const consent = await send<Schema['Consent']>('/consents', {
              relationship: 'parent',
              accepted: true,
            })
            setConsentId(consent.id)
          }
        }
        if (profileOnly) {
          setStep(2)
          return
        }
        await saveDraft(2)
        return
      }
      if (step === 2) {
        const valid = profileOnly
          ? { success: true }
          : z
              .object({
                goal: z.string().trim().min(10).max(1200),
                locality: z.string().trim().min(2).max(120),
              })
              .safeParse({ goal, locality })
        if (
          !valid.success ||
          (!learnerId && !z.string().trim().min(1).max(80).safeParse(name).success)
        ) {
          setValidation(true)
          requestAnimationFrame(() => errorRef.current?.focus())
          return
        }
        let id = learnerId
        if (!id) {
          const learner = await send<Learner>('/learners', {
            name,
            class: classNumber,
            board,
            language,
            kind,
            consentId,
          })
          id = learner.id
          setLearnerId(id)
          setLearners((old) => [...old, learner])
        }
        if (profileOnly) {
          await queryClient.invalidateQueries({ queryKey: ['dashboard'] })
          navigate(`${workspaceLink('learners', id)}`, { replace: true })
          return
        }
        await saveDraft(3, id)
        return
      }
      const result = await send<Requirement>('/requirements', { learnerId, goal, locality, location })
      await queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      const updated = new URLSearchParams(params)
      updated.delete('new')
      updated.set('learner', learnerId)
      updated.set('requirement', result.id)
      setParams(updated, { replace: true })
    },
  })
  const previous = useMutation({ mutationFn: () => saveDraft(step - 1) })
  const learner = learners.find((l) => l.id === learnerId)
  if (params.has('requirement') && !existingRequest)
    return <Alert>{t('parent.requestMissing')}</Alert>
  const currentTrial =
    existingRequest &&
    initial.trials
      .filter(
        (trial) =>
          trial.requirementId === existingRequest.id &&
          !['cancelled', 'declined'].includes(trial.status),
      )
      .sort((a, b) => b.start.localeCompare(a.start))[0]
  if (currentTrial)
    return (
      <div className="form-stack">
        <h2>{t('parent.nav.sessions')}</h2>
        <TrialCard trial={currentTrial} role="parent" />
        <LinkButton
          to={`${workspaceLink('sessions', currentTrial.learnerId)}&tab=${['completed', 'reviewed'].includes(currentTrial.status) ? 'completed' : 'upcoming'}`}
        >
          {t('parent.allTrials')}
        </LinkButton>
      </div>
    )
  if (existingRequest)
    return (
      <>
        <MatchSteps step={4} />
        <TrialRequest
          requirement={existingRequest}
          learner={learners.find((l) => l.id === existingRequest.learnerId)}
          selectedTutor={params.get('tutor') ?? ''}
        />
      </>
    )
  return (
    <>
      <MatchSteps step={step} profileOnly={profileOnly} />
      {draft && (
        <p className="saved-indicator">
          <CheckCircle2 size={16} />
          {t('parent.saved')}
        </p>
      )}
      <div className="wizard-layout">
        <form
          className="panel wizard-panel"
          onSubmit={(e) => {
            e.preventDefault()
            next.mutate()
          }}
        >
          <h2>
            {t(
              profileOnly
                ? ['guardianStep', 'parent.childProfile'][step - 1]
                : ['parent.who', 'parent.details', 'parent.check'][step - 1],
            )}
          </h2>
          {validation && (
            <div tabIndex={-1} ref={errorRef}>
              <Alert kind="error">{t(step === 1 ? 'consentHelp' : 'invalidFields')}</Alert>
            </div>
          )}
          {step === 1 ? (
            <>
              {learners.length > 0 && (
                <Field label={t('existingLearner')}>
                  <select
                    value={learnerId}
                    onChange={(e) => {
                      setLearnerId(e.target.value)
                      setConsentId('')
                      setGuardian(false)
                      setAccepted(false)
                    }}
                  >
                    {learners.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name} · {t('class')} {l.class}
                      </option>
                    ))}
                    <option value="">{t('newLearner')}</option>
                  </select>
                </Field>
              )}
              {!learnerId && (
                <>
                  <fieldset>
                    <legend className="fine-print">{t('adultQuestion')}</legend>
                    <label className="radio-card">
                      <input
                        type="radio"
                        name="kind"
                        checked={kind === 'minor'}
                        onChange={() => setKind('minor')}
                      />
                      {t('minorOption')}
                    </label>
                    <label className="radio-card">
                      <input
                        type="radio"
                        name="kind"
                        checked={kind === 'adult_self'}
                        onChange={() => setKind('adult_self')}
                      />
                      {t('adultOption')}
                    </label>
                  </fieldset>
                  {kind === 'minor' && (
                    <>
                      <Alert>{t('consentHelp')}</Alert>
                      <label className="check-label">
                        <input
                          type="checkbox"
                          checked={guardian}
                          onChange={(e) => setGuardian(e.target.checked)}
                        />
                        {t('guardian')}
                      </label>
                      <label className="check-label">
                        <input
                          type="checkbox"
                          checked={accepted}
                          onChange={(e) => setAccepted(e.target.checked)}
                        />
                        <span>
                          {t('consent')}{' '}
                          <a className="text-link" href="/privacy" target="_blank" rel="noreferrer">
                            {t('privacy')} ↗
                          </a>
                        </span>
                      </label>
                    </>
                  )}
                </>
              )}
            </>
          ) : step === 2 ? (
            <>
              {!learnerId ? (
                <>
                  <Field
                    label={t('parent.name')}
                    error={validation && !name.trim() ? t('required') : undefined}
                  >
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      maxLength={80}
                      autoComplete="off"
                      aria-invalid={validation && !name.trim()}
                    />
                  </Field>
                  <div className="form-grid">
                    <Field label={t('class')}>
                      <select
                        value={classNumber}
                        onChange={(e) => setClassNumber(Number(e.target.value))}
                      >
                        {[6, 7, 8, 9, 10].map((n) => (
                          <option key={n} value={n}>
                            {n}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label={t('board')}>
                      <select value={board} onChange={(e) => setBoard(e.target.value)}>
                        {['CBSE', 'BSEB', 'ICSE'].map((b) => (
                          <option key={b}>{b}</option>
                        ))}
                      </select>
                    </Field>
                  </div>
                  <Field label={t('preferredLanguage')}>
                    <select value={language} onChange={(e) => setLanguage(e.target.value)}>
                      <option value="Hindi">{t('hindi')}</option>
                      <option value="English">{t('english')}</option>
                    </select>
                  </Field>
                </>
              ) : (
                <p className="saved-indicator">
                  <CheckCircle2 size={17} />
                  {learner?.name} · {t('class')} {learner?.class}
                </p>
              )}
              {!profileOnly && (
                <>
                  <Field
                    label={t('goal')}
                    error={
                      validation && goal.trim().length < 10 ? t('parent.goalError') : undefined
                    }
                  >
                    <textarea
                      value={goal}
                      onChange={(e) => setGoal(e.target.value)}
                      placeholder={t('parent.goalHint')}
                      maxLength={1200}
                      aria-invalid={validation && goal.trim().length < 10}
                    />
                  </Field>
                  <LocationSearchField
                    label={t('locality')}
                    value={locality}
                    onChange={setLocality}
                    onLocationChange={setLocation}
                    maxLength={120}
                    required
                    hint={t('localityHelp')}
                    error={
                      validation && locality.trim().length < 2 ? t('parent.cityError') : undefined
                    }
                  />
                </>
              )}
            </>
          ) : (
            <>
              <dl className="review-list">
                <dt>{t('learner')}</dt>
                <dd>{learner?.name}</dd>
                <dt>{t('class')}</dt>
                <dd>
                  {learner?.class} · {learner?.board}
                </dd>
                <dt>{t('subject')}</dt>
                <dd>
                  {t('math')} · {t('online')}
                </dd>
                <dt>{t('goal')}</dt>
                <dd>{goal}</dd>
                <dt>{t('locality')}</dt>
                <dd>{locality}</dd>
              </dl>
            </>
          )}
          <MutationError error={next.error ?? previous.error} />
          <div className="wizard-footer">
            {step > 1 && (
              <Button
                type="button"
                variant="secondary"
                busy={previous.isPending}
                disabled={next.isPending}
                onClick={() => (profileOnly ? setStep(step - 1) : previous.mutate())}
              >
                {t('back')}
              </Button>
            )}
            <Button type="submit" busy={next.isPending} disabled={previous.isPending}>
              {t(
                profileOnly && step === 2
                  ? 'parent.saveChild'
                  : step === 3
                    ? 'parent.save'
                    : 'next',
              )}
            </Button>
          </div>
        </form>
      </div>
    </>
  )
}
function MatchSteps({ step, profileOnly = false }: { step: number; profileOnly?: boolean }) {
  const { t } = useTranslation()
  const steps = profileOnly
    ? ['guardianStep', 'parent.childProfile']
    : ['parent.who', 'parent.details', 'parent.check', 'parent.tutor']
  return (
    <ol
      className={`stepper ${profileOnly ? 'profile-stepper' : ''}`}
      aria-label={t('parent.start')}
    >
      {steps.map((key, index) => (
        <li
          key={key}
          className={step === index + 1 ? 'active' : ''}
          aria-current={step === index + 1 ? 'step' : undefined}
        >
          <span>{index + 1}</span>
          {t(key)}
        </li>
      ))}
    </ol>
  )
}

function hasUsableCoordinates(
  location: StoredLocation | null | undefined,
): location is StoredLocation {
  return (
    !!location &&
    Number.isFinite(location.latitude) &&
    Number.isFinite(location.longitude) &&
    location.latitude >= -90 &&
    location.latitude <= 90 &&
    location.longitude >= -180 &&
    location.longitude <= 180 &&
    !(location.latitude === 0 && location.longitude === 0)
  )
}

function tutorRequestPath(location: StoredLocation | null | undefined) {
  if (!hasUsableCoordinates(location)) return '/tutors'
  const params = new URLSearchParams({
    latitude: String(location.latitude),
    longitude: String(location.longitude),
  })
  return `/tutors?${params}`
}

function accountLocationKey(location: StoredLocation | null | undefined) {
  if (!hasUsableCoordinates(location)) return 'no-location'
  return `${location.latitude.toFixed(6)},${location.longitude.toFixed(6)}`
}

function compareTutorDistance(a: Tutor, b: Tutor) {
  if (a.distanceKm != null && b.distanceKm != null) return a.distanceKm - b.distanceKm
  if (a.distanceKm != null) return -1
  if (b.distanceKm != null) return 1
  return 0
}

function TrialRequest({
  requirement,
  learner,
  selectedTutor,
}: {
  requirement: Requirement
  learner?: Learner
  selectedTutor: string
}) {
  const { t, i18n } = useTranslation()
  const account = useQuery({
    queryKey: ['account'],
    queryFn: ({ signal }) => api<Schema['Account']>('/account', { signal }),
  })
  const parentLocation = account.data?.preferences.location ?? null
  const tutors = useQuery({
    queryKey: ['tutors', 'request', accountLocationKey(parentLocation)],
    queryFn: ({ signal }) => api<Tutor[]>(tutorRequestPath(parentLocation), { signal }),
    enabled: !account.isPending,
  })
  const [tutorId, setTutorId] = useState(selectedTutor)
  const [start, setStart] = useState('')
  const [terms, setTerms] = useState(false)
  const [search, setSearch] = useState('')
  const [language, setLanguage] = useState('')
  const [mode, setMode] = useState('')
  const [sort, setSort] = useState('recommended')
  const key = useRef(crypto.randomUUID())
  const request = useMutation({
    mutationFn: () =>
      send<Schema['Trial']>(
        '/trials',
        {
          requirementId: requirement.id,
          tutorId,
          start: new Date(start).toISOString(),
          termsAccepted: terms,
        },
        'POST',
        { 'Idempotency-Key': key.current },
      ),
    onSuccess: (trial) => {
      queryClient.setQueryData<Dashboard>(
        ['dashboard'],
        (dashboard) =>
          dashboard && {
            ...dashboard,
            trials: [...dashboard.trials.filter((item) => item.id !== trial.id), trial],
          },
      )
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
  if (account.isPending || tutors.isPending) return <Loading />
  if (tutors.isError) return <LoadError retry={() => void tutors.refetch()} />
  const learnerLanguage = learner?.language ?? ''
  const suitable = tutors.data.filter(
    (v) => !learner || (learner.class >= v.scope.minClass && learner.class <= v.scope.maxClass),
  )
  const visibleTutors = suitable
    .filter((tutor) => {
      const text = search.trim().toLocaleLowerCase()
      const matchesSearch =
        !text ||
        [tutor.name, tutor.approach, tutor.scope.subject]
          .join(' ')
          .toLocaleLowerCase()
          .includes(text)
      const matchesLanguage = !language || tutor.language === language
      const matchesMode = !mode || tutorHasMode(tutor, mode)
      return matchesSearch && matchesLanguage && matchesMode
    })
    .sort((a, b) => {
      if (sort === 'distance') return compareTutorDistance(a, b) || a.name.localeCompare(b.name)
      if (sort === 'experience') return b.experience - a.experience || a.name.localeCompare(b.name)
      if (sort === 'review') return a.scope.expiresAt.localeCompare(b.scope.expiresAt)
      const aLanguage = learnerLanguage && a.language === learnerLanguage ? 1 : 0
      const bLanguage = learnerLanguage && b.language === learnerLanguage ? 1 : 0
      return (
        bLanguage - aLanguage ||
        compareTutorDistance(a, b) ||
        b.experience - a.experience ||
        a.name.localeCompare(b.name)
      )
    })
  const selected = suitable.find((tutor) => tutor.id === tutorId)
  const chooseTutor = (id: string) => {
    if (id !== tutorId) {
      setStart('')
      setTerms(false)
    }
    setTutorId(id)
    key.current = crypto.randomUUID()
  }
  return (
    <form
      className="panel form-stack trial-form parent-tutor-choice"
      onSubmit={(e) => {
        e.preventDefault()
        if (!tutorId || !start || !terms) return
        request.mutate()
      }}
    >
      <h2>{t('requestTrial')}</h2>
      <p className="fine-print">{requirement.goal}</p>
      {account.data && <ParentLocationControl account={account.data} />}
      {suitable.length === 0 ? (
        <Alert>{t('noTutorsBody')}</Alert>
      ) : (
        <>
          <section className="parent-tutor-browser" aria-label={t('parentTutorChooserEyebrow')}>
            <div className="parent-tutor-browser-head">
              <div>
                <p className="eyebrow">{t('parentTutorChooserEyebrow')}</p>
              </div>
              <span>
                <ShieldCheck size={17} aria-hidden="true" />
                {t('parentTutorChooserCount', { count: visibleTutors.length })}
              </span>
            </div>
            <div className="parent-tutor-filters" aria-label={t('parentTutorFilters')}>
              <div className="parent-tutor-search">
                <Search size={16} aria-hidden="true" />
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={t('parentTutorSearch')}
                  aria-label={t('parentTutorSearch')}
                />
              </div>
              <label>
                <span>{t('preferredLanguage')}</span>
                <select value={language} onChange={(event) => setLanguage(event.target.value)}>
                  <option value="">{t('allLanguages')}</option>
                  <option value="Hindi">{t('hindi')}</option>
                  <option value="English">{t('english')}</option>
                </select>
              </label>
              <label>
                <span>{t('teacherMode')}</span>
                <select value={mode} onChange={(event) => setMode(event.target.value)}>
                  <option value="">{t('parentTutorAllModes')}</option>
                  <option value="online">{t('online')}</option>
                  <option value="home">{t('applicationForm.home')}</option>
                </select>
              </label>
              <label>
                <span>{t('parentTutorSort')}</span>
                <select value={sort} onChange={(event) => setSort(event.target.value)}>
                  <option value="recommended">{t('parentTutorSortRecommended')}</option>
                  <option value="distance">{t('parentTutorSortDistance')}</option>
                  <option value="experience">{t('parentTutorSortExperience')}</option>
                  <option value="review">{t('parentTutorSortReview')}</option>
                </select>
              </label>
              <button
                type="button"
                className="parent-tutor-reset"
                onClick={() => {
                  setSearch('')
                  setLanguage('')
                  setMode('')
                  setSort('recommended')
                }}
              >
                <SlidersHorizontal size={15} aria-hidden="true" />
                {t('reset')}
              </button>
            </div>
            {visibleTutors.length === 0 ? (
              <Alert>{t('parentTutorNoFilterResults')}</Alert>
            ) : (
              <div className="parent-tutor-grid" role="radiogroup" aria-label={t('selectTutor')}>
                {visibleTutors.map((tutor) => {
                  const isSelected = tutor.id === tutorId
                  const tutorMode = tutorModeLabel(tutor.scope, t)
                  const tutorLanguage = t(tutor.language === 'Hindi' ? 'hindi' : 'english')
                  const experience =
                    tutor.experience > 0
                      ? t('teacherProofExperienceValue', { count: tutor.experience })
                      : t('teacherExperienceNew')
                  const distance =
                    tutor.distanceKm != null
                      ? t('teacherDistanceAway', { distance: tutor.distanceKm.toFixed(1) })
                      : ''
                  const serviceRadius =
                    tutor.serviceRadiusKm > 0
                      ? t('teacherServiceRadius', { count: tutor.serviceRadiusKm })
                      : ''
                  const classFit = learner
                    ? t('parentTutorClassFit', { class: learner.class })
                    : t('scoped')
                  return (
                    <article
                      className={`parent-tutor-option ${isSelected ? 'selected' : ''}`}
                      key={tutor.id}
                    >
                      <label>
                        <input
                          type="radio"
                          name="tutorId"
                          value={tutor.id}
                          checked={isSelected}
                          required
                          onChange={() => chooseTutor(tutor.id)}
                        />
                        <span className="parent-tutor-card-shell">
                          <span className="parent-tutor-card-main">
                            <span className="parent-tutor-card-top">
                              <TutorPhoto tutor={tutor} />
                              <span>
                                <small>{tutor.sample ? t('sampleProfile') : t('scoped')}</small>
                                <strong>{tutor.name}</strong>
                                <em>
                                  {tutor.scope.subject === 'Mathematics'
                                    ? t('math')
                                    : tutor.scope.subject}{' '}
                                  - {t('classes')} {tutor.scope.minClass}-{tutor.scope.maxClass}
                                </em>
                              </span>
                            </span>
                            <span className="parent-tutor-meta">
                              <span>{classFit}</span>
                              <span>{tutorMode}</span>
                              <span>{tutorLanguage}</span>
                              <span>{experience}</span>
                              {distance && <span>{distance}</span>}
                              {!distance && tutor.publicLocality && <span>{tutor.publicLocality}</span>}
                              {serviceRadius && <span>{serviceRadius}</span>}
                            </span>
                            <span className="parent-tutor-approach">{tutor.approach}</span>
                            {tutor.introVideoUrl && (
                              <video
                                className="parent-tutor-video"
                                controls
                                preload="metadata"
                                src={tutor.introVideoUrl}
                                aria-label={`${tutor.name} introduction video`}
                              />
                            )}
                            <span className="parent-tutor-review">
                              {t('teacherProofReview')}:{' '}
                              {indiaDate(tutor.scope.expiresAt, i18n.language)}
                            </span>
                          </span>
                          <span className="parent-tutor-card-aside">
                            <span className="parent-tutor-price">
                              <TutorFees plans={tutor.feePlans} />
                            </span>
                          </span>
                        </span>
                      </label>
                      <Link
                        className="text-link parent-tutor-profile-link"
                        to={`/tutors/${tutor.id}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {t('viewCompleteProfile')}
                      </Link>
                      <TutorTrialActions
                        tutor={tutor}
                        selected={isSelected}
                        start={start}
                        terms={terms}
                        pending={request.isPending}
                        error={request.error}
                        onSelect={() => chooseTutor(tutor.id)}
                        onStartChange={(value) => {
                          setStart(value)
                          key.current = crypto.randomUUID()
                        }}
                        onTermsChange={setTerms}
                      />
                    </article>
                  )
                })}
              </div>
            )}
          </section>
          {selected && (
            <Alert kind="success">{t('parentTutorSelected', { name: selected.name })}</Alert>
          )}
        </>
      )}
    </form>
  )
}

function TutorPhoto({ tutor }: { tutor: Tutor }) {
  const [failed, setFailed] = useState(false)
  return (
    <span className="initial-avatar parent-tutor-photo" aria-hidden="true">
      {tutor.photoUrl && !failed ? (
        <img src={tutor.photoUrl} alt="" onError={() => setFailed(true)} />
      ) : (
        tutor.name.slice(0, 1)
      )}
    </span>
  )
}

function TutorTrialActions({
  tutor,
  selected,
  start,
  terms,
  pending,
  error,
  onSelect,
  onStartChange,
  onTermsChange,
}: {
  tutor: Tutor
  selected: boolean
  start: string
  terms: boolean
  pending: boolean
  error: unknown
  onSelect: () => void
  onStartChange: (value: string) => void
  onTermsChange: (value: boolean) => void
}) {
  const { t, i18n } = useTranslation()
  const [pickedDate, setPickedDate] = useState('')
  const [calendarMonth, setCalendarMonth] = useState(() => startOfMonth(new Date()))
  const availability = useQuery({
    queryKey: ['availability', tutor.id, 'trial'],
    queryFn: ({ signal }) =>
      api<Schema['Availability']>(`/tutors/${tutor.id}/availability`, { signal }),
    enabled: selected,
  })
  if (!selected) {
    return (
      <div className="parent-tutor-actions compact">
        <Button
          type="button"
          variant="secondary"
          className="parent-tutor-book"
          onClick={onSelect}
        >
          {t('bookTrial')}
        </Button>
      </div>
    )
  }
  if (availability.isPending) {
    return (
      <div className="parent-tutor-actions">
        <Loading />
      </div>
    )
  }
  if (availability.isError) {
    return (
      <div className="parent-tutor-actions">
        <LoadError retry={() => void availability.refetch()} />
      </div>
    )
  }
  const selectedDate = pickedDate || start.slice(0, 10)
  const slots = selectedDate ? trialSlotsForDate(availability.data, selectedDate) : []
  const selectedMinute =
    selectedDate && start.startsWith(`${selectedDate}T`) ? timeToMinute(start.slice(11, 16)) : -1
  const selectedStillAvailable =
    !!selectedDate && selectedMinute >= 0 && slotAvailable(availability.data, selectedDate, selectedMinute)
  const calendarWeeks = trialCalendarWeeks(calendarMonth)
  const todayMonth = startOfMonth(new Date())
  const latest = new Date()
  latest.setMonth(latest.getMonth() + 1)
  const latestMonth = startOfMonth(latest)
  const canGoPrevious = calendarMonth > todayMonth
  const canGoNext = calendarMonth < latestMonth
  const monthLabel = new Intl.DateTimeFormat('en-IN', {
    month: 'long',
    year: 'numeric',
  }).format(calendarMonth)
  return (
    <div className="parent-tutor-actions">
      <div className="parent-trial-picker">
        <div>
          <p className="eyebrow">{t('availabilityCalendar')}</p>
          <p className="hint">{t('availabilityCalendarHint')}</p>
        </div>
        {availability.data.paused || !availability.data.windows.length ? (
          <Alert>{t('tuition.noAvailabilityBody')}</Alert>
        ) : (
          <>
            <div className="parent-trial-calendar-box" aria-label={t('availabilityDates')}>
              <div className="parent-trial-calendar-head">
                <button
                  type="button"
                  className="icon-button"
                  onClick={() => setCalendarMonth(addMonths(calendarMonth, -1))}
                  disabled={!canGoPrevious}
                  aria-label={t('back')}
                >
                  <ChevronLeft size={17} aria-hidden="true" />
                </button>
                <strong>{monthLabel}</strong>
                <button
                  type="button"
                  className="icon-button"
                  onClick={() => setCalendarMonth(addMonths(calendarMonth, 1))}
                  disabled={!canGoNext}
                  aria-label={t('next')}
                >
                  <ChevronRight size={17} aria-hidden="true" />
                </button>
              </div>
              <div className="parent-trial-weekdays" aria-hidden="true">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                  <span key={day}>{day}</span>
                ))}
              </div>
              <div className="parent-trial-calendar" role="grid">
                {calendarWeeks.flat().map((date, index) => {
                  if (!date) return <span className="trial-date empty" key={`empty-${index}`} />
                  const value = dateInputValue(date)
                  const inMonth = date.getMonth() === calendarMonth.getMonth()
                  const inRange = trialDateInRange(value)
                  const available = inMonth && inRange && hasTrialSlot(availability.data, value)
                  const unavailable = inMonth && inRange && !available
                  return (
                    <button
                      type="button"
                      key={value}
                      role="gridcell"
                      className={`trial-date ${available ? 'available' : ''} ${
                        unavailable ? 'unavailable' : ''
                      } ${selectedDate === value ? 'selected' : ''}`}
                      onClick={() => {
                        if (!available) return
                        setPickedDate(value)
                        if (!start.startsWith(`${value}T`)) onStartChange('')
                      }}
                      disabled={!available}
                    >
                      <strong>{date.getDate()}</strong>
                    </button>
                  )
                })}
              </div>
            </div>
            {selectedDate ? (
              <div>
                <p className="parent-trial-section-label">{t('availabilityTimes')}</p>
                <div className="parent-trial-times" aria-label={t('availabilityTimes')}>
                  {slots.map((slot) => (
                    <button
                      type="button"
                      key={slot.minute}
                      className={`trial-time ${slot.available ? 'available' : 'unavailable'} ${
                        selectedMinute === slot.minute ? 'selected' : ''
                      }`}
                      disabled={!slot.available}
                      onClick={() => onStartChange(`${selectedDate}T${slot.label}`)}
                    >
                      {formatTrialTime(slot.label, i18n.language)}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <p className="parent-trial-section-label">{t('availabilityPickDate')}</p>
            )}
          </>
        )}
      </div>
      <Alert>{t('termsBody')}</Alert>
      <label className="check-label">
        <input
          type="checkbox"
          checked={terms}
          onChange={(event) => onTermsChange(event.target.checked)}
          required
        />
        {t('terms')}
      </label>
      <MutationError error={error} />
      <Button type="submit" busy={pending} disabled={!selectedStillAvailable || !terms}>
        {t('bookTrial')}
      </Button>
    </div>
  )
}

function trialSlotsForDate(availability: Schema['Availability'], date: string) {
  const starts = new Set<number>()
  for (let minute = 6 * 60; minute <= 21 * 60; minute += 30) starts.add(minute)
  for (const window of availability.windows) {
    if (window.day !== weekdayForDate(date)) continue
    const first = Math.ceil(window.startMinute / 30) * 30
    const last = window.endMinute - 60
    for (let minute = first; minute <= last; minute += 30) starts.add(minute)
  }
  return Array.from(starts)
    .sort((a, b) => a - b)
    .map((minute) => ({
      minute,
      label: minuteLabel(minute),
      available: slotAvailable(availability, date, minute),
    }))
}

function startOfMonth(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), 1)
}

function addMonths(value: Date, months: number) {
  return new Date(value.getFullYear(), value.getMonth() + months, 1)
}

function trialCalendarWeeks(month: Date) {
  const first = startOfMonth(month)
  const days = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate()
  const cells: Array<Date | null> = Array.from({ length: first.getDay() }, () => null)
  for (let day = 1; day <= days; day += 1) {
    cells.push(new Date(first.getFullYear(), first.getMonth(), day))
  }
  while (cells.length % 7 !== 0) cells.push(null)
  const weeks: Array<Array<Date | null>> = []
  for (let index = 0; index < cells.length; index += 7) weeks.push(cells.slice(index, index + 7))
  return weeks
}

function trialDateInRange(value: string) {
  const date = localDateTime(value, 12 * 60)
  if (!date) return false
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const latest = new Date(today)
  latest.setMonth(latest.getMonth() + 1)
  return date >= today && date <= latest
}

function hasTrialSlot(availability: Schema['Availability'], date: string) {
  return trialSlotsForDate(availability, date).some((slot) => slot.available)
}

function slotAvailable(availability: Schema['Availability'], date: string, minute: number) {
  if (availability.paused || availability.leaveDates.includes(date)) return false
  const start = localDateTime(date, minute)
  const end = localDateTime(date, minute + 60)
  const now = new Date()
  const latest = new Date(now)
  latest.setMonth(latest.getMonth() + 1)
  if (!start || !end || start <= new Date(now.getTime() + 5 * 60 * 1000) || start > latest) {
    return false
  }
  return availability.windows.some(
    (window) =>
      window.day === weekdayForDate(date) &&
      minute >= window.startMinute &&
      minute + 60 <= window.endMinute,
  )
}

function dateInputValue(value: Date) {
  return [
    value.getFullYear(),
    String(value.getMonth() + 1).padStart(2, '0'),
    String(value.getDate()).padStart(2, '0'),
  ].join('-')
}

function weekdayForDate(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day).getDay()
}

function localDateTime(date: string, minute: number) {
  const [year, month, day] = date.split('-').map(Number)
  return new Date(year, month - 1, day, Math.floor(minute / 60), minute % 60)
}

function minuteLabel(minute: number) {
  return `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(
    2,
    '0',
  )}`
}

function timeToMinute(value: string) {
  const [hour, minute] = value.split(':').map(Number)
  return hour * 60 + minute
}

function formatTrialTime(value: string, language: string) {
  const [hour, minute] = value.split(':').map(Number)
  const date = new Date(2000, 0, 1, hour, minute)
  return new Intl.DateTimeFormat(language === 'hi' ? 'hi-IN' : 'en-IN', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}
