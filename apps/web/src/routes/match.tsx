import { useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { CheckCircle2, LockKeyhole } from 'lucide-react'
import { z } from 'zod'
import { api, queryClient, send } from '../lib/api'
import type { Dashboard, Learner, Requirement, Schema, Tutor } from '../lib/api'
import { useAuth, useDashboard } from '../lib/session'
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
    <div className="container section wizard-container">
      <PageHeading
        eyebrow={t('learningSpace')}
        title={t('requirementHeading')}
        body={t('requirementSub')}
      />
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
  if (q.isPending) return <Loading />
  if (q.isError) return <LoadError retry={() => void q.refetch()} />
  return <Wizard initial={q.data} />
}
function Wizard({ initial }: { initial: Dashboard }) {
  const { t } = useTranslation()
  const [params] = useSearchParams()
  const existingRequest = initial.requirements.find((r) => r.id === params.get('requirement'))
  const [requirement, setRequirement] = useState<Requirement | undefined>(existingRequest)
  const [step, setStep] = useState(initial.draft?.step ?? 1)
  const [learnerId, setLearnerId] = useState(
    initial.draft?.learnerId ?? initial.learners[0]?.id ?? '',
  )
  const [learners, setLearners] = useState(initial.learners)
  const [kind, setKind] = useState<'minor' | 'adult_self'>(
    initial.user.id === 'adult-a' ? 'adult_self' : 'minor',
  )
  const [guardian, setGuardian] = useState(false)
  const [accepted, setAccepted] = useState(false)
  const [consentId, setConsentId] = useState('')
  const [name, setName] = useState('')
  const [classNumber, setClassNumber] = useState(8)
  const [board, setBoard] = useState('CBSE')
  const [language, setLanguage] = useState('Hindi')
  const [goal, setGoal] = useState(initial.draft?.goal ?? '')
  const [locality, setLocality] = useState(initial.draft?.locality ?? 'Purnea')
  const [validation, setValidation] = useState(false)
  const errorRef = useRef<HTMLDivElement>(null)
  const saveDraft = async (next: number, id = learnerId) => {
    await send('/draft', { step: next, learnerId: id, goal, locality }, 'PUT')
    setStep(next)
    void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
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
      setRequirement(result)
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
  const previous = useMutation({ mutationFn: () => saveDraft(step - 1) })
  const learner = learners.find((l) => l.id === learnerId)
  if (requirement)
    return (
      <>
        <Alert kind="success">
          <strong>{t('requirementSent')}</strong>
          <p>{t('requirementSentBody')}</p>
        </Alert>
        <TrialRequest
          requirement={requirement}
          learner={learners.find((l) => l.id === requirement.learnerId)}
          selectedTutor={params.get('tutor') ?? ''}
        />
      </>
    )
  return (
    <>
      <ol className="stepper" aria-label={t('requirementHeading')}>
        {['guardianStep', 'learnerStep', 'reviewStep'].map((key, index) => (
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
      {initial.draft && (
        <p className="saved-indicator">
          <CheckCircle2 size={16} />
          {t('resumeDraft')}
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
          <h2>{t(['guardianStep', 'learnerStep', 'reviewStep'][step - 1])}</h2>
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
                    label={t('learnerName')}
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
                error={validation && goal.trim().length < 10 ? t('required') : undefined}
              >
                <textarea
                  value={goal}
                  onChange={(e) => setGoal(e.target.value)}
                  placeholder={t('goalPlaceholder')}
                  maxLength={1200}
                  aria-invalid={validation && goal.trim().length < 10}
                />
              </Field>
              <Field label={t('locality')} hint={t('localityHelp')}>
                <input
                  value={locality}
                  onChange={(e) => setLocality(e.target.value)}
                  maxLength={120}
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
              <Alert>{t('privacyNote')}</Alert>
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
              {t(step === 3 ? 'submitRequirement' : step === 1 ? 'confirmGuardian' : 'next')}
            </Button>
          </div>
        </form>
        <aside className="wizard-aside">
          <LockKeyhole size={28} />
          <h3>{t('privacyNote')}</h3>
          <p>{t('consentHelp')}</p>
          <p>{t('freeTrialBody')}</p>
        </aside>
      </div>
    </>
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
      send(
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
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
  })
  if (request.isSuccess)
    return (
      <div className="panel">
        <Alert kind="success">{t('requestSent')}</Alert>
        <LinkButton to="/workspace">{t('viewWorkspace')}</LinkButton>
      </div>
    )
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
