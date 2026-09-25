import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  ArrowLeft,
  CheckCheck,
  Inbox as InboxIcon,
  LockKeyhole,
  Mail,
  PenLine,
  Send,
  ShieldCheck,
} from 'lucide-react'
import { api, send, queryClient, indiaDate, type Schema, type User } from '../lib/api'
import { useAuth } from '../lib/session'
import {
  createInboxIdentity,
  unlockInbox,
  encryptUpdate,
  decryptUpdate,
  signReadReceipt,
  verifyReadReceipt,
  type InboxIdentity,
  type UpdateContent,
} from '../lib/inbox-crypto'
import { Alert, Badge, Button, Field, Loading, LoadError, MutationError } from '../components/ui'
import { ActivityUpdates } from './conversations'
import '../styles/inbox.css'

const refreshInbox = () => queryClient.invalidateQueries({ queryKey: ['inbox'] })
const url = (folder: string, id = '', cursor = '') =>
  `/notifications?${new URLSearchParams({ folder, ...(id ? { id } : {}), ...(cursor ? { cursor } : {}) })}`
const date = (value: string) => indiaDate(value, 'en')

// Crypto operations must not enter TanStack's global mutation cache: their
// closures and results can contain unlocked keys, passphrases or plaintext.
function usePrivateMutation<T, V = void>(options: {
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
  const [identity, setIdentity] = useState<InboxIdentity | null>(null)
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
            {t(folder === 'activity' && !compose ? 'inbox.activity' : 'inbox.encrypted')}
          </p>
          <h1>{t('inbox.title')}</h1>
          <p>
            {t(
              `inbox.${user.role === 'admin' ? 'adminIntro' : user.role === 'tutor' ? 'tutorIntro' : 'parentIntro'}`,
            )}
          </p>
        </div>
        <div className="inbox-header-actions">
          {identity && (
            <Button variant="text" onClick={() => setIdentity(null)}>
              <LockKeyhole size={16} aria-hidden="true" />
              {t('inbox.lock')}
            </Button>
          )}
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
      ) : !identity ? (
        <Unlock user={user} onUnlock={setIdentity} />
      ) : compose ? (
        <Compose identity={identity} user={user} />
      ) : (
        <Mailbox
          identity={identity}
          user={user}
          folder={folder}
          id={id}
          cursor={params.get('cursor') ?? ''}
        />
      )}
    </div>
  )
}
function Unlock({ user, onUnlock }: { user: User; onUnlock: (identity: InboxIdentity) => void }) {
  const { t } = useTranslation()
  const [passphrase, setPassphrase] = useState(''),
    [confirm, setConfirm] = useState(''),
    [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const prepared = useRef<Awaited<ReturnType<typeof createInboxIdentity>> | null>(null)
  const q = useQuery({
    queryKey: ['inbox', 'key', user.id],
    queryFn: ({ signal }) => api<Schema['InboxKeyResponse']>('/inbox/key', { signal }),
  })
  const m = usePrivateMutation({
    mutationFn: async () => {
      setError('')
      if (q.data?.key) {
        try {
          return await unlockInbox(q.data.key, passphrase)
        } catch {
          setError('unlockError')
          throw new Error('unlock')
        }
      }
      if (passphrase !== confirm) {
        setError('mismatch')
        throw new Error('mismatch')
      }
      if (!saved || passphrase.length < 16) throw new Error('validation')
      prepared.current ??= await createInboxIdentity(user.id, passphrase)
      await send('/inbox/key', prepared.current.input)
      return prepared.current.identity
    },
    onSuccess: (value) => {
      setPassphrase('')
      setConfirm('')
      prepared.current = null
      onUnlock(value)
      void refreshInbox()
    },
  })
  if (!globalThis.crypto?.subtle) return <Alert kind="error">{t('inbox.cryptoUnavailable')}</Alert>
  if (q.isPending) return <Loading />
  if (q.isError) return <LoadError retry={() => void q.refetch()} />
  const setup = !q.data.key
  return (
    <section className="inbox-unlock">
      <div className="inbox-lock-icon">
        <LockKeyhole size={28} aria-hidden="true" />
      </div>
      <h2>{t(setup ? 'inbox.setupTitle' : 'inbox.unlockTitle')}</h2>
      <p>{t(setup ? 'inbox.setupBody' : 'inbox.unlockBody')}</p>
      <form
        className="tu-stack"
        onSubmit={(event) => {
          event.preventDefault()
          m.mutate()
        }}
      >
        <Field label={t('inbox.passphrase')} hint={setup ? t('inbox.passphraseHint') : undefined}>
          <input
            type="password"
            autoComplete={setup ? 'new-password' : 'off'}
            value={passphrase}
            minLength={setup ? 16 : undefined}
            maxLength={256}
            required
            disabled={m.isPending}
            onChange={(e) => {
              setPassphrase(e.target.value)
              prepared.current = null
              setError('')
              m.reset()
            }}
          />
        </Field>
        {setup && (
          <>
            <Field label={t('inbox.confirm')}>
              <input
                type="password"
                autoComplete="new-password"
                value={confirm}
                maxLength={256}
                required
                disabled={m.isPending}
                onChange={(e) => {
                  setConfirm(e.target.value)
                  setError('')
                }}
              />
            </Field>
            <Alert>{t('inbox.loss')}</Alert>
            <label className="inbox-check">
              <input
                type="checkbox"
                checked={saved}
                required
                disabled={m.isPending}
                onChange={(e) => setSaved(e.target.checked)}
              />
              {t('inbox.acknowledge')}
            </label>
          </>
        )}
        {error ? (
          <Alert kind="error">{t(`inbox.${error}`)}</Alert>
        ) : (
          <MutationError error={m.error} />
        )}
        <Button busy={m.isPending}>{t(setup ? 'inbox.activate' : 'inbox.unlock')}</Button>
      </form>
      <p className="inbox-security-note">
        <ShieldCheck size={17} aria-hidden="true" />
        {t('inbox.metadata')}
      </p>
    </section>
  )
}
function SafetyNumbers({
  own,
  other,
}: {
  own: Schema['InboxPublicKey']
  other?: Schema['InboxPublicKey']
}) {
  const { t } = useTranslation()
  return (
    <details className="inbox-safety">
      <summary>{t('inbox.security')}</summary>
      <p>{t('inbox.securityBody')}</p>
      <strong>{t('inbox.ownNumber')}</strong>
      <code>{own.fingerprint.match(/.{1,4}/g)?.join(' ')}</code>
      {other && (
        <>
          <strong>{t('inbox.otherPersonNumber')}</strong>
          <code>{other.fingerprint.match(/.{1,4}/g)?.join(' ')}</code>
        </>
      )}
    </details>
  )
}
function Compose({ identity, user }: { identity: InboxIdentity; user: User }) {
  const { t } = useTranslation()
  const [, setParams] = useSearchParams()
  const [search, setSearch] = useState(''),
    [filter, setFilter] = useState(''),
    [role, setRole] = useState(''),
    [cursor, setCursor] = useState('')
  const [selected, setSelected] = useState<Schema['InboxRecipient'] | null>(null)
  const [subject, setSubject] = useState(''),
    [body, setBody] = useState('')
  const prepared = useRef<{ envelope: Schema['InboxEnvelope']; key: string } | null>(null)
  const recipients = useQuery({
    queryKey: ['inbox', 'recipients', user.id, filter, role, cursor],
    queryFn: ({ signal }) =>
      api<Schema['InboxRecipientPage']>(
        `/inbox/recipients?${new URLSearchParams({ search: filter, role, cursor })}`,
        { signal },
      ),
  })
  const recipientKey = useQuery({
    queryKey: ['inbox', 'recipient-key', selected?.id, selected?.enrollmentId],
    enabled: !!selected,
    queryFn: ({ signal }) =>
      api<Schema['InboxPublicKey']>(
        `/inbox/recipients/${encodeURIComponent(selected!.id)}/key?${new URLSearchParams({ enrollmentId: selected!.enrollmentId })}`,
        { signal },
      ),
  })
  const m = usePrivateMutation({
    mutationFn: async () => {
      if (!selected || !recipientKey.data) throw new Error('recipient')
      prepared.current ??= {
        envelope: await encryptUpdate(identity, recipientKey.data, selected.enrollmentId, {
          subject,
          body,
        }),
        key: crypto.randomUUID(),
      }
      return send<Schema['InboxUpdate']>('/inbox', prepared.current.envelope, 'POST', {
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
          <Field label={t('inbox.recipient')} hint={t('inbox.readyHelp')}>
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
                  disabled={!person.ready}
                >
                  {person.name} · {t(`inbox.roles.${person.role}`)}
                  {person.sample ? ` · ${t('inbox.sample')}` : ''}
                  {!person.ready ? ` · ${t('inbox.notReady')}` : ''}
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
      {selected && recipientKey.isPending && <Loading />}
      {selected && recipientKey.isError && <LoadError retry={() => void recipientKey.refetch()} />}
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
          <Button
            busy={m.isPending}
            disabled={
              !selected ||
              !recipientKey.data ||
              recipientKey.isError ||
              !subject.trim() ||
              !body.trim()
            }
          >
            <LockKeyhole size={16} aria-hidden="true" />
            {t('inbox.send')}
          </Button>
        </div>
      </form>
      <SafetyNumbers own={identity.publicKey} other={recipientKey.data} />
    </section>
  )
}
function Mailbox({
  identity,
  user,
  folder,
  id,
  cursor,
}: {
  identity: InboxIdentity
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
                keys={q.data.keys}
                identity={identity}
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
          <ReadUpdate key={id} identity={identity} id={id} folder={folder} cursor={cursor} />
        ) : (
          <div className="inbox-placeholder">
            <Mail size={38} aria-hidden="true" />
            <h2>{t('inbox.choose')}</h2>
            <p>{t('inbox.chooseBody')}</p>
            <span>
              <LockKeyhole size={14} aria-hidden="true" />
              {t('inbox.encrypted')}
            </span>
          </div>
        )}
      </section>
    </div>
  )
}
function MessageRow({
  message: v,
  keys,
  identity,
  folder,
  cursor,
  selected,
}: {
  message: Schema['InboxUpdate']
  keys: Schema['InboxPage']['keys']
  identity: InboxIdentity
  folder: string
  cursor: string
  selected: boolean
}) {
  const { t } = useTranslation()
  const [preview, setPreview] = useState<{ subject: string; receipt: string } | null>(null)
  useEffect(() => {
    let active = true
    const senderKey = keys[v.senderId],
      recipientKey = keys[v.recipientId]
    if (!senderKey || !recipientKey) return
    void (async () => {
      try {
        const detail = { message: v, senderKey, recipientKey }
        const content = await decryptUpdate(identity, detail)
        const read = v.readAt ? await verifyReadReceipt(detail) : false
        if (active) setPreview({ subject: content.subject, receipt: read ? v.readSignature : '' })
      } catch {
        if (active) setPreview(null)
      }
    })()
    return () => {
      active = false
    }
  }, [identity, keys, v])
  const isSent = folder === 'sent'
  const read = !!v.readAt && !!preview?.receipt && preview.receipt === v.readSignature
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
      <span>{preview?.subject ?? t('inbox.privateUpdate')}</span>
      <small>{date(v.createdAt)}</small>
      {(isSent ? v.recipient.sample : v.sender.sample) && <small>{t('inbox.sample')}</small>}
    </Link>
  )
}
function ReadUpdate({
  identity,
  id,
  folder,
  cursor,
}: {
  identity: InboxIdentity
  id: string
  folder: string
  cursor: string
}) {
  const { t } = useTranslation()
  const [content, setContent] = useState<UpdateContent | null>(null),
    [failed, setFailed] = useState(false),
    [verifiedRead, setVerifiedRead] = useState(false)
  const attempted = useRef(false)
  const q = useQuery({
    queryKey: ['inbox', 'detail', id],
    queryFn: ({ signal }) =>
      api<Schema['InboxDetail']>(`/inbox/${encodeURIComponent(id)}`, { signal }),
    refetchInterval: 15000,
  })
  const read = usePrivateMutation({
    mutationFn: async (message: Schema['InboxUpdate']) =>
      send(`/inbox/${encodeURIComponent(id)}/read`, {
        signature: await signReadReceipt(identity, message),
      }),
    onSuccess: refreshInbox,
  })
  useEffect(() => {
    let active = true
    if (!q.data) return
    void (async () => {
      try {
        const decoded = await decryptUpdate(identity, q.data)
        const validRead = q.data.message.readAt ? await verifyReadReceipt(q.data) : false
        if (active) {
          setContent(decoded)
          setFailed(false)
          setVerifiedRead(validRead)
        }
      } catch {
        if (active) {
          setContent(null)
          setFailed(true)
        }
      }
    })()
    return () => {
      active = false
    }
  }, [identity, q.data])
  const message = q.data?.message
  useEffect(() => {
    // Only acknowledge after authenticated decryption has rendered the opened message.
    if (
      content &&
      message &&
      message.recipientId === identity.publicKey.userId &&
      !message.readAt &&
      !attempted.current
    ) {
      attempted.current = true
      read.mutate(message)
    }
  }, [content, message, identity, read])
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
      ) : failed ? (
        <Alert kind="error">{t('inbox.decryptError')}</Alert>
      ) : !content || !message ? (
        <Loading />
      ) : (
        <>
          <div className="inbox-message-heading">
            <Badge tone="neutral">
              <LockKeyhole size={13} aria-hidden="true" />
              {t('inbox.encrypted')}
            </Badge>
            <h2>{content.subject}</h2>
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
                {message.recipient.name} <span>· {t(`inbox.roles.${message.recipient.role}`)}</span>
              </dd>
            </div>
          </dl>
          {(message.sender.sample || message.recipient.sample) && (
            <Badge tone="neutral">{t('inbox.sample')}</Badge>
          )}
          <p className="inbox-timestamp">{date(message.createdAt)}</p>
          <div className="inbox-message-body">{content.body}</div>
          <div className="inbox-receipt" role="status">
            {message.readAt ? (
              verifiedRead ? (
                <>
                  <CheckCheck size={18} aria-hidden="true" />
                  <span>
                    {t('inbox.readStatus')} · {date(message.readAt)}
                  </span>
                </>
              ) : (
                t('inbox.invalidReceipt')
              )
            ) : (
              t('inbox.notRead')
            )}
          </div>
          {read.isError && (
            <Alert kind="error">
              {t('inbox.receiptError')}{' '}
              <Button variant="text" busy={read.isPending} onClick={() => read.mutate(message)}>
                {t('inbox.retryReceipt')}
              </Button>
            </Alert>
          )}
          <p className="inbox-one-way">{t('inbox.oneWay')}</p>
          <SafetyNumbers
            own={identity.publicKey}
            other={
              message.senderId === identity.publicKey.userId
                ? q.data.recipientKey
                : q.data.senderKey
            }
          />
        </>
      )}
    </>
  )
}
