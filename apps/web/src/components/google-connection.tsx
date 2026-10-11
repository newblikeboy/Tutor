import { useMutation, useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { CalendarDays, Link2, Unplug } from 'lucide-react'
import { APIError, api, send, queryClient, type Schema } from '../lib/api'
import { Alert, Button, Loading, LoadError } from './ui'
import '../styles/google-interviews.css'
import { useAuth } from '../lib/session'
import { Link } from 'react-router-dom'

export function GoogleError({ error }: { error: unknown }) {
  return error ? (
    <Alert kind="error">
      {error instanceof APIError ? error.message : 'The request could not be completed. Try again.'}
    </Alert>
  ) : null
}
export function GoogleConnection() {
  const auth = useAuth()
  const teaching = auth.data?.user.role === 'tutor'
  const [params, setParams] = useSearchParams()
  const query = useQuery({
    queryKey: ['google', auth.data?.user.id],
    queryFn: ({ signal }) => api<Schema['GoogleConnection']>('/integrations/google', { signal }),
    refetchOnWindowFocus: true,
    refetchInterval: (query) =>
      query.state.data?.revocationStatus === 'pending' ||
      query.state.data?.revocationStatus === 'processing'
        ? 2000
        : false,
  })
  const connect = useMutation({
    mutationFn: () => send<Schema['GoogleAuthorization']>('/integrations/google/connect', {}),
    onSuccess: ({ url }) => window.location.assign(url),
  })
  const disconnect = useMutation({
    mutationFn: () => send('/integrations/google/disconnect', {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['google'] }),
  })
  const revokeRetry = useMutation({
    mutationFn: () => send('/integrations/google/revoke/retry', {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['google'] }),
  })
  if (query.isPending) return <Loading />
  if (query.isError) return <LoadError retry={() => void query.refetch()} />
  if (!query.data.enabled) return null
  const status = query.data.status
  const outcome = params.get('google')
  const outcomes: Record<string, string> = {
    connected: 'Google account connected.',
    denied: 'Google connection was cancelled.',
    invalid_state:
      'The Google connection request expired or belongs to another sign-in. Start again.',
    consent_required: 'Allow Calendar and email access, including offline access, to connect.',
    failed: 'Google connection could not be confirmed. Try again.',
    account_conflict: 'Use the original Google account while interviews need synchronization.',
  }
  return (
    <section className="staff-panel google-connection" aria-labelledby="google-connection-title">
      <div className="google-connection-main">
        <CalendarDays size={24} aria-hidden="true" />
        <div>
          <h2 id="google-connection-title">
            {status === 'connected' ? 'Google Account Connected' : 'Google Calendar & Meet'}
          </h2>
          {query.data.email && <p className="google-connected-email">{query.data.email}</p>}
          <p>
            {status === 'connected'
              ? teaching
                ? 'Host lessons in your calendar. Parents join from their GoCoaching account.'
                : 'Schedule interviews in your calendar. Tutors join from their GoCoaching account.'
              : status === 'reconnect_required'
                ? 'Google authorization needs renewal. Reconnect before scheduling.'
                : status === 'unavailable'
                  ? 'Google availability could not be verified. Check again before scheduling.'
                  : teaching
                    ? 'Connect your Google account to host online lessons with Google Meet.'
                    : 'Connect your Google account to create tutor interview meetings.'}
          </p>
        </div>
      </div>
      <div className="button-row">
        {status === 'connected' ? (
          <Button
            variant="secondary"
            busy={disconnect.isPending}
            onClick={() => disconnect.mutate()}
          >
            <Unplug size={16} aria-hidden="true" />
            Disconnect
          </Button>
        ) : query.data.revocationStatus ? (
          query.data.revocationStatus === 'failed' ? (
            <Button busy={revokeRetry.isPending} onClick={() => revokeRetry.mutate()}>
              Retry Google disconnection
            </Button>
          ) : (
            <p role="status">Confirming disconnection with Google…</p>
          )
        ) : (
          <Button busy={connect.isPending} onClick={() => connect.mutate()}>
            <Link2 size={16} aria-hidden="true" />
            {status === 'reconnect_required'
              ? 'Reconnect Google Account'
              : 'Connect Google Account'}
          </Button>
        )}
        {status === 'unavailable' && (
          <Button variant="secondary" onClick={() => void query.refetch()}>
            Check again
          </Button>
        )}
        {(status === 'reconnect_required' || status === 'unavailable') && query.data.email && (
          <Button
            variant="secondary"
            busy={disconnect.isPending}
            onClick={() => disconnect.mutate()}
          >
            <Unplug size={16} aria-hidden="true" />
            Disconnect
          </Button>
        )}
      </div>
      {outcome && outcomes[outcome] && (
        <div className="google-connection-outcome">
          <Alert kind={outcome === 'connected' ? 'success' : 'error'}>{outcomes[outcome]}</Alert>
          <Button
            variant="secondary"
            onClick={() => {
              const next = new URLSearchParams(params)
              next.delete('google')
              setParams(next, { replace: true })
            }}
          >
            Dismiss
          </Button>
        </div>
      )}
      <GoogleError error={connect.error || disconnect.error || revokeRetry.error} />
      {teaching && <GoogleLessonRecovery />}
    </section>
  )
}

function GoogleLessonRecovery() {
  const query = useQuery({
    queryKey: ['google', 'lesson-recovery'],
    queryFn: ({ signal }) =>
      api<Schema['GoogleLessonRecoveryList']>('/integrations/google/lessons', { signal }),
    refetchInterval: 15000,
  })
  if (query.isPending) return <Loading />
  if (query.isError) return <LoadError retry={() => void query.refetch()} />
  return query.data.items.map((job) => <GoogleRecoveryRow key={job.id} job={job} />)
}
function GoogleRecoveryRow({ job }: { job: Schema['GoogleLessonRecovery'] }) {
  const path = `/integrations/google/lessons/${encodeURIComponent(job.id)}`
  const review = useMutation({
    mutationFn: () => api<Schema['CalendarReview']>(`${path}/calendar`),
  })
  const retry = useMutation({
    mutationFn: (reviewed?: { calendarETag?: string; calendarMissing?: boolean }) =>
      send(`${path}/retry`, reviewed ?? {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['google'] }),
  })
  return (
    <div className="calendar-review">
      <h3>
        {job.operation === 'delete'
          ? 'Lesson cancellation needs confirmation'
          : 'Lesson meeting needs confirmation'}
      </h3>
      <p>
        {job.lastError === 'google_calendar_conflict'
          ? 'This event changed in Google Calendar. Review it before retrying.'
          : 'Check your Google connection and retry the failed operation.'}
      </p>
      {job.lastError === 'google_calendar_conflict' ? (
        <Button variant="secondary" busy={review.isPending} onClick={() => review.mutate()}>
          Review Calendar changes
        </Button>
      ) : (
        <Button variant="secondary" busy={retry.isPending} onClick={() => retry.mutate(undefined)}>
          Retry Google confirmation
        </Button>
      )}
      {review.data && (
        <>
          {review.data.calendarMissing ? (
            <p>
              Google Calendar no longer contains this event. Confirm to finish its cancellation.
            </p>
          ) : (
            <p>
              Current Calendar time:{' '}
              {new Date(review.data.start ?? '').toLocaleString('en-IN', {
                timeZone: 'Asia/Kolkata',
              })}{' '}
              IST
            </p>
          )}
          {job.operation === 'delete' ? (
            <Button
              busy={retry.isPending}
              onClick={() =>
                retry.mutate({
                  calendarETag: review.data?.etag,
                  calendarMissing: review.data?.calendarMissing,
                })
              }
            >
              Confirm reviewed cancellation & retry
            </Button>
          ) : (
            <Link to={`/workspace?view=${job.lessonKind === 'classes' ? 'tuition' : 'sessions'}`}>
              Open lesson to cancel or reschedule
            </Link>
          )}
        </>
      )}
      <GoogleError error={review.error || retry.error} />
    </div>
  )
}
