import '../locales/cases'
import { useState } from 'react'
import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  LifeBuoy,
  LockKeyhole,
  Plus,
  Search,
  Send,
  Ticket,
} from 'lucide-react'
import { api, APIError, send, queryClient, indiaDate, type Schema } from '../lib/api'
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
import { TabBar, TabPanel } from '../components/workspace-tabs'
import '../styles/cases.css'

const kinds: Schema['CaseInput']['kind'][] = [
  'support',
  'matching',
  'privacy_access',
  'privacy_correction',
  'privacy_deletion',
  'safeguarding',
]
const refresh = () =>
  Promise.all([
    queryClient.invalidateQueries({ queryKey: ['cases'] }),
    queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  ])
function listURL(params: URLSearchParams) {
  const next = new URLSearchParams(params)
  for (const key of ['new', 'before', 'created']) next.delete(key)
  return `/cases${next.size ? `?${next}` : ''}`
}
function TicketStatus({ status }: { status: string }) {
  const customer = !['admin', 'support'].includes(useAuth().data!.user.role)
  const labels: Record<string, string> = {
    open: 'Open',
    assigned: 'In progress',
    waiting_family: customer ? 'Awaiting your reply' : 'Waiting for requester',
    resolved: 'Resolved',
  }
  return (
    <Badge
      tone={status === 'resolved' ? 'teal' : status === 'waiting_family' ? 'amber' : 'neutral'}
    >
      {labels[status] ?? status}
    </Badge>
  )
}
export default function Cases() {
  const { id } = useParams()
  const [params] = useSearchParams()
  return (
    <div className="help-page cases-page">
      {id ? (
        <CaseDetail key={id} id={id} />
      ) : params.get('new') === '1' ? (
        <NewCase />
      ) : (
        <CaseList />
      )}
    </div>
  )
}
function CaseList() {
  const { t, i18n } = useTranslation()
  const [params, setParams] = useSearchParams()
  const staff = ['admin', 'support'].includes(useAuth().data!.user.role)
  const status = params.get('status') ?? 'all'
  const kind = params.get('kind') ?? ''
  const search = params.get('q') ?? ''
  const cursor = params.get('cursor') ?? ''
  const query = new URLSearchParams({ status, kind, q: search, cursor })
  const q = useQuery({
    queryKey: ['cases', 'list', status, kind, search, cursor],
    queryFn: ({ signal }) => api<Schema['CasePage']>(`/cases?${query}`, { signal }),
    refetchOnWindowFocus: true,
  })
  const change = (key: string, value: string) =>
    setParams((previous) => {
      const next = new URLSearchParams(previous)
      next.delete('cursor')
      if (value) next.set(key, value)
      else next.delete(key)
      return next
    })
  const create = new URLSearchParams(params)
  create.set('new', '1')
  const filters = [
    { value: 'all', label: 'All tickets' },
    { value: 'active', label: 'Active' },
    { value: 'waiting_family', label: staff ? 'Waiting for requester' : 'Awaiting your reply' },
    { value: 'resolved', label: 'Resolved' },
  ].map((item) => ({
    ...item,
    label: `${item.label}${q.data ? ` (${q.data.counts[item.value as keyof Schema['CasePage']['counts']]})` : ''}`,
  }))
  return (
    <>
      <header className="help-heading">
        <div>
          <span className="help-eyebrow">
            <LifeBuoy size={16} aria-hidden="true" /> Here to help
          </span>
          <h1>{staff ? 'Support tickets' : 'Help & support'}</h1>
          <p>
            {staff
              ? 'Manage your queue and keep every conversation moving.'
              : 'Ask for help and follow every conversation in one place.'}
          </p>
        </div>
        <Link className="btn primary" to={`/cases?${create}`}>
          <Plus size={18} aria-hidden="true" />
          New ticket
        </Link>
      </header>
      <section className="ticket-list" aria-label={staff ? 'Support queue' : 'My tickets'}>
        <div className="ticket-list-heading">
          <div>
            <h2>{staff ? 'Ticket queue' : 'My tickets'}</h2>
            <p>Most recently updated first</p>
          </div>
          <Ticket size={23} aria-hidden="true" />
        </div>
        <TabBar
          id="ticket-filter"
          scrollable
          label="Ticket status"
          value={status}
          options={filters}
          onChange={(value) => change('status', value)}
        />
        <form
          className="ticket-filters"
          role="search"
          aria-label="Search tickets"
          onSubmit={(event) => {
            event.preventDefault()
            change('q', String(new FormData(event.currentTarget).get('q')).trim())
          }}
        >
          <div className="ticket-search">
            <label className="sr-only" htmlFor="ticket-search">
              Search tickets
            </label>
            <Search size={18} aria-hidden="true" />
            <input
              id="ticket-search"
              type="search"
              key={search}
              name="q"
              defaultValue={search}
              maxLength={120}
              placeholder="Search by subject or ticket ID"
            />
            <Button variant="secondary">Search</Button>
          </div>
          <Field label="Category">
            <select value={kind} onChange={(event) => change('kind', event.target.value)}>
              <option value="">All categories</option>
              {kinds.map((value) => (
                <option key={value} value={value}>
                  {t(`cases.kinds.${value}`)}
                </option>
              ))}
            </select>
          </Field>
          {(search || kind || status !== 'all') && (
            <Link className="ticket-clear" to="/cases">
              Clear filters
            </Link>
          )}
        </form>
        <TabPanel id="ticket-filter" value={status} active>
          {q.isPending ? (
            <Loading />
          ) : q.isError ? (
            <LoadError retry={() => void q.refetch()} />
          ) : !q.data.items.length ? (
            <Empty
              headingLevel={3}
              title={
                search || kind || status !== 'all'
                  ? 'No tickets match these filters'
                  : 'Your conversations start here'
              }
              body={
                search || kind || status !== 'all'
                  ? 'Try another search or clear your filters.'
                  : 'Create a ticket when you need help. You can track its status and reply here.'
              }
            />
          ) : (
            <>
              <table className="ticket-table">
                <caption className="sr-only">
                  {staff ? 'Support tickets' : 'My support tickets'}
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Ticket</th>
                    <th scope="col">Category</th>
                    <th scope="col">Status</th>
                    <th scope="col">Last updated</th>
                    <th scope="col">
                      <span className="sr-only">Open</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {q.data.items.map((item) => (
                    <tr key={item.id}>
                      <td className="ticket-subject">
                        <Link
                          to={`/cases/${encodeURIComponent(item.id)}${params.size ? `?${params}` : ''}`}
                        >
                          {item.restricted ? 'Restricted ticket' : item.title}
                        </Link>
                        <span className="ticket-reference" title={item.id}>
                          {item.id}
                        </span>
                        {item.canClaim && (
                          <span className="ticket-claim-note">
                            <LockKeyhole size={12} aria-hidden="true" /> Take ticket to view details
                          </span>
                        )}
                      </td>
                      <td>
                        <span className="ticket-cell-label" aria-hidden="true">
                          Category
                        </span>
                        {t(`cases.kinds.${item.kind}`)}
                      </td>
                      <td>
                        <TicketStatus status={item.status} />
                      </td>
                      <td>
                        <span className="ticket-cell-label" aria-hidden="true">
                          Updated
                        </span>
                        <time dateTime={item.updatedAt}>
                          {indiaDate(item.updatedAt, i18n.language)}
                        </time>
                      </td>
                      <td className="ticket-row-arrow">
                        <ArrowRight size={18} aria-hidden="true" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="ticket-pagination">
                <p>
                  {q.data.items.length} {q.data.items.length === 1 ? 'ticket' : 'tickets'} on this
                  page
                </p>
                <div>
                  {cursor && (
                    <Button variant="secondary" onClick={() => change('cursor', '')}>
                      First page
                    </Button>
                  )}
                  {q.data.nextCursor && (
                    <Button variant="secondary" onClick={() => change('cursor', q.data.nextCursor)}>
                      Next page
                      <ArrowRight size={16} aria-hidden="true" />
                    </Button>
                  )}
                </div>
              </div>
            </>
          )}
        </TabPanel>
      </section>
      <div className="help-footer-note">
        <LockKeyhole size={17} aria-hidden="true" />
        <p>Your ticket conversations stay between the requester and the assigned support team.</p>
      </div>
    </>
  )
}
function NewCase() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [kind, setKind] = useState<Schema['CaseInput']['kind']>(
    () => kinds.find((value) => value === params.get('kind')) ?? 'support',
  )
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [key, setKey] = useState(() => crypto.randomUUID())
  const m = useMutation({
    mutationFn: (input: Schema['CaseInput']) =>
      send<Schema['ServiceCase']>('/cases', input, 'POST', { 'Idempotency-Key': key }),
    onSuccess: async (item) => {
      navigate(`/cases/${encodeURIComponent(item.id)}?created=1`, { replace: true })
      await refresh()
    },
  })
  const edit = () => {
    m.reset()
    setKey(crypto.randomUUID())
  }
  return (
    <>
      <Link to={listURL(params)} className="help-back">
        <ArrowLeft size={17} aria-hidden="true" />
        Back to tickets
      </Link>
      <header className="help-heading">
        <div>
          <span className="help-eyebrow">Let’s work through it</span>
          <h1>New support ticket</h1>
          <p>Tell us what you need. Follow-up replies will stay in this ticket.</p>
        </div>
      </header>
      <div className="ticket-detail-layout">
        <form
          className="ticket-new-form ticket-surface"
          aria-label="New support ticket"
          onSubmit={(event) => {
            event.preventDefault()
            m.mutate({ kind, title: title.trim(), body: body.trim() })
          }}
        >
          <fieldset disabled={m.isPending}>
            <legend className="sr-only">Ticket details</legend>
            <Field label="What can we help with?">
              <select
                value={kind}
                onChange={(event) => {
                  setKind(event.target.value as Schema['CaseInput']['kind'])
                  edit()
                }}
              >
                {kinds.map((value) => (
                  <option key={value} value={value}>
                    {t(`cases.kinds.${value}`)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Subject" hint="Give your ticket a clear, specific title.">
              <input
                required
                minLength={5}
                maxLength={120}
                value={title}
                onChange={(event) => {
                  setTitle(event.target.value)
                  edit()
                }}
              />
            </Field>
            <Field
              label="Describe your issue"
              hint="Include relevant class dates or booking details. Do not share passwords or payment-card details."
            >
              <textarea
                required
                minLength={10}
                maxLength={3000}
                rows={8}
                value={body}
                onChange={(event) => {
                  setBody(event.target.value)
                  edit()
                }}
              />
            </Field>
            <p className="ticket-character-count">{body.length}/3000</p>
            <MutationError error={m.error} />
            <div className="ticket-form-actions">
              <Button busy={m.isPending}>
                <Send size={16} aria-hidden="true" />
                Submit ticket
              </Button>
              <Link
                className="btn secondary"
                aria-disabled={m.isPending || undefined}
                onClick={(event) => {
                  if (m.isPending) event.preventDefault()
                }}
                to={listURL(params)}
              >
                Cancel
              </Link>
            </div>
          </fieldset>
        </form>
        <aside className="ticket-guidance ticket-surface">
          <span className="ticket-guide-icon">
            <LifeBuoy size={24} aria-hidden="true" />
          </span>
          <h2>A little detail helps</h2>
          <ul>
            <li>Explain what happened and what you expected.</li>
            <li>Include dates and the class or booking involved.</li>
            <li>Keep replies in the same ticket so the full conversation stays together.</li>
          </ul>
          {kind.startsWith('privacy_') && <Alert>{t('cases.privacy')}</Alert>}
          {kind === 'safeguarding' && (
            <Alert>
              Safeguarding details are restricted to you and an assigned administrator. For
              immediate danger, contact local emergency services. This inbox is not an emergency
              service.
            </Alert>
          )}
          <div className="ticket-guide-footer">
            <LockKeyhole size={17} aria-hidden="true" />
            <p>
              Your details are visible to you and the operator who takes responsibility for your
              ticket.
            </p>
          </div>
        </aside>
      </div>
    </>
  )
}
function CaseDetail({ id }: { id: string }) {
  const { t, i18n } = useTranslation()
  const user = useAuth().data!.user
  const [params, setParams] = useSearchParams()
  const [draft, setDraft] = useState<Pick<Schema['CaseAction'], 'body' | 'action'>>({
    body: '',
    action: 'reply',
  })
  const before = params.get('before') ?? ''
  const q = useQuery({
    queryKey: ['cases', 'detail', id, before],
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) =>
      api<Schema['CaseDetail']>(
        `/cases/${encodeURIComponent(id)}?cursor=${encodeURIComponent(before)}`,
        { signal },
      ),
    refetchOnWindowFocus: true,
  })
  const claim = useMutation({
    mutationFn: (version: number) =>
      send(`/cases/${encodeURIComponent(id)}/action`, { action: 'claim', version, body: '' }),
    onSuccess: refresh,
  })
  const pageReplies = (value: string) =>
    setParams((previous) => {
      const next = new URLSearchParams(previous)
      if (value) next.set('before', value)
      else next.delete('before')
      next.delete('created')
      return next
    })
  if (q.isPending) return <Loading />
  if (q.isError)
    return (
      <>
        <Link to={listURL(params)} className="help-back">
          <ArrowLeft size={17} />
          Back to tickets
        </Link>
        <LoadError retry={() => void q.refetch()} />
      </>
    )
  const item = q.data.case
  const guidance =
    item.status === 'resolved'
      ? item.canReopen
        ? 'Still need help? Reopen this ticket below and tell us what is missing.'
        : 'This ticket is resolved. The requester can reopen it if more help is needed.'
      : item.status === 'waiting_family'
        ? item.canManage
          ? 'Waiting for the requester to provide more information.'
          : 'The support team needs more information. Add your reply below.'
        : item.assignedTo
          ? 'A support team member has taken responsibility for this ticket.'
          : 'Your ticket is saved and awaiting a support team member.'
  return (
    <>
      <Link to={listURL(params)} className="help-back">
        <ArrowLeft size={17} aria-hidden="true" />
        Back to tickets
      </Link>
      {params.get('created') === '1' && (
        <Alert kind="success">Ticket submitted. You can follow its status and replies here.</Alert>
      )}
      <header className="help-heading ticket-detail-heading">
        <div>
          <span className="help-eyebrow">{t(`cases.kinds.${item.kind}`)}</span>
          <h1>{item.restricted ? 'Restricted ticket' : item.title}</h1>
        </div>
        <TicketStatus status={item.status} />
      </header>
      <div className="ticket-detail-layout">
        <div className="ticket-main">
          {item.restricted ? (
            <section className="ticket-surface ticket-restricted">
              <LockKeyhole size={30} aria-hidden="true" />
              <h2>Take responsibility to view this ticket</h2>
              <p>
                Only the requester and assigned operator can open the conversation. Safeguarding
                tickets are restricted to eligible administrators.
              </p>
              <MutationError error={claim.error} />
              {item.canClaim && (
                <Button busy={claim.isPending} onClick={() => claim.mutate(item.version)}>
                  Take ticket
                </Button>
              )}
            </section>
          ) : (
            <>
              <section
                className="ticket-conversation ticket-surface"
                aria-label="Ticket conversation"
                aria-busy={q.isFetching}
              >
                <div className="ticket-conversation-heading">
                  <h2>Conversation</h2>
                  <span>
                    <LockKeyhole size={14} aria-hidden="true" />
                    Private
                  </span>
                </div>
                {q.isPlaceholderData && (
                  <p className="ticket-loading" role="status">
                    Loading replies…
                  </p>
                )}
                <article className="ticket-original">
                  <div className="ticket-message-heading">
                    <strong>Original request</strong>
                    <time dateTime={item.createdAt}>
                      {indiaDate(item.createdAt, i18n.language)}
                    </time>
                  </div>
                  <p>{item.body}</p>
                </article>
                {(before || q.data.messages.nextCursor) && (
                  <nav className="ticket-history-pages" aria-label="Conversation pages">
                    <p>{before ? 'Showing earlier replies' : 'Showing the latest replies'}</p>
                    <div>
                      {before && (
                        <Button variant="secondary" onClick={() => pageReplies('')}>
                          Latest replies
                        </Button>
                      )}
                      {q.data.messages.nextCursor && (
                        <Button
                          variant="secondary"
                          onClick={() => pageReplies(q.data.messages.nextCursor)}
                        >
                          Earlier replies
                        </Button>
                      )}
                    </div>
                  </nav>
                )}
                {!q.data.messages.items.length ? (
                  <div className="ticket-no-replies">
                    <LifeBuoy size={23} aria-hidden="true" />
                    <p>No replies yet. Any response from the team will appear here.</p>
                  </div>
                ) : (
                  <ol className="ticket-messages">
                    {q.data.messages.items.map((message) => (
                      <li
                        key={message.id}
                        className="ticket-message"
                        data-requester={message.fromRequester}
                      >
                        <article>
                          <div className="ticket-message-heading">
                            <div>
                              <span className="ticket-avatar" aria-hidden="true">
                                {message.fromRequester ? (
                                  message.authorName.charAt(0).toUpperCase()
                                ) : (
                                  <LifeBuoy size={17} />
                                )}
                              </span>
                              <div>
                                <strong>{message.authorName}</strong>
                                <span className="ticket-message-role">
                                  {message.fromRequester ? 'Requester' : 'Support team'}
                                </span>
                              </div>
                            </div>
                            <time dateTime={message.createdAt}>
                              {indiaDate(message.createdAt, i18n.language)}
                            </time>
                          </div>
                          {message.action && message.action !== 'reply' && (
                            <p className="ticket-message-event">
                              {
                                (
                                  {
                                    resolve: 'Marked as resolved',
                                    waiting_family: 'Requested more information',
                                    reopen: 'Reopened this ticket',
                                  } as Record<string, string>
                                )[message.action]
                              }
                            </p>
                          )}
                          <p>{message.body}</p>
                        </article>
                      </li>
                    ))}
                  </ol>
                )}
              </section>
              <CaseResponse
                item={item}
                draft={draft}
                onDraft={(values) => setDraft((current) => ({ ...current, ...values }))}
                onLatest={() => pageReplies('')}
                onRefresh={() => void q.refetch()}
              />
            </>
          )}
        </div>
        <aside className="ticket-sidebar">
          <section className="ticket-surface ticket-details">
            <h2>Ticket details</h2>
            <dl>
              <div>
                <dt>Ticket ID</dt>
                <dd className="ticket-full-id">{item.id}</dd>
              </div>
              <div>
                <dt>Category</dt>
                <dd>{t(`cases.kinds.${item.kind}`)}</dd>
              </div>
              <div>
                <dt>Assigned to</dt>
                <dd>
                  {item.assignedTo === user.id
                    ? 'You'
                    : item.assignedTo
                      ? 'Support team'
                      : 'Awaiting assignment'}
                </dd>
              </div>
              <div>
                <dt>Created</dt>
                <dd>
                  <time dateTime={item.createdAt}>{indiaDate(item.createdAt, i18n.language)}</time>
                </dd>
              </div>
              <div>
                <dt>Last updated</dt>
                <dd>
                  <time dateTime={item.updatedAt}>{indiaDate(item.updatedAt, i18n.language)}</time>
                </dd>
              </div>
            </dl>
          </section>
          <section className="ticket-next-step">
            <CheckCircle2 size={20} aria-hidden="true" />
            <p>{guidance}</p>
          </section>
          {item.kind.startsWith('privacy_') && <Alert>{t('cases.privacy')}</Alert>}
        </aside>
      </div>
    </>
  )
}
function CaseResponse({
  item,
  draft,
  onDraft,
  onLatest,
  onRefresh,
}: {
  item: Schema['ServiceCase']
  draft: Pick<Schema['CaseAction'], 'body' | 'action'>
  onDraft: (values: Partial<Pick<Schema['CaseAction'], 'body' | 'action'>>) => void
  onLatest: () => void
  onRefresh: () => void
}) {
  const { body, action } = draft
  const m = useMutation({
    mutationFn: (input: Schema['CaseAction']) =>
      send(`/cases/${encodeURIComponent(item.id)}/action`, input),
    onSuccess: async () => {
      onDraft({ body: '', action: 'reply' })
      onLatest()
      await refresh()
    },
  })
  const selected = item.canReopen ? 'reopen' : item.canManage ? action : 'reply'
  const labels: Record<string, string> = {
    reply: 'Send reply',
    resolve: 'Resolve ticket',
    waiting_family: 'Request information',
    reopen: 'Reopen ticket',
  }
  if (!item.canReply && !item.canReopen) return null
  return (
    <form
      className="ticket-reply ticket-surface"
      aria-label={item.canReopen ? 'Reopen ticket' : 'Reply to ticket'}
      onSubmit={(event) => {
        event.preventDefault()
        m.mutate({ action: selected, version: item.version, body: body.trim() })
      }}
    >
      <h2>{item.canReopen ? 'Need more help?' : 'Add a reply'}</h2>
      <fieldset disabled={m.isPending}>
        <legend className="sr-only">Your response</legend>
        <Field
          label={
            item.canReopen
              ? 'What still needs help?'
              : selected === 'resolve'
                ? 'Resolution details'
                : 'Your reply'
          }
          hint={
            item.canReopen
              ? 'Your message will reopen this ticket and keep the conversation together.'
              : 'Visible to the requester and assigned support team.'
          }
        >
          <textarea
            required
            minLength={selected === 'reply' ? 5 : 10}
            maxLength={3000}
            rows={5}
            value={body}
            onChange={(event) => {
              onDraft({ body: event.target.value })
              m.reset()
            }}
          />
        </Field>
        {m.error instanceof APIError && m.error.code === 'stale_version' ? (
          <Alert kind="error">
            <p>
              This ticket has changed. Refresh the conversation before sending again. Your draft is
              kept.
            </p>
            <Button variant="secondary" type="button" onClick={onRefresh}>
              Refresh conversation
            </Button>
          </Alert>
        ) : (
          <MutationError error={m.error} />
        )}
        {m.isSuccess && (
          <Alert kind="success">
            {m.variables?.action === 'reopen' ? 'Ticket reopened.' : 'Response sent.'}
          </Alert>
        )}
        <div className="ticket-reply-actions">
          {item.canManage && (
            <Field label="After sending">
              <select
                value={action}
                onChange={(event) => {
                  onDraft({ action: event.target.value as Schema['CaseAction']['action'] })
                  m.reset()
                }}
              >
                <option value="reply">Keep ticket active</option>
                <option value="waiting_family">Wait for requester</option>
                <option value="resolve">Resolve ticket</option>
              </select>
            </Field>
          )}
          <Button busy={m.isPending}>
            <Send size={16} aria-hidden="true" />
            {labels[selected]}
          </Button>
        </div>
      </fieldset>
    </form>
  )
}
