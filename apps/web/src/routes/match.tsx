import { useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, CheckCircle2 } from 'lucide-react'
import { z } from 'zod'
import { api, queryClient, send } from '../lib/api'
import type { Dashboard, Learner, Requirement, Schema, Tutor } from '../lib/api'
import { useAuth, useDashboard } from '../lib/session'
import { workspaceLink } from '../lib/workspace'
import { TrialCard } from '../components/trial-card'
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
  PageHeading,
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
      <PageHeading title={t('parent.start')} />
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
  const [params, setParams] = useSearchParams()
  const existingRequest = initial.requirements.find((r) => r.id === params.get('requirement'))
  const addingLearner = params.get('new') === '1'
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
  const [classNumber, setClassNumber] = useState(8)
  const [board, setBoard] = useState('CBSE')
  const [language, setLanguage] = useState('Hindi')
  const [goal, setGoal] = useState(draft?.goal ?? '')
  const [locality, setLocality] = useState(draft?.locality ?? 'Purnea')
  const [validation, setValidation] = useState(false)
  const errorRef = useRef<HTMLDivElement>(null)
  const saveDraft = async (next: number, id = learnerId) => {
    await send('/draft', { step: next, learnerId: id, goal, locality }, 'PUT')
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
        await saveDraft(2)
        return
      }
      if (step === 2) {
        const valid = z
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
        await saveDraft(3, id)
        return
      }
      const result = await send<Requirement>('/requirements', { learnerId, goal, locality })
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
      <MatchSteps step={step} />
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
          <h2>{t(['parent.who', 'parent.details', 'parent.check'][step - 1])}</h2>
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
              <Field
                label={t('goal')}
                error={validation && goal.trim().length < 10 ? t('parent.goalError') : undefined}
              >
                <textarea
                  value={goal}
                  onChange={(e) => setGoal(e.target.value)}
                  placeholder={t('parent.goalHint')}
                  maxLength={1200}
                  aria-invalid={validation && goal.trim().length < 10}
                />
              </Field>
              <Field
                label={t('locality')}
                error={validation && locality.trim().length < 2 ? t('parent.cityError') : undefined}
              >
                <input
                  value={locality}
                  onChange={(e) => setLocality(e.target.value)}
                  maxLength={120}
                  aria-invalid={validation && locality.trim().length < 2}
                />
              </Field>
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
                onClick={() => previous.mutate()}
              >
                {t('back')}
              </Button>
            )}
            <Button type="submit" busy={next.isPending} disabled={previous.isPending}>
              {t(step === 3 ? 'parent.save' : 'next')}
            </Button>
          </div>
        </form>
      </div>
    </>
  )
}
function MatchSteps({ step }: { step: number }) {
  const { t } = useTranslation()
  return (
    <ol className="stepper" aria-label={t('parent.start')}>
      {['parent.who', 'parent.details', 'parent.check', 'parent.tutor'].map((key, index) => (
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
function TrialRequest({
  requirement,
  learner,
  selectedTutor,
}: {
  requirement: Requirement
  learner?: Learner
  selectedTutor: string
}) {
  const { t } = useTranslation()
  const tutors = useQuery({
    queryKey: ['tutors', 'request'],
    queryFn: ({ signal }) => api<Tutor[]>('/tutors', { signal }),
  })
  const [tutorId, setTutorId] = useState(selectedTutor)
  const [start, setStart] = useState('')
  const [terms, setTerms] = useState(false)
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
  if (tutors.isPending) return <Loading />
  if (tutors.isError) return <LoadError retry={() => void tutors.refetch()} />
  const suitable = tutors.data.filter(
    (v) => !learner || (learner.class >= v.scope.minClass && learner.class <= v.scope.maxClass),
  )
  return (
    <form
      className="panel form-stack trial-form"
      onSubmit={(e) => {
        e.preventDefault()
        request.mutate()
      }}
    >
      <h2>{t('requestTrial')}</h2>
      <p className="fine-print">{requirement.goal}</p>
      {suitable.length === 0 ? (
        <Alert>{t('noTutorsBody')}</Alert>
      ) : (
        <>
          <Field label={t('selectTutor')}>
            <select
              value={tutorId}
              onChange={(e) => {
                setTutorId(e.target.value)
                key.current = crypto.randomUUID()
              }}
              required
            >
              <option value="">{t('choose')}</option>
              {suitable.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name} · {t('classes')} {v.scope.minClass}–{v.scope.maxClass}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('startTime')} hint={t('timezone')}>
            <input
              type="datetime-local"
              value={start}
              onChange={(e) => {
                setStart(e.target.value)
                key.current = crypto.randomUUID()
              }}
              required
            />
          </Field>
          {tutorId && (
            <TutorFees plans={suitable.find((tutor) => tutor.id === tutorId)?.feePlans} />
          )}
          <Alert>{t('termsBody')}</Alert>
          <label className="check-label">
            <input
              type="checkbox"
              checked={terms}
              onChange={(e) => setTerms(e.target.checked)}
              required
            />
            {t('terms')}
          </label>
          <MutationError error={request.error} />
          <Button type="submit" busy={request.isPending}>
            {t('requestTrial')}
          </Button>
        </>
      )}
    </form>
  )
}
