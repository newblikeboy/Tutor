import { useEffect, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { APIError, send, type Schema } from '../lib/api'
import { Alert, Button, Field } from './ui'

export function EmailCodeForm({
  purpose,
  email: initialEmail = '',
  onSuccess,
}: {
  purpose: 'login' | 'reset' | 'verify'
  email?: string
  onSuccess: (result: Schema['EmailCodeResult']) => void | Promise<void>
}) {
  const [email, setEmail] = useState(initialEmail)
  const [challenge, setChallenge] = useState<Schema['EmailChallenge']>()
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [validation, setValidation] = useState('')
  const [now, setNow] = useState(() => Date.now())
  const [sentAt, setSentAt] = useState(0)
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])
  const request = useMutation({
    mutationFn: async () => {
      const data = await send<Schema['EmailChallenge']>(
        purpose === 'verify' ? '/account/email/request' : '/auth/email/request',
        purpose === 'verify' ? {} : { email, purpose },
      )
      return { data, receivedAt: Date.now() }
    },
    onSuccess: ({ data, receivedAt }) => {
      setChallenge(data)
      setSentAt(receivedAt)
      setNow(receivedAt)
      setCode('')
      setValidation('')
      confirm.reset()
    },
  })
  const confirm = useMutation({
    mutationFn: () =>
      send<Schema['EmailCodeResult']>(
        purpose === 'verify' ? '/account/email/confirm' : '/auth/email/confirm',
        {
          challengeId: challenge!.challengeId,
          code,
          ...(purpose === 'reset' ? { newPassword: password } : {}),
        },
      ),
    onSuccess,
  })
  const expired = challenge && now >= Date.parse(challenge.expiresAt)
  const resend = Math.max(
    0,
    Math.ceil((sentAt + (challenge?.resendAfterSeconds ?? 60) * 1000 - now) / 1000),
  )
  const error = request.error ?? confirm.error
  return (
    <form
      className="auth-form tu-stack email-code-form"
      onSubmit={(event) => {
        event.preventDefault()
        setValidation('')
        if (!challenge) {
          request.mutate()
          return
        }
        if (!/^\d{6}$/.test(code)) {
          setValidation('Enter the six-digit code from your email.')
          return
        }
        if (
          purpose === 'reset' &&
          (Array.from(password).length < 8 ||
            Array.from(password).length > 128 ||
            password !== confirmation)
        ) {
          setValidation('Use 8 to 128 characters and make sure both passwords match.')
          return
        }
        confirm.mutate()
      }}
    >
      <p>
        {purpose === 'verify'
          ? 'Verify your email address to receive account and class updates.'
          : purpose === 'reset'
            ? 'Use an email code to choose a new password.'
            : 'We will email a code to your registered address.'}
      </p>
      <Field label="Email address">
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
          maxLength={254}
          autoComplete="email"
          readOnly={purpose === 'verify' || !!challenge}
        />
      </Field>
      {challenge && (
        <>
          <Alert>{challenge.message} Check your spam folder too.</Alert>
          <Field label="Email code" hint="Six digits. Each code can be used once.">
            <input
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              required
            />
          </Field>
          {purpose === 'reset' && (
            <>
              <Field label="New password" hint="8 to 128 characters. Avoid common passwords.">
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="new-password"
                  minLength={8}
                  maxLength={128}
                  required
                />
              </Field>
              <Field label="Confirm new password">
                <input
                  type="password"
                  value={confirmation}
                  onChange={(event) => setConfirmation(event.target.value)}
                  autoComplete="new-password"
                  minLength={8}
                  maxLength={128}
                  required
                />
              </Field>
            </>
          )}
          {expired && <Alert kind="error">This code has expired. Request a new code.</Alert>}
        </>
      )}
      {validation && <Alert kind="error">{validation}</Alert>}
      {error && (
        <Alert kind="error">
          {error instanceof APIError ? error.message : 'Unable to connect. Please try again.'}
        </Alert>
      )}
      <Button type="submit" busy={request.isPending || confirm.isPending} disabled={!!expired}>
        {!challenge
          ? 'Send email code'
          : purpose === 'reset'
            ? 'Reset password'
            : purpose === 'verify'
              ? 'Verify email'
              : 'Sign in'}
      </Button>
      {challenge && (
        <div className="auth-help-row">
          <Button
            variant="secondary"
            type="button"
            disabled={resend > 0 || confirm.isPending}
            busy={request.isPending}
            onClick={() => request.mutate()}
          >
            {resend > 0 ? `Resend in ${resend}s` : 'Send a new code'}
          </Button>
          {purpose !== 'verify' && (
            <Button
              variant="secondary"
              type="button"
              onClick={() => {
                setChallenge(undefined)
                setCode('')
                confirm.reset()
                request.reset()
              }}
            >
              Change email
            </Button>
          )}
        </div>
      )}
    </form>
  )
}
