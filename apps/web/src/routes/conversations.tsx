import '../locales/tuition'
import { useRef, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Bell, MessageCircle, Paperclip, Download, FileText, X } from 'lucide-react'
import { api, APIError, send, indiaDate, queryClient, type Schema } from '../lib/api'
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
import { useAuth, useConfig } from '../lib/session'
import { activityNotification } from '../lib/notifications'
import '../styles/notifications.css'
import '../styles/conversation.css'
import { uploadFile, type UploadProgress } from '../lib/uploads'
import { LocalFilePreview, UploadFeedback } from '../components/upload-feedback'
type DraftAttachment = { file: File; key: string; uploaded?: Schema['PrivateFile'] }
export function Conversation({ enrollment }: { enrollment: Schema['Enrollment'] }) {
  const active = useActivePanel()
  const { t, i18n } = useTranslation()
  const config = useConfig()
  const [cursor, setCursor] = useState(''),
    [body, setBody] = useState('')
  const [attachments, setAttachments] = useState<DraftAttachment[]>([])
  const [fileError, setFileError] = useState('')
  const [progress, setProgress] = useState<UploadProgress | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const receipt = useRef({ body: '', key: '' })
  const q = useQuery({
    queryKey: ['messages', enrollment.id, cursor],
    enabled: active,
    queryFn: ({ signal }) =>
      api<Schema['MessagePage']>(
        `/enrollments/${enrollment.id}/messages?cursor=${encodeURIComponent(cursor)}`,
        { signal },
      ),
    refetchInterval: active ? 15000 : false,
  })
  const m = useMutation({
    mutationFn: async () => {
      const ids: string[] = []
      for (const item of attachments) {
        const file =
          item.uploaded ??
          (await uploadFile(
            `/enrollments/${enrollment.id}/messages/files`,
            item.file,
            item.key,
            config.data?.mediaProvider === 'cloudinary',
            setProgress,
          ))
        setAttachments((current) =>
          current.map((entry) => (entry.key === item.key ? { ...entry, uploaded: file } : entry)),
        )
        ids.push(file.id)
      }
      const data = { body, attachmentIds: ids }
      const fingerprint = JSON.stringify(data)
      if (receipt.current.body !== fingerprint)
        receipt.current = { body: fingerprint, key: crypto.randomUUID() }
      return send(`/enrollments/${enrollment.id}/messages`, data, 'POST', {
        'Idempotency-Key': receipt.current.key,
      })
    },
    onSuccess: async () => {
      setBody('')
      setAttachments([])
      setProgress(null)
      setFileError('')
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['messages', enrollment.id] }),
        queryClient.invalidateQueries({ queryKey: ['files', 'conversation', enrollment.id] }),
        queryClient.invalidateQueries({ queryKey: ['tuition', enrollment.id] }),
      ])
    },
  })
  return (
    <section className="tu-stack">
      <div className="tu-panel-title">
        <MessageCircle />
        <h2>{t('tuition.messages')}</h2>
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
              <article className="tu-panel tu-stack" key={message.id}>
                <div className="tu-card-top">
                  <strong>{message.authorName}</strong>
                  <Badge tone="neutral">{t(`desk.roles.${message.authorRole}`)}</Badge>
                </div>
                {message.body && <p className="conversation-body">{message.body}</p>}
                {!!message.attachments?.length && (
                  <MessageAttachments items={message.attachments} />
                )}
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
          className="tu-panel tu-stack conversation-composer"
          onSubmit={(event) => {
            event.preventDefault()
            m.mutate()
          }}
        >
          <fieldset className="conversation-fields" disabled={m.isPending}>
            <Field label={t('tuition.message')}>
              <textarea
                value={body}
                onChange={(e) => {
                  setBody(e.target.value)
                  m.reset()
                }}
                required={!attachments.length}
                maxLength={3000}
                rows={3}
              />
            </Field>
            <div className="conversation-compose-actions">
              <Button
                variant="secondary"
                type="button"
                onClick={() => input.current?.click()}
                disabled={attachments.length >= 3 || !config.data?.uploadsEnabled}
              >
                <Paperclip size={17} aria-hidden="true" />
                Attach photo or PDF
              </Button>
              <span>Up to 3 files. JPG, PNG or PDF, 3 MiB each.</span>
            </div>
            <input
              ref={input}
              tabIndex={-1}
              className="sr-only"
              type="file"
              multiple
              aria-label="Message attachments"
              accept="image/jpeg,image/png,application/pdf"
              disabled={!config.data?.uploadsEnabled}
              onChange={(event) => {
                const selected = Array.from(event.target.files ?? [])
                event.target.value = ''
                if (
                  attachments.length + selected.length > 3 ||
                  selected.some(
                    (file) =>
                      !['image/jpeg', 'image/png', 'application/pdf'].includes(file.type) ||
                      file.size < 1 ||
                      file.size > 3 * 1024 * 1024,
                  )
                ) {
                  setFileError(
                    'Choose up to three JPG, PNG or PDF files, each no larger than 3 MiB.',
                  )
                  return
                }
                setFileError('')
                m.reset()
                setAttachments((previous) => [
                  ...previous,
                  ...selected.map((file) => ({ file, key: crypto.randomUUID() })),
                ])
              }}
            />
            {!!attachments.length && (
              <div className="conversation-drafts">
                {attachments.map((item) => (
                  <div key={item.key}>
                    <LocalFilePreview file={item.file} />
                    <span>{item.file.name}</span>
                    <Button
                      variant="text"
                      type="button"
                      aria-label={`Remove ${item.file.name}`}
                      onClick={() => {
                        setAttachments((previous) =>
                          previous.filter((entry) => entry.key !== item.key),
                        )
                        setFileError('')
                        m.reset()
                      }}
                    >
                      <X size={16} aria-hidden="true" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
            {fileError && <Alert kind="error">{fileError}</Alert>}
            {config.isError && <LoadError retry={() => void config.refetch()} />}
            {config.data && !config.data.uploadsEnabled && (
              <p>Attachments are unavailable. You can still send a text message.</p>
            )}
            {m.isPending && progress && <UploadFeedback progress={progress} />}
            <MutationError error={m.error} />
            {m.isSuccess && <Alert kind="success">{t('tuition.sent')}</Alert>}
            <Button type="submit" busy={m.isPending} disabled={!body.trim() && !attachments.length}>
              {t('tuition.sendMessage')}
            </Button>
          </fieldset>
        </form>
      ) : (
        <Alert>{t('tuition.closedConversation')}</Alert>
      )}
      <EarlierAttachments enrollment={enrollment.id} />
    </section>
  )
}

function MessageAttachments({ items }: { items: Schema['MessageAttachment'][] }) {
  const download = useMutation({
    mutationFn: async (file: Schema['MessageAttachment']) => {
      const response = await fetch(`/api/v1/files/${encodeURIComponent(file.id)}/download`, {
        credentials: 'same-origin',
        cache: 'no-store',
      })
      if (!response.ok) {
        if (response.headers.get('content-type')?.includes('application/json')) {
          const e = (await response.json()) as Schema['Error']
          throw new APIError(response.status, e.code, e.message)
        }
        throw new Error('Download unavailable')
      }
      const url = URL.createObjectURL(await response.blob()),
        link = document.createElement('a')
      link.href = url
      link.download = file.name
      link.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 10000)
    },
  })
  return (
    <>
      <div className="conversation-attachments">
        {items.map((file) => (
          <div className="conversation-attachment" key={file.id}>
            {file.contentType.startsWith('image/') ? (
              <img
                loading="lazy"
                src={`/api/v1/files/${encodeURIComponent(file.id)}/view`}
                alt={file.name}
              />
            ) : (
              <FileText size={28} aria-hidden="true" />
            )}
            <div>
              <strong>{file.name}</strong>
              <span>{Math.ceil(file.size / 1024)} KiB</span>
            </div>
            <Button
              type="button"
              variant="text"
              busy={download.isPending && download.variables?.id === file.id}
              onClick={() => download.mutate(file)}
              aria-label={`Download ${file.name}`}
            >
              <Download size={18} aria-hidden="true" />
            </Button>
          </div>
        ))}
      </div>
      <MutationError error={download.error} />
    </>
  )
}
function EarlierAttachments({ enrollment }: { enrollment: string }) {
  const active = useActivePanel()
  const [cursor, setCursor] = useState('')
  const q = useQuery({
    queryKey: ['files', 'conversation', enrollment, cursor],
    enabled: active,
    queryFn: ({ signal }) =>
      api<Schema['FilePage']>(
        `/enrollments/${enrollment}/files?unlinked=1&cursor=${encodeURIComponent(cursor)}`,
        { signal },
      ),
  })
  if (q.isPending) return null
  if (q.isError) return <LoadError retry={() => void q.refetch()} />
  if (!q.data.items.length && !cursor) return null
  return (
    <details className="tu-disclosure">
      <summary>Other class attachments</summary>
      <div className="tu-stack">
        <p>Files uploaded to this booking outside a message.</p>
        <MessageAttachments
          items={q.data.items.filter((file) => ['ready', 'clean'].includes(file.status))}
        />
        {q.data.items
          .filter((file) => !['ready', 'clean'].includes(file.status))
          .map((file) => (
            <p key={file.id}>{file.name}: processing or unavailable</p>
          ))}
        <div className="tu-actions">
          {cursor && (
            <Button type="button" variant="secondary" onClick={() => setCursor('')}>
              First page
            </Button>
          )}
          {q.data.nextCursor && (
            <Button type="button" variant="secondary" onClick={() => setCursor(q.data.nextCursor)}>
              Next page
            </Button>
          )}
        </div>
      </div>
    </details>
  )
}
export function ActivityUpdates() {
  const role = useAuth().data!.user.role
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
    <div className="activity-updates">
      <header className="activity-heading">
        <h2>Activity notifications</h2>
        <p>Your bookings, trials and support updates.</p>
      </header>
      <MutationError error={m.error} />
      {q.isPending ? (
        <Loading />
      ) : q.isError ? (
        <LoadError retry={() => void q.refetch()} />
      ) : (
        <>
          {!q.data.items.length ? (
            <Empty headingLevel={2} title={t('tuition.noNotifications')} />
          ) : (
            q.data.items.map((n) => {
              const details = activityNotification(n, role, t)
              return (
                <article className="activity-row" key={n.id} data-unread={!n.read}>
                  <span className="activity-row-icon">
                    <Bell size={21} aria-hidden="true" />
                  </span>
                  <div className="activity-row-copy">
                    <h3>{details.title}</h3>
                    <time dateTime={n.createdAt}>{indiaDate(n.createdAt, i18n.language)}</time>
                    {!n.read && <span className="activity-unread-label">Unread</span>}
                  </div>
                  <div className="tu-actions">
                    <Link className="btn secondary" to={details.href}>
                      {details.action}
                    </Link>
                    {!n.read && (
                      <Button variant="text" busy={m.isPending} onClick={() => m.mutate(n.id)}>
                        {t('tuition.read')}
                      </Button>
                    )}
                  </div>
                </article>
              )
            })
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
