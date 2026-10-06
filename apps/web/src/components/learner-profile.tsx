import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { api, APIError, queryClient, send, type Learner, type Schema } from '../lib/api'
import { workspaceLink } from '../lib/workspace'
import { Alert, Button, Field, Loading, LoadError, MutationError } from './ui'

type Details = Pick<Schema['LearnerDraft'], 'name' | 'class' | 'board' | 'language'>
export function LearnerFields({
  value,
  onChange,
}: {
  value: Details
  onChange: (next: Details) => void
}) {
  const { t } = useTranslation()
  return (
    <>
      <Field label={t('parent.name')}>
        <input
          required
          maxLength={80}
          value={value.name}
          onChange={(e) => onChange({ ...value, name: e.target.value })}
          autoComplete="off"
        />
      </Field>
      <div className="form-grid">
        <Field label={t('class')}>
          <select
            required
            value={value.class || ''}
            onChange={(e) => onChange({ ...value, class: Number(e.target.value) })}
          >
            <option value="" disabled>
              {t('parent.chooseClass')}
            </option>
            {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('board')}>
          <select
            required
            value={value.board}
            onChange={(e) => onChange({ ...value, board: e.target.value as Details['board'] })}
          >
            <option value="" disabled>
              {t('parent.chooseBoard')}
            </option>
            {['CBSE', 'BSEB', 'ICSE'].map((board) => (
              <option key={board}>{board}</option>
            ))}
          </select>
        </Field>
      </div>
      <Field label={t('preferredLanguage')}>
        <select
          required
          value={value.language}
          onChange={(e) => onChange({ ...value, language: e.target.value as Details['language'] })}
        >
          <option value="" disabled>
            {t('parent.chooseLanguage')}
          </option>
          <option value="Hindi">{t('hindi')}</option>
          <option value="English">{t('english')}</option>
        </select>
      </Field>
    </>
  )
}

export function LearnerProfile({ learner }: { learner?: Learner }) {
  const draft = useQuery({
    queryKey: ['learner-draft'],
    queryFn: () => api<Schema['LearnerDraft'] | null>('/learner-draft'),
    enabled: !learner,
    staleTime: 0,
  })
  if (!learner && draft.isPending) return <Loading />
  if (!learner && draft.isError) return <LoadError retry={() => void draft.refetch()} />
  return <ProfileForm key={learner?.id ?? 'new'} learner={learner} initial={draft.data ?? null} />
}

function ProfileForm({
  learner,
  initial,
}: {
  learner?: Learner
  initial: Schema['LearnerDraft'] | null
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [form, setForm] = useState<Schema['LearnerDraft']>(() => ({
    name: learner?.name ?? initial?.name ?? '',
    class: learner?.class ?? initial?.class ?? 0,
    board: (learner?.board as Details['board']) ?? initial?.board ?? '',
    language: (learner?.language as Details['language']) ?? initial?.language ?? '',
    kind: (learner?.kind as Schema['LearnerDraft']['kind']) ?? initial?.kind ?? 'minor',
    consentId: initial?.consentId ?? '',
    step: 2,
    requestId: initial?.requestId ?? crypto.randomUUID(),
    version: initial?.version ?? 0,
  }))
  const [step, setStep] = useState(learner || initial ? 2 : 1)
  const [guardian, setGuardian] = useState(false)
  const [accepted, setAccepted] = useState(false)
  const [relationship, setRelationship] = useState<'parent' | 'legal_guardian'>('parent')
  const [validation, setValidation] = useState(false)
  const [saved, setSaved] = useState(JSON.stringify(form))
  const [draftError, setDraftError] = useState<unknown>(null)
  const [draftBusy, setDraftBusy] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const version = useRef(form.version)
  const pendingDraft = useRef<Promise<void> | null>(null)
  const completed = useRef(false)
  const snapshot = JSON.stringify(form)
  const dirty = snapshot !== saved

  const persist = async (value: Schema['LearnerDraft']) => {
    if (pendingDraft.current) await pendingDraft.current
    const task = (async () => {
      setDraftBusy(true)
      try {
        const result = await send<Schema['LearnerDraft']>(
          '/learner-draft',
          { ...value, version: version.current },
          'PUT',
        )
        version.current = result.version
        setSaved(JSON.stringify(value))
        setDraftError(null)
      } finally {
        setDraftBusy(false)
      }
    })()
    pendingDraft.current = task
    try {
      await task
    } finally {
      if (pendingDraft.current === task) pendingDraft.current = null
    }
  }

  const save = useMutation({
    mutationFn: async () => {
      setValidation(false)
      if (step === 1) {
        if (form.kind === 'minor' && (!guardian || !accepted)) {
          setValidation(true)
          return
        }
        let consentId = ''
        if (form.kind === 'minor') {
          const result = await send<Schema['Consent']>('/consents', {
            relationship,
            accepted: true,
          })
          consentId = result.id
        }
        const next = { ...form, consentId }
        await persist(next)
        setForm(next)
        setStep(2)
        return
      }
      if (!form.name.trim()) {
        setValidation(true)
        return
      }
      let result: Learner
      if (learner) {
        result = await send<Learner>(
          `/learners/${learner.id}`,
          {
            name: form.name,
            class: form.class,
            board: form.board,
            language: form.language,
            expectedVersion: learner.version,
          },
          'PUT',
        )
      } else {
        await persist(form)
        setSubmitted(true)
        try {
          result = await send<Learner>(
            '/learners',
            {
              name: form.name,
              class: form.class,
              board: form.board,
              language: form.language,
              kind: form.kind,
              consentId: form.consentId,
            },
            'POST',
            { 'Idempotency-Key': form.requestId },
          )
        } catch (error) {
          if (
            error instanceof APIError &&
            error.status < 500 &&
            error.code !== 'idempotency_conflict'
          )
            setSubmitted(false)
          throw error
        }
        await send('/learner-draft', { requestId: form.requestId }, 'DELETE')
        queryClient.removeQueries({ queryKey: ['learner-draft'] })
      }
      completed.current = true
      await queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      navigate(workspaceLink('learners', result.id), { replace: true })
    },
  })

  const discard = useMutation({
    mutationFn: async () => {
      if (!window.confirm(t('parent.discardConfirm'))) return
      if (pendingDraft.current) await pendingDraft.current
      await send('/learner-draft', { requestId: form.requestId }, 'DELETE')
      completed.current = true
      queryClient.removeQueries({ queryKey: ['learner-draft'] })
      navigate(workspaceLink('learners'), { replace: true })
    },
  })

  // Only one draft write is in flight. Changes made during it are saved by the next effect.
  useEffect(() => {
    if (
      learner ||
      step !== 2 ||
      !dirty ||
      draftBusy ||
      draftError ||
      save.isPending ||
      discard.isPending
    )
      return
    const timer = window.setTimeout(() => {
      void persist(form).catch(setDraftError)
    }, 600)
    return () => window.clearTimeout(timer)
  })
  useEffect(() => {
    if (!dirty && !draftBusy) return
    const guard = (event: BeforeUnloadEvent) => {
      if (!completed.current) {
        event.preventDefault()
        event.returnValue = ''
      }
    }
    const guardLink = (event: MouseEvent) => {
      const link = event.target instanceof Element ? event.target.closest('a') : null
      if (
        !completed.current &&
        link &&
        link.target !== '_blank' &&
        !window.confirm(t('parent.unsaved'))
      ) {
        event.preventDefault()
        event.stopPropagation()
      }
    }
    window.addEventListener('beforeunload', guard)
    document.addEventListener('click', guardLink, true)
    return () => {
      window.removeEventListener('beforeunload', guard)
      document.removeEventListener('click', guardLink, true)
    }
  }, [dirty, draftBusy, t])

  return (
    <>
      {!learner && (
        <ol className="stepper profile-stepper" aria-label={t('parent.add')}>
          {['guardianStep', 'parent.profile'].map((key, index) => (
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
      )}
      <form
        className="panel wizard-panel"
        onSubmit={(event) => {
          event.preventDefault()
          save.mutate()
        }}
      >
        <h2>{t(learner ? 'parent.edit' : step === 1 ? 'guardianStep' : 'parent.profile')}</h2>
        {validation && <Alert kind="error">{t(step === 1 ? 'consentHelp' : 'required')}</Alert>}
        <fieldset
          className="form-stack"
          disabled={save.isPending || discard.isPending || submitted}
        >
          {step === 1 ? (
            <>
              <fieldset>
                <legend>{t('adultQuestion')}</legend>
                <label className="radio-card">
                  <input
                    type="radio"
                    name="kind"
                    checked={form.kind === 'minor'}
                    onChange={() => setForm({ ...form, kind: 'minor' })}
                  />
                  {t('minorOption')}
                </label>
                <label className="radio-card">
                  <input
                    type="radio"
                    name="kind"
                    checked={form.kind === 'adult_self'}
                    onChange={() => setForm({ ...form, kind: 'adult_self' })}
                  />
                  {t('adultOption')}
                </label>
              </fieldset>
              {form.kind === 'minor' && (
                <>
                  <Field label={t('guardianStep')}>
                    <select
                      value={relationship}
                      onChange={(e) => setRelationship(e.target.value as typeof relationship)}
                    >
                      <option value="parent">{t('parent.relationshipParent')}</option>
                      <option value="legal_guardian">{t('parent.relationshipGuardian')}</option>
                    </select>
                  </Field>
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
                        {t('privacy')}
                      </a>
                    </span>
                  </label>
                </>
              )}
            </>
          ) : (
            <LearnerFields
              value={form}
              onChange={(value) => {
                setForm({ ...form, ...value })
                setDraftError(null)
                setValidation(false)
              }}
            />
          )}
        </fieldset>
        {learner && <p className="fine-print">{t('parent.historical')}</p>}
        {!learner && step === 2 && (
          <p className="fine-print" role="status">
            {draftBusy ? t('parent.draftSaving') : !dirty ? t('parent.draftSaved') : ''}
          </p>
        )}
        <MutationError error={save.error ?? discard.error ?? draftError} />
        {!!draftError && (
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              void persist(form).catch(setDraftError)
            }}
          >
            {t('parent.retryDraft')}
          </Button>
        )}
        <div className="wizard-footer">
          {!learner && step === 2 && (
            <Button
              type="button"
              variant="secondary"
              busy={discard.isPending}
              disabled={save.isPending || draftBusy || submitted}
              onClick={() => discard.mutate()}
            >
              {t('parent.discard')}
            </Button>
          )}
          <Button type="submit" busy={save.isPending} disabled={discard.isPending}>
            {t(learner ? 'parent.saveChanges' : step === 1 ? 'next' : 'parent.saveProfile')}
          </Button>
        </div>
      </form>
    </>
  )
}
