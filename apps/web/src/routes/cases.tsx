import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, ArrowUpRight, LifeBuoy, LockKeyhole, Plus } from 'lucide-react'
import { api, send, queryClient, indiaDate, type Schema } from '../lib/api'
import { useAuth } from '../lib/session'
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
const refresh = () =>
  Promise.all([
    queryClient.invalidateQueries({ queryKey: ['cases'] }),
    queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  ])
export default function Cases() {
  const auth = useAuth()
  const customer = ['parent', 'tutor'].includes(auth.data?.user.role ?? '')
  const { t } = useTranslation(),
    { id } = useParams()
  return (
    <div className="tu-page">
      <header className="tu-heading">
        <div>
          <h1>{t(customer ? 'parent.help' : 'cases.title')}</h1>
          {!customer && <p>{t('cases.intro')}</p>}
        </div>
        <span className="tu-book">
          <LifeBuoy aria-hidden="true" />
        </span>
      </header>
      {id ? <CaseDetail id={id} /> : <CaseList />}
    </div>
  )
}
function CaseList() {
  const { t, i18n } = useTranslation(),
    [params, setParams] = useSearchParams(),
    auth = useAuth()
  const cursor = params.get('cursor') ?? ''
  const q = useQuery({
    queryKey: ['cases', 'list', cursor],
    queryFn: ({ signal }) =>
      api<Schema['CasePage']>(`/cases?cursor=${encodeURIComponent(cursor)}`, { signal }),
  })
  return (
    <>
      <Alert>
        <strong>{t('cases.draft')}</strong>
        <p>{t('cases.draftBody')}</p>
      </Alert>
      <NewCase />
      {q.isPending ? (
        <Loading />
      ) : q.isError ? (
        <LoadError retry={() => void q.refetch()} />
      ) : (
        <>
          {!q.data.items.length ? (
            <Empty title={t('cases.none')} body={t('cases.noneBody')} />
          ) : (
            <div className="tu-card-grid">
              {q.data.items.map((c) => (
                <article className="tu-enrollment" key={c.id}>
                  <div className="tu-card-top">
                    <Badge tone="neutral">{t(`cases.kinds.${c.kind}`)}</Badge>
                    <Badge tone={c.status === 'resolved' ? 'teal' : 'neutral'}>
                      {t(`cases.status.${c.status}`)}
                    </Badge>
                  </div>
                  <h2>{c.restricted ? t('cases.restricted') : c.title}</h2>
                  <p>{indiaDate(c.updatedAt, i18n.language)}</p>
                  <Link to={`/cases/${c.id}`} className="tu-card-link">
                    {t('cases.open')}
                    <ArrowUpRight size={18} />
                  </Link>
                  {c.restricted && auth.data?.user.role === 'admin' && (
                    <small>{t('cases.ownerNote')}</small>
                  )}
                </article>
              ))}
            </div>
          )}
          <div className="tu-actions">
            {cursor && (
              <Button variant="secondary" onClick={() => setParams({})}>
                {t('tuition.firstPage')}
              </Button>
            )}
            {q.data.nextCursor && (
              <Button variant="secondary" onClick={() => setParams({ cursor: q.data.nextCursor })}>
                {t('tuition.nextPage')}
              </Button>
            )}
          </div>
        </>
      )}
    </>
  )
}
function NewCase() {
  const { t } = useTranslation(),
    navigate = useNavigate(),
    [key] = useState(() => crypto.randomUUID()),
    [kind, setKind] = useState<Schema['CaseInput']['kind']>('support')
  const m = useMutation({
    mutationFn: (body: Schema['CaseInput']) =>
      send<Schema['ServiceCase']>('/cases', body, 'POST', { 'Idempotency-Key': key }),
    onSuccess: async (v) => {
      navigate(`/cases/${v.id}`)
      await refresh()
    },
  })
  return (
    <details className="tu-panel tu-disclosure">
      <summary>
        <Plus size={18} />
        {t('cases.new')}
      </summary>
      <form
        className="tu-stack"
        onSubmit={(e) => {
          e.preventDefault()
          const d = new FormData(e.currentTarget)
          m.mutate({ kind, title: String(d.get('title')), body: String(d.get('body')) })
        }}
      >
        <Field label={t('cases.kind')}>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as Schema['CaseInput']['kind'])}
          >
            {[
              'support',
              'matching',
              'privacy_access',
              'privacy_correction',
              'privacy_deletion',
              'safeguarding',
            ].map((k) => (
              <option key={k} value={k}>
                {t(`cases.kinds.${k}`)}
              </option>
            ))}
          </select>
        </Field>
        {kind.startsWith('privacy_') && <Alert>{t('cases.privacy')}</Alert>}
        {kind === 'safeguarding' && <Alert>{t('cases.restrictedBody')}</Alert>}
        <Field label={t('cases.subject')}>
          <input name="title" required minLength={5} maxLength={120} />
        </Field>
        <Field label={t('cases.body')}>
          <textarea name="body" required minLength={10} maxLength={3000} rows={5} />
        </Field>
        <MutationError error={m.error} />
        <Button busy={m.isPending}>{t('cases.send')}</Button>
      </form>
    </details>
  )
}
function CaseDetail({ id }: { id: string }) {
  const { t, i18n } = useTranslation(),
    [params, setParams] = useSearchParams()
  const cursor = params.get('cursor') ?? ''
  const q = useQuery({
    queryKey: ['cases', id, cursor],
    queryFn: ({ signal }) =>
      api<Schema['CaseDetail']>(`/cases/${id}?cursor=${encodeURIComponent(cursor)}`, { signal }),
  })
  const claim = useMutation({
    mutationFn: (version: number) =>
      send(`/cases/${id}/action`, { action: 'claim', version, body: '' }),
    onSuccess: refresh,
  })
  if (q.isPending) return <Loading />
  if (q.isError) return <LoadError retry={() => void q.refetch()} />
  const c = q.data.case
  return (
    <>
      <Link to="/cases" className="tu-back">
        <ArrowLeft size={16} />
        {t('cases.back')}
      </Link>
      <article className="tu-panel tu-stack">
        <div className="tu-card-top">
          <Badge tone="neutral">{t(`cases.kinds.${c.kind}`)}</Badge>
          <Badge tone={c.status === 'resolved' ? 'teal' : 'neutral'}>
            {t(`cases.status.${c.status}`)}
          </Badge>
        </div>
        <h2>{c.restricted ? t('cases.restricted') : c.title}</h2>
        {c.restricted ? (
          <Alert>
            <LockKeyhole size={18} />
            {t('cases.restrictedBody')}
          </Alert>
        ) : (
          <p>{c.body}</p>
        )}
        {c.kind.startsWith('privacy_') && <Alert>{t('cases.privacy')}</Alert>}
        {c.restricted && !c.assignedTo && c.status !== 'resolved' && (
          <>
            <MutationError error={claim.error} />
            <Button busy={claim.isPending} onClick={() => claim.mutate(c.version)}>
              {t('cases.claim')}
            </Button>
          </>
        )}
        <small>{indiaDate(c.createdAt, i18n.language)}</small>
      </article>
      {!c.restricted && (
        <>
          <section className="tu-stack">
            <h2>{t('cases.history')}</h2>
            <p>{t('cases.ownerNote')}</p>
            {!q.data.messages.items.length ? (
              <p>{t('cases.noMessages')}</p>
            ) : (
              q.data.messages.items.map((m) => (
                <article key={m.id} className="tu-panel">
                  <div className="tu-card-top">
                    <strong>{m.authorName}</strong>
                    <Badge tone="neutral">{t(`desk.roles.${m.authorRole}`)}</Badge>
                  </div>
                  <p>{m.body}</p>
                  <small>{indiaDate(m.createdAt, i18n.language)}</small>
                </article>
              ))
            )}
            <div className="tu-actions">
              {cursor && (
                <Button variant="secondary" onClick={() => setParams({})}>
                  {t('tuition.firstPage')}
                </Button>
              )}
              {q.data.messages.nextCursor && (
                <Button
                  variant="secondary"
                  onClick={() => setParams({ cursor: q.data.messages.nextCursor })}
                >
                  {t('tuition.nextPage')}
                </Button>
              )}
            </div>
          </section>
          <CaseResponse key={c.version} item={c} />
        </>
      )}
    </>
  )
}
function CaseResponse({ item }: { item: Schema['ServiceCase'] }) {
  const { t } = useTranslation(),
    auth = useAuth()
  const m = useMutation({
    mutationFn: (body: Schema['CaseAction']) => send(`/cases/${item.id}/action`, body),
    onSuccess: refresh,
  })
  const options =
    item.status === 'resolved'
      ? item.assignedTo === auth.data!.user.id
        ? []
        : ['reopen']
      : item.canManage
        ? ['reply', 'waiting_family', 'resolve']
        : item.canReply
          ? ['reply']
          : []
  if (!options.length) return null
  return (
    <form
      className="tu-panel tu-stack"
      onSubmit={(e) => {
        e.preventDefault()
        const d = new FormData(e.currentTarget)
        m.mutate({
          action: d.get('action') as Schema['CaseAction']['action'],
          body: String(d.get('body')),
          version: item.version,
        })
      }}
    >
      <h2>{t('cases.reply')}</h2>
      <Field label={t('cases.resolution')}>
        <select name="action">
          {options.map((action) => (
            <option value={action} key={action}>
              {t(
                `cases.${action === 'reply' ? 'saveReply' : action === 'waiting_family' ? 'waiting' : action}`,
              )}
            </option>
          ))}
        </select>
      </Field>
      <Field label={t('cases.message')}>
        <textarea name="body" required minLength={10} maxLength={3000} rows={5} />
      </Field>
      <MutationError error={m.error} />
      <Button busy={m.isPending}>{t('cases.saveReply')}</Button>
    </form>
  )
}
