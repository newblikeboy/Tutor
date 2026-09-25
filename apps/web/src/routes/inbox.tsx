import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, CheckCheck, Inbox as InboxIcon, Mail, PenLine, Send } from 'lucide-react'
import { api, send, queryClient, indiaDate, type Schema, type User } from '../lib/api'
import { useAuth } from '../lib/session'
import { Alert, Badge, Button, Field, Loading, LoadError, MutationError } from '../components/ui'
import { ActivityUpdates } from './conversations'
import '../styles/inbox.css'

const refreshInbox = () => queryClient.invalidateQueries({ queryKey: ['inbox'] })
const url = (folder: string, id = '', cursor = '') =>
  `/notifications?${new URLSearchParams({ folder, ...(id ? { id } : {}), ...(cursor ? { cursor } : {}) })}`
const date = (value: string) => indiaDate(value, 'en')

// Keep message drafts out of the shared mutation cache.
function useInboxMutation<T, V = void>(options: {
  mutationFn: (value: V) => Promise<T>
  onSuccess?: (value: T) => void | Promise<unknown>
}) {
  const mounted = useRef(true),
    pending = useRef(false)
  const [state, setState] = useState<{ isPending: boolean; isError: boolean; error: unknown }>({
    isPending: false,
    isError: false,
    error: null,
  })
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  return {
    ...state,
    reset: () => setState({ isPending: false, isError: false, error: null }),
    mutate: (value: V) => {
      if (pending.current) return
      pending.current = true
      setState({ isPending: true, isError: false, error: null })
      void (async () => {
        try {
          const result = await options.mutationFn(value)
          if (mounted.current) await options.onSuccess?.(result)
          if (mounted.current) setState({ isPending: false, isError: false, error: null })
        } catch (error) {
          if (mounted.current) setState({ isPending: false, isError: true, error })
        } finally {
          pending.current = false
        }
      })()
    },
  }
}

export default function Inbox() {
  const auth = useAuth()
  return auth.data ? <Updates key={auth.data.user.id} user={auth.data.user} /> : <Loading />
}
function Updates({ user }: { user: User }) {
  const { t } = useTranslation()
  const [params] = useSearchParams()
  const allowed = ['admin', 'tutor', 'parent'].includes(user.role)
  const requested = params.get('folder')
  const folder =
    requested && ['inbox', 'unread', 'sent', 'activity'].includes(requested)
      ? requested
      : user.role === 'admin'
        ? 'sent'
        : 'inbox'
  const id = params.get('id') ?? ''
  const compose = params.get('compose') === '1' && ['admin', 'tutor'].includes(user.role)
  const status = useQuery({
    queryKey: ['inbox', 'status', user.id],
    enabled: allowed,
    queryFn: ({ signal }) => api<Schema['InboxStatus']>('/inbox/status', { signal }),
    refetchInterval: 15000,
  })
  if (!allowed)
    return (
      <div className="tu-page">
        <header className="tu-heading">
          <h1>{t('inbox.title')}</h1>
        </header>
        <ActivityUpdates />
      </div>
    )
  return (
    <div className="tu-page inbox-page">
      <header className="tu-heading inbox-heading">
        <div>
          <p className="inbox-eyebrow">
            <Mail size={16} aria-hidden="true" />{' '}
            {t(folder === 'activity' && !compose ? 'inbox.activity' : 'inbox.privateUpdate')}
          </p>
          <h1>{t('inbox.title')}</h1>
          <p>
            {t(
              `inbox.${user.role === 'admin' ? 'adminIntro' : user.role === 'tutor' ? 'tutorIntro' : 'parentIntro'}`,
            )}
          </p>
        </div>
        <div className="inbox-header-actions">
          {user.role !== 'parent' && (
            <Link className="btn primary" to="/notifications?compose=1">
              <PenLine size={17} aria-hidden="true" />
              {t('inbox.compose')}
            </Link>
          )}
        </div>
      </header>
      <nav className="inbox-tabs" aria-label={t('inbox.title')}>
        {user.role !== 'admin' && (
          <Link
            to={url('inbox')}
            aria-current={!compose && ['inbox', 'unread'].includes(folder) ? 'page' : undefined}
          >
            <InboxIcon size={18} aria-hidden="true" />
            {t('inbox.received')}
            {!!status.data?.unreadCount && (
              <span className="inbox-count">{status.data.unreadCount}</span>
            )}
          </Link>
        )}
        {user.role !== 'parent' && (
          <Link to={url('sent')} aria-current={!compose && folder === 'sent' ? 'page' : undefined}>
            <Send size={17} aria-hidden="true" />
            {t('inbox.sent')}
          </Link>
        )}
        <Link
          to={url('activity')}
          aria-current={!compose && folder === 'activity' ? 'page' : undefined}
        >
          {t('inbox.activity')}
        </Link>
      </nav>
      {folder === 'activity' && !compose ? (
        <ActivityUpdates />
      ) : compose ? (
        <Compose user={user} />
      ) : (
        <Mailbox user={user} folder={folder} id={id} cursor={params.get('cursor') ?? ''} />
      )}
    </div>
  )
}
function Compose({ user }: { user: User }) {
  const { t } = useTranslation()
  const [, setParams] = useSearchParams()
  const [search, setSearch] = useState(''),
    [filter, setFilter] = useState(''),
    [role, setRole] = useState(''),
    [cursor, setCursor] = useState('')
  const [selected, setSelected] = useState<Schema['InboxRecipient'] | null>(null)
  const [subject, setSubject] = useState(''),
    [body, setBody] = useState('')
  const prepared = useRef<{ input: Schema['InboxInput']; key: string } | null>(null)
  const recipients = useQuery({
    queryKey: ['inbox', 'recipients', user.id, filter, role, cursor],
    queryFn: ({ signal }) =>
      api<Schema['InboxRecipientPage']>(
        `/inbox/recipients?${new URLSearchParams({ search: filter, role, cursor })}`,
        { signal },
      ),
  })
  const m = useInboxMutation({
    mutationFn: async () => {
      if (!selected) throw new Error('recipient')
      prepared.current ??= {
        input: {
          nonce: crypto.randomUUID(),
          recipientId: selected.id,
          enrollmentId: selected.enrollmentId,
          subject,
          body,
        },
        key: crypto.randomUUID(),
      }
      return send<Schema['InboxUpdate']>('/inbox', prepared.current.input, 'POST', {
        'Idempotency-Key': prepared.current.key,
      })
    },
    onSuccess: async (message) => {
      await refreshInbox()
      setParams({ folder: 'sent', id: message.id, sent: '1' })
    },
  })
  const edit = () => {
    prepared.current = null
    m.reset()
  }
  return (
    <section className="inbox-compose tu-panel">
      <div className="tu-card-top">
        <h2>{t('inbox.compose')}</h2>
        <Link className="btn text" to={url(user.role === 'admin' ? 'sent' : 'inbox')}>
          {t('inbox.cancel')}
        </Link>
      </div>
      <p>{t('inbox.oneWay')}</p>
      {user.role === 'admin' && (
        <form
          className="inbox-recipient-search"
          onSubmit={(e) => {
            e.preventDefault()
            setFilter(search)
            setCursor('')
            setSelected(null)
            edit()
          }}
        >
          <Field label={t('inbox.search')}>
            <input
              type="search"
              value={search}
              maxLength={80}
              disabled={m.isPending}
              onChange={(e) => setSearch(e.target.value)}
            />
          </Field>
          <Field label={t('inbox.role')}>
            <select
              value={role}
              disabled={m.isPending}
              onChange={(e) => {
                setRole(e.target.value)
                setCursor('')
                setSelected(null)
                edit()
              }}
            >
              <option value="">{t('inbox.everyone')}</option>
              <option value="parent">{t('inbox.parent')}</option>
              <option value="tutor">{t('inbox.tutor')}</option>
            </select>
          </Field>
          <Button variant="secondary" disabled={m.isPending}>
            {t('inbox.searchButton')}
          </Button>
        </form>
      )}
      {user.role === 'tutor' && <p>{t('inbox.assignedHelp')}</p>}
      {recipients.isPending ? (
        <Loading />
      ) : recipients.isError ? (
        <LoadError retry={() => void recipients.refetch()} />
      ) : (
        <>
          <Field label={t('inbox.recipient')}>
            <select
              value={selected ? `${selected.id}|${selected.enrollmentId}` : ''}
              disabled={m.isPending}
              onChange={(e) => {
                setSelected(
                  recipients.data.items.find(
                    (item) => `${item.id}|${item.enrollmentId}` === e.target.value,
                  ) ?? null,
                )
                edit()
              }}
            >
              <option value="">
                {t(recipients.data.items.length ? 'inbox.pick' : 'inbox.noRecipients')}
              </option>
              {recipients.data.items.map((person) => (
                <option
                  key={`${person.id}|${person.enrollmentId}`}
                  value={`${person.id}|${person.enrollmentId}`}
                >
                  {person.name} · {t(`inbox.roles.${person.role}`)}
                  {person.sample ? ` · ${t('inbox.sample')}` : ''}
                  {person.enrollmentId ? ` · ${person.enrollmentId.slice(-6)}` : ''}
                </option>
              ))}
            </select>
          </Field>
          <div className="tu-actions">
            {cursor && (
              <Button
                variant="text"
                disabled={m.isPending}
                onClick={() => {
                  setCursor('')
                  setSelected(null)
                  edit()
                }}
              >
                {t('inbox.firstRecipients')}
              </Button>
            )}
            {recipients.data.nextCursor && (
              <Button
                variant="text"
                disabled={m.isPending}
                onClick={() => {
                  setCursor(recipients.data.nextCursor)
                  setSelected(null)
                  edit()
                }}
              >
                {t('inbox.nextRecipients')}
              </Button>
            )}
          </div>
        </>
      )}
      <form
        className="tu-stack"
        onSubmit={(e) => {
          e.preventDefault()
          m.mutate()
        }}
      >
        <Field label={t('inbox.subject')} hint={t('inbox.subjectHint')}>
          <input
            value={subject}
            maxLength={120}
            required
            disabled={m.isPending}
            onChange={(e) => {
              setSubject(e.target.value)
              edit()
            }}
          />
        </Field>
        <Field label={t('inbox.message')} hint={t('inbox.messageHint')}>
          <textarea
            value={body}
            rows={7}
            maxLength={3000}
            required
            disabled={m.isPending}
            onChange={(e) => {
              setBody(e.target.value)
              edit()
            }}
          />
        </Field>
        <MutationError error={m.error} />
        <div className="tu-actions">
          <Button busy={m.isPending} disabled={!selected || !subject.trim() || !body.trim()}>
            <Send size={16} aria-hidden="true" />
            {t('inbox.send')}
          </Button>
        </div>
      </form>
    </section>
  )
}
function Mailbox({
  user,
  folder,
  id,
  cursor,
}: {
  user: User
  folder: string
  id: string
  cursor: string
}) {
  const { t } = useTranslation()
  const q = useQuery({
    queryKey: ['inbox', 'messages', user.id, folder, cursor],
    queryFn: ({ signal }) =>
      api<Schema['InboxPage']>(`/inbox?${new URLSearchParams({ folder, cursor })}`, { signal }),
    refetchInterval: 15000,
  })
  const isSent = folder === 'sent'
  return (
    <div className={`inbox-layout ${id ? 'has-message' : ''}`}>
      <section className="inbox-list" aria-label={t(isSent ? 'inbox.sent' : 'inbox.received')}>
        <div className="inbox-list-heading">
          <h2>{t(isSent ? 'inbox.sent' : 'inbox.received')}</h2>
          {!isSent && (
            <Link to={url(folder === 'unread' ? 'inbox' : 'unread')}>
              {t(folder === 'unread' ? 'inbox.all' : 'inbox.unreadOnly')}
            </Link>
          )}
        </div>
        {q.isPending ? (
          <Loading />
        ) : q.isError ? (
          <LoadError retry={() => void q.refetch()} />
        ) : (
          <>
            {!q.data.items.length && (
              <div className="inbox-empty">
                <InboxIcon size={30} aria-hidden="true" />
                <h3>{t(isSent ? 'inbox.emptySent' : 'inbox.empty')}</h3>
                <p>
                  {t(
                    isSent
                      ? user.role === 'admin'
                        ? 'inbox.emptySentBody'
                        : 'inbox.emptyTutorBody'
                      : 'inbox.emptyBody',
                  )}
                </p>
              </div>
            )}
            {q.data.items.map((v) => (
              <MessageRow
                key={v.id}
                message={v}
                folder={folder}
                cursor={cursor}
                selected={id === v.id}
              />
            ))}
            <div className="inbox-pagination">
              {cursor && <Link to={url(folder)}>{t('inbox.previous')}</Link>}
              {q.data.nextCursor && (
                <Link to={url(folder, '', q.data.nextCursor)}>{t('inbox.next')}</Link>
              )}
            </div>
          </>
        )}
      </section>
      <section className="inbox-detail" aria-label={t('inbox.privateUpdate')}>
        {id ? (
          <ReadUpdate key={id} userId={user.id} id={id} folder={folder} cursor={cursor} />
        ) : (
          <div className="inbox-placeholder">
            <Mail size={38} aria-hidden="true" />
            <h2>{t('inbox.choose')}</h2>
            <p>{t('inbox.chooseBody')}</p>
            <span>
              <Mail size={14} aria-hidden="true" />
              {t('inbox.oneWay')}
            </span>
          </div>
        )}
      </section>
    </div>
  )
}
function MessageRow({
  message: v,
  folder,
  cursor,
  selected,
}: {
  message: Schema['InboxUpdate']
  folder: string
  cursor: string
  selected: boolean
}) {
  const { t } = useTranslation()
  const isSent = folder === 'sent'
  const read = !!v.readAt
  return (
    <Link
      className={`inbox-row ${selected ? 'selected' : ''} ${!isSent && !read ? 'unread' : ''}`}
      to={url(folder, v.id, cursor)}
      aria-current={selected ? 'true' : undefined}
    >
      <span className="inbox-row-top">
        <strong>{isSent ? v.recipient.name : v.sender.name}</strong>
        <span className={`inbox-read ${read ? 'is-read' : ''}`}>
          {read ? (
            <CheckCheck size={16} aria-hidden="true" />
          ) : (
            <Mail size={15} aria-hidden="true" />
          )}
          {t(read ? 'inbox.readStatus' : isSent ? 'inbox.sentStatus' : 'inbox.unread')}
        </span>
      </span>
      <span>{v.subject}</span>
      <small>{date(v.createdAt)}</small>
      {(isSent ? v.recipient.sample : v.sender.sample) && <small>{t('inbox.sample')}</small>}
    </Link>
  )
}
function ReadUpdate({
  userId,
  id,
  folder,
  cursor,
}: {
  userId: string
  id: string
  folder: string
  cursor: string
}) {
  const { t } = useTranslation()
  const attempted = useRef(false)
  const q = useQuery({
    queryKey: ['inbox', 'detail', userId, id],
    queryFn: ({ signal }) =>
      api<Schema['InboxDetail']>(`/inbox/${encodeURIComponent(id)}`, { signal }),
    refetchInterval: 15000,
  })
  const read = useInboxMutation({
    mutationFn: () => send(`/inbox/${encodeURIComponent(id)}/read`, {}),
    onSuccess: refreshInbox,
  })
  const message = q.data?.message
  useEffect(() => {
    const acknowledge = () => {
      // An opened, rendered message in the recipient's visible tab acknowledges it.
      if (
        message &&
        message.recipientId === userId &&
        !message.readAt &&
        !attempted.current &&
        document.visibilityState === 'visible'
      ) {
        attempted.current = true
        read.mutate()
      }
    }
    acknowledge()
    document.addEventListener('visibilitychange', acknowledge)
    return () => document.removeEventListener('visibilitychange', acknowledge)
  }, [message, userId, read])
  return (
    <>
      <Link className="inbox-back" to={url(folder, '', cursor)}>
        <ArrowLeft size={17} aria-hidden="true" />
        {t('inbox.back')}
      </Link>
      {q.isPending ? (
        <Loading />
      ) : q.isError ? (
        <LoadError retry={() => void q.refetch()} />
      ) : (
        message && (
          <>
            <div className="inbox-message-heading">
              <h2>{message.subject}</h2>
            </div>
            <dl className="inbox-metadata">
              <div>
                <dt>{t('inbox.from')}</dt>
                <dd>
                  {message.sender.name} <span>· {t(`inbox.roles.${message.sender.role}`)}</span>
                </dd>
              </div>
              <div>
                <dt>{t('inbox.to')}</dt>
                <dd>
                  {message.recipient.name}{' '}
                  <span>· {t(`inbox.roles.${message.recipient.role}`)}</span>
                </dd>
              </div>
            </dl>
            {(message.sender.sample || message.recipient.sample) && (
              <Badge tone="neutral">{t('inbox.sample')}</Badge>
            )}
            <p className="inbox-timestamp">{date(message.createdAt)}</p>
            <div className="inbox-message-body">{message.body}</div>
            <div className="inbox-receipt" role="status">
              {message.readAt ? (
                <>
                  <CheckCheck size={18} aria-hidden="true" />
                  <span>
                    {t('inbox.readStatus')} · {date(message.readAt)}
                  </span>
                </>
              ) : (
                t('inbox.notRead')
              )}
            </div>
            {read.isError && (
              <Alert kind="error">
                {t('inbox.receiptError')}{' '}
                <Button variant="text" busy={read.isPending} onClick={() => read.mutate()}>
                  {t('inbox.retryReceipt')}
                </Button>
              </Alert>
            )}
            <p className="inbox-one-way">{t('inbox.oneWay')}</p>
          </>
        )
      )}
    </>
  )
}
