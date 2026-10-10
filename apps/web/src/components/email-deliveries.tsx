import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { api, send, queryClient, indiaDate, type Schema } from '../lib/api'
import { Alert, Button, Field, Loading, LoadError, MutationError } from './ui'

export function EmailDeliveries() {
  const [cursor, setCursor] = useState('')
  const q = useQuery({
    queryKey: ['email-deliveries', cursor],
    queryFn: ({ signal }) =>
      api<Schema['EmailDeliveries']>(
        `/admin/email-deliveries?cursor=${encodeURIComponent(cursor)}`,
        { signal },
      ),
    refetchInterval: 15_000,
  })
  return (
    <section className="tu-panel" aria-labelledby="mail-delivery-title">
      <h2 id="mail-delivery-title">Email delivery log</h2>
      <p>
        Accepted means the SMTP server accepted the email. Inbox delivery is controlled by the
        recipient's mail provider.
      </p>
      {q.isPending ? (
        <Loading />
      ) : q.isError ? (
        <LoadError retry={() => void q.refetch()} />
      ) : (
        <>
          {!q.data.items.length && <p>No email submissions recorded.</p>}
          {q.data.items.map((item) => (
            <Delivery key={item.id} item={item} />
          ))}
          {q.data.nextCursor && (
            <Button variant="secondary" onClick={() => setCursor(q.data.nextCursor)}>
              Next page
            </Button>
          )}
          {cursor && (
            <Button variant="secondary" onClick={() => setCursor('')}>
              First page
            </Button>
          )}
        </>
      )}
    </section>
  )
}
function Delivery({ item }: { item: Schema['EmailDelivery'] }) {
  const [reviewing, setReviewing] = useState(false)
  const [reason, setReason] = useState('')
  const [acknowledge, setAcknowledge] = useState(false)
  const retry = useMutation({
    mutationFn: () =>
      send(`/admin/email-deliveries/${encodeURIComponent(item.id)}/retry`, {
        reason,
        acknowledgeDuplicate: acknowledge,
      }),
    onSuccess: async () => {
      setReviewing(false)
      await queryClient.invalidateQueries({ queryKey: ['email-deliveries'] })
    },
  })
  return (
    <article className="tu-panel">
      <h3>{item.event.replaceAll('_', ' ')}</h3>
      <p>Recipient account: {item.recipientId}</p>
      <p>
        Status: {item.smtpAcceptedAt ? 'SMTP accepted' : item.status} · Attempts: {item.attempts}
      </p>
      {item.smtpAcceptedAt && <p>Accepted: {indiaDate(item.smtpAcceptedAt, 'en')}</p>}
      {item.lastError && <p>Delivery detail: {item.lastError.replaceAll('_', ' ')}</p>}
      {['failed', 'uncertain'].includes(item.status) &&
        item.event !== 'auth_code' &&
        (reviewing ? (
          <form
            onSubmit={(event) => {
              event.preventDefault()
              retry.mutate()
            }}
          >
            {item.status === 'uncertain' && (
              <>
                <Alert>
                  The SMTP acknowledgement was lost. This email may already have arrived.
                </Alert>
                <label>
                  <input
                    type="checkbox"
                    checked={acknowledge}
                    onChange={(event) => setAcknowledge(event.target.checked)}
                    required
                  />{' '}
                  I understand a retry may send a duplicate.
                </label>
              </>
            )}
            <Field label="Reason for retry">
              <textarea
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                minLength={10}
                maxLength={1000}
                required
              />
            </Field>
            <MutationError error={retry.error} />
            <Button type="submit" busy={retry.isPending}>
              Retry email
            </Button>
            <Button type="button" variant="secondary" onClick={() => setReviewing(false)}>
              Cancel
            </Button>
          </form>
        ) : (
          <Button variant="secondary" onClick={() => setReviewing(true)}>
            Review retry
          </Button>
        ))}
      {['failed', 'uncertain'].includes(item.status) && item.event === 'auth_code' && (
        <p>The account holder should request a fresh email code.</p>
      )}
    </article>
  )
}
