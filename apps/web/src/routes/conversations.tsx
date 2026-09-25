import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { MessageCircle } from 'lucide-react'
import { api, send, indiaDate, queryClient, type Schema } from '../lib/api'
import {
  Alert,
  Badge,
  Button,
  Empty,
  Field,
  Loading,
  LoadError,
  MutationError,
} from '../components/ui'
import '../styles/tuition.css'
import { useActivePanel } from '../components/workspace-tabs'
export function Conversation({ enrollment }: { enrollment: Schema['Enrollment'] }) {
  const active = useActivePanel()
  const { t, i18n } = useTranslation()
  const [cursor, setCursor] = useState(''),
    [body, setBody] = useState(''),
    [key, setKey] = useState(() => crypto.randomUUID())
  const q = useQuery({
    queryKey: ['messages', enrollment.id, cursor],
    enabled: active,
    queryFn: ({ signal }) =>
      api<Schema['MessagePage']>(
        `/enrollments/${enrollment.id}/messages?cursor=${encodeURIComponent(cursor)}`,
        { signal },
      ),
  })
  const m = useMutation({
    mutationFn: () =>
      send(`/enrollments/${enrollment.id}/messages`, { body }, 'POST', { 'Idempotency-Key': key }),
    onSuccess: async () => {
      setBody('')
      setKey(crypto.randomUUID())
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['messages', enrollment.id] }),
        queryClient.invalidateQueries({ queryKey: ['tuition', enrollment.id] }),
      ])
    },
  })
  return (
    <section className="tu-stack">
      <div className="tu-panel-title">
        <MessageCircle />
        <div>
          <h2>{t('tuition.messages')}</h2>
          <p>{t('tuition.messagesIntro')}</p>
        </div>
      </div>
      {q.isPending ? (
        <Loading />
      ) : q.isError ? (
        <LoadError retry={() => void q.refetch()} />
      ) : (
        <>
          {!q.data.items.length ? (
            <p className="conversation-empty">{t('tuition.noMessages')}</p>
          ) : (
            q.data.items.map((message) => (
              <article className="tu-panel" key={message.id}>
                <div className="tu-card-top">
                  <strong>{message.authorName}</strong>
                  <Badge tone="neutral">{t(`desk.roles.${message.authorRole}`)}</Badge>
                </div>
                <p>{message.body}</p>
                <small>{indiaDate(message.createdAt, i18n.language)}</small>
              </article>
            ))
          )}
          <div className="tu-actions">
            {cursor && (
              <Button variant="secondary" onClick={() => setCursor('')}>
                {t('tuition.firstPage')}
              </Button>
            )}
            {q.data.nextCursor && (
              <Button variant="secondary" onClick={() => setCursor(q.data.nextCursor)}>
                {t('tuition.nextPage')}
              </Button>
            )}
          </div>
        </>
      )}
      {['active', 'paused', 'pending_agreement', 'awaiting_payment'].includes(enrollment.status) ? (
        <form
          className="tu-panel tu-stack"
          onSubmit={(event) => {
            event.preventDefault()
            m.mutate()
          }}
        >
          <Field label={t('tuition.message')}>
            <textarea
              disabled={m.isPending}
              value={body}
              onChange={(e) => {
                setBody(e.target.value)
                m.reset()
              }}
              required
              maxLength={3000}
              rows={4}
            />
          </Field>
          <MutationError error={m.error} />
          {m.isSuccess && <Alert kind="success">{t('tuition.sent')}</Alert>}
          <Button busy={m.isPending}>{t('tuition.sendMessage')}</Button>
        </form>
      ) : (
        <Alert>{t('tuition.closedConversation')}</Alert>
      )}
    </section>
  )
}
export function ActivityUpdates() {
  const { t, i18n } = useTranslation(),
    [cursor, setCursor] = useState('')
  const q = useQuery({
    queryKey: ['notifications', cursor],
    queryFn: ({ signal }) =>
      api<Schema['NotificationPage']>(`/notifications?cursor=${encodeURIComponent(cursor)}`, {
        signal,
      }),
  })
  const m = useMutation({
    mutationFn: (id: string) => send(`/notifications/${encodeURIComponent(id)}/read`, {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  })
  return (
    <div className="tu-page">
      <MutationError error={m.error} />
      {q.isPending ? (
        <Loading />
      ) : q.isError ? (
        <LoadError retry={() => void q.refetch()} />
      ) : (
        <>
          {!q.data.items.length ? (
            <Empty title={t('tuition.noNotifications')} />
          ) : (
            q.data.items.map((n) => (
              <article className="tu-panel" key={n.id}>
                <div className="tu-card-top">
                  <h2>{t(n.kind === 'case_update' ? 'cases.case_update' : `tuition.${n.kind}`)}</h2>
                  {!n.read && <Badge>{t('tuition.unread')}</Badge>}
                </div>
                <p>{indiaDate(n.createdAt, i18n.language)}</p>
                <div className="tu-actions">
                  <Link
                    className="btn secondary"
                    to={
                      n.kind === 'case_update'
                        ? `/cases/${n.targetId}`
                        : `/tuition/${n.targetId}?tab=messages`
                    }
                  >
                    {t(n.kind === 'case_update' ? 'cases.openUpdate' : 'tuition.openConversation')}
                  </Link>
                  {!n.read && (
                    <Button variant="text" busy={m.isPending} onClick={() => m.mutate(n.id)}>
                      {t('tuition.read')}
                    </Button>
                  )}
                </div>
              </article>
            ))
          )}
          <div className="tu-actions">
            {cursor && (
              <Button variant="secondary" onClick={() => setCursor('')}>
                {t('tuition.firstPage')}
              </Button>
            )}
            {q.data.nextCursor && (
              <Button variant="secondary" onClick={() => setCursor(q.data.nextCursor)}>
                {t('tuition.nextPage')}
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  )
}
export { default } from './inbox'
