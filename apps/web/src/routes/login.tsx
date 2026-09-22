import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { LockKeyhole, ShieldCheck } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { queryClient, send, setCSRF } from '../lib/api'
import type { Schema } from '../lib/api'
import { useAuth, useConfig } from '../lib/session'
import {
  Alert,
  Button,
  Field,
  LinkButton,
  Loading,
  LoadError,
  MutationError,
} from '../components/ui'
const otpSchema = z.object({ code: z.string().regex(/^\d{6}$/) })
const identities = [
  ['parent-a', 'parentA'],
  ['parent-b', 'parentB'],
  ['adult-a', 'adultA'],
  ['tutor-a', 'tutorA'],
  ['tutor-meera', 'tutorMeera'],
] as const
export default function Login() {
  const { t } = useTranslation()
  const auth = useAuth()
  const config = useConfig()
  const [params] = useSearchParams()
  const staff = params.get('staff') === '1'
  const [identity, setIdentity] = useState(staff ? 'mentor-a' : 'parent-a')
  const [challenge, setChallenge] = useState<Schema['Challenge']>()
  const navigate = useNavigate()
  const form = useForm<z.infer<typeof otpSchema>>({
    resolver: zodResolver(otpSchema),
    defaultValues: { code: '' },
  })
  const rawReturn = params.get('return') ?? '/workspace'
  const returnPath = /^\/(workspace|apply|match)(\?|$)/.test(rawReturn) ? rawReturn : '/workspace'
  const request = useMutation({
    mutationFn: () => send<Schema['Challenge']>('/auth/challenges', { identity }),
    onSuccess: (data) => {
      setChallenge(data)
      form.setFocus('code')
    },
  })
  const verify = useMutation({
    mutationFn: (values: z.infer<typeof otpSchema>) =>
      send<Schema['Auth']>('/auth/verify', { challengeId: challenge?.challengeId, ...values }),
    onSuccess: (data) => {
      queryClient.clear()
      setCSRF(data.csrf)
      queryClient.setQueryData(['me'], data)
      navigate(returnPath, { replace: true })
    },
  })
  if (config.isPending)
    return (
      <div className="container section">
        <Loading />
      </div>
    )
  if (config.isError)
    return (
      <div className="container section">
        <LoadError retry={() => void config.refetch()} />
      </div>
    )
  return (
    <div className="container section">
      <div className="auth-layout">
        <div className="auth-copy">
          <p className="eyebrow">
            <LockKeyhole size={18} />
            {t(staff ? 'staff' : 'learningSpace')}
          </p>
          <h1>{t('signTitle')}</h1>
          <p>{t('signBody')}</p>
          <ul className="timeline-list">
            {['assessed', 'supported', 'continuity'].map((key) => (
              <li key={key}>
                <ShieldCheck size={19} />
                <strong>{t(key)}</strong>
              </li>
            ))}
          </ul>
        </div>
        <section className="panel auth-panel">
          {auth.data ? (
            <>
              <h2>{t('workspace')}</h2>
              <p>{auth.data.user.name}</p>
              <LinkButton to={returnPath}>{t('viewWorkspace')}</LinkButton>
            </>
          ) : !config.data.authEnabled ? (
            <Alert>
              {t('unavailable')} · {t('devLoginBody')}
            </Alert>
          ) : (
            <>
              <h2>{t('devLogin')}</h2>
              <Alert>{t('devLoginBody')}</Alert>
              {!challenge ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault()
                    request.mutate()
                  }}
                >
                  <Field label={t('identity')}>
                    <select value={identity} onChange={(e) => setIdentity(e.target.value)}>
                      {(staff
                        ? [
                            ['mentor-a', 'mentorA'],
                            ['admin-a', 'adminA'],
                          ]
                        : identities
                      ).map(([value, label]) => (
                        <option key={value} value={value}>
                          {t(label)}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <MutationError error={request.error} />
                  <Button type="submit" busy={request.isPending}>
                    {t('sendCode')}
                  </Button>
                </form>
              ) : (
                <form onSubmit={form.handleSubmit((values) => verify.mutate(values))}>
                  <div className="code-reveal" data-testid="development-code">
                    {challenge.developmentCode}
                  </div>
                  <Field
                    label={t('code')}
                    hint={t('codeHelp')}
                    error={form.formState.errors.code ? t('failureCode') : undefined}
                  >
                    <input
                      {...form.register('code')}
                      autoComplete="one-time-code"
                      inputMode="numeric"
                      pattern="[0-9]{6}"
                      maxLength={6}
                      aria-invalid={Boolean(form.formState.errors.code)}
                    />
                  </Field>
                  <MutationError error={verify.error} />
                  <Button type="submit" busy={verify.isPending}>
                    {t('verify')}
                  </Button>
                  <Button
                    type="button"
                    variant="text"
                    onClick={() => {
                      setChallenge(undefined)
                      verify.reset()
                      form.reset()
                    }}
                  >
                    {t('switchAccount')}
                  </Button>
                </form>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  )
}
