import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { queryClient, send, type Schema } from '../lib/api'
import { useAuth, useConfig } from '../lib/session'
import { useClock } from '../lib/clock'
import { Alert, Button, Field, MutationError } from './ui'

export function BookingAgreement({ enrollment: en }: { enrollment: Schema['Enrollment'] }) {
  const user = useAuth().data!.user
  const config = useConfig()
  const now = useClock()
  const [agreed, setAgreed] = useState(false)
  const [challenge, setChallenge] = useState('')
  const [code, setCode] = useState('')
  const [sentAt, setSentAt] = useState(0)
  const agreement = en.tutorAgreement!
  const signature = agreement.signature
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['tuition', en.id] })
  const request = useMutation({
    mutationFn: () =>
      send<{ challengeId: string }>(`/enrollments/${encodeURIComponent(en.id)}/signing-code`, {
        accepted: agreed,
        version: en.version,
        documentHash: agreement.documentHash,
      }),
    onSuccess: (data) => {
      setChallenge(data.challengeId)
      setCode('')
      setSentAt(Date.now())
    },
  })
  const sign = useMutation({
    mutationFn: () =>
      send(`/enrollments/${encodeURIComponent(en.id)}/signature`, {
        accepted: agreed,
        version: en.version,
        documentHash: agreement.documentHash,
        challengeId: challenge,
        code,
      }),
    onSuccess: async () => {
      setCode('')
      setChallenge('')
      await refresh()
    },
  })
  const accept = useMutation({
    mutationFn: () =>
      send(`/enrollments/${encodeURIComponent(en.id)}/action`, {
        action: 'accept_booking',
        version: en.version,
      }),
    onSuccess: async () => {
      await Promise.all([
        refresh(),
        queryClient.invalidateQueries({ queryKey: ['tutor-workspace'] }),
        queryClient.invalidateQueries({ queryKey: ['tuition'] }),
      ])
    },
  })
  return (
    <section className="tu-panel tu-stack" aria-label="Tutor booking agreement">
      <div
        className="agreement-document"
        role="region"
        aria-label="Teaching agreement text"
        tabIndex={0}
      >
        <p>
          {agreement.mode === 'home' ? 'Home Tuition (offline)' : 'Online'} · Version{' '}
          {agreement.version}
        </p>
        <h2>{agreement.title}</h2>
        <p>{agreement.body}</p>
        <h3>Privacy conditions</h3>
        <p>{agreement.privacy}</p>
        <h3>Education conditions</h3>
        <p>{agreement.education}</p>
      </div>
      {signature ? (
        <Alert kind="success">
          Signed by {signature.name} ({signature.email}) on{' '}
          {new Date(signature.signedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST
          using email verification.
        </Alert>
      ) : (
        <p>
          This saved agreement applies to this booking. Read the full document and verify a code
          sent to your account email before accepting.
        </p>
      )}
      {user.role === 'tutor' &&
        en.status === 'pending_tutor_acceptance' &&
        (signature ? (
          <Button busy={accept.isPending} onClick={() => accept.mutate()}>
            Accept booking
          </Button>
        ) : (
          <>
            <label className="tu-check">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => {
                  setAgreed(e.target.checked)
                  setCode('')
                }}
              />
              I have read and agree to this booking's responsibilities, privacy conditions and
              education conditions.
            </label>
            {!config.data?.emailEnabled && (
              <Alert kind="error">
                Email signing is unavailable. Contact support to configure email delivery.
              </Alert>
            )}
            <Button
              variant="secondary"
              disabled={!agreed || !config.data?.emailEnabled || now - sentAt < 60000}
              busy={request.isPending}
              onClick={() => request.mutate()}
            >
              {challenge ? 'Resend signing code' : 'Send signing code'}
            </Button>
            {challenge && (
              <form
                className="tu-stack"
                onSubmit={(e) => {
                  e.preventDefault()
                  sign.mutate()
                }}
              >
                <p>Enter the code sent to your account email. It expires after 10 minutes.</p>
                <Field label="Email signing code">
                  <input
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    required
                  />
                </Field>
                <Button disabled={!agreed} busy={sign.isPending}>
                  Verify code and sign agreement
                </Button>
              </form>
            )}
          </>
        ))}
      <MutationError error={request.error || sign.error || accept.error} />
    </section>
  )
}
