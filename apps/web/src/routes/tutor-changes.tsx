import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowLeft, ArrowRightLeft } from 'lucide-react'
import { api, send, queryClient, indiaDate, type Schema } from '../lib/api'
import { useAuth } from '../lib/session'
import { allTutors, approvedTutorSubjects, tutorHasMode } from '../lib/tutors'
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
import { SubjectNames } from '../components/subject-name'
import { WorkspaceRecordTable } from '../components/workspace-record-table'
import '../styles/tuition.css'
import '../styles/tutor-changes.css'

export default function TutorChanges() {
  const auth = useAuth()
  const [params, setParams] = useSearchParams()
  const id = params.get('request'),
    status = params.get('status') ?? '',
    cursor = params.get('cursor') ?? ''
  const q = useQuery({
    queryKey: ['tutor-changes', id, status, cursor],
    enabled: auth.data?.user.role === 'admin',
    queryFn: ({ signal }) =>
      api<Schema['TutorChangePage']>(
        id
          ? `/admin/tutor-changes/${encodeURIComponent(id)}`
          : `/admin/tutor-changes?${new URLSearchParams({ status, cursor })}`,
        { signal },
      ),
    refetchInterval: 15000,
  })
  if (auth.data?.user.role !== 'admin')
    return <Alert>This section is available to administrators.</Alert>
  function change(name: string, value: string) {
    const next = new URLSearchParams(params)
    if (value) next.set(name, value)
    else next.delete(name)
    if (name === 'status') next.delete('cursor')
    setParams(next)
  }
  return (
    <div className="tu-page tutor-change-page">
      <header className="tu-heading">
        <div>
          <h1>Tutor change requests</h1>
          <p>Review parent requests and arrange an approved replacement.</p>
        </div>
        <ArrowRightLeft size={27} aria-hidden="true" />
      </header>
      {id ? (
        <Button variant="text" onClick={() => change('request', '')}>
          <ArrowLeft size={16} aria-hidden="true" />
          Back to requests
        </Button>
      ) : (
        <Field label="Request status">
          <select value={status} onChange={(e) => change('status', e.target.value)}>
            <option value="">Open requests</option>
            <option value="requested">Needs admin review</option>
            <option value="awaiting_tutor">Awaiting replacement acceptance</option>
            <option value="closed">Closed requests</option>
          </select>
        </Field>
      )}
      {q.isPending ? (
        <Loading />
      ) : q.isError ? (
        <LoadError retry={() => void q.refetch()} />
      ) : id ? (
        q.data.items[0] ? (
          <Review key={`${id}:${q.data.items[0].request.status}`} item={q.data.items[0]} />
        ) : (
          <Empty title="Request unavailable" body="Choose a request from the queue." />
        )
      ) : (
        <>
          {q.data.items.length ? (
            <WorkspaceRecordTable
              label="Tutor change requests"
              intro="Review the request before inviting an approved replacement tutor."
              countLabel={`${q.data.items.length} ${q.data.items.length === 1 ? 'request' : 'requests'} on this page`}
              columns={[
                'Student',
                'Current tutor',
                'Class & mode',
                'Requested',
                'Status',
                'Action',
              ]}
            >
              {q.data.items.map((item) => (
                <tr key={item.request.id}>
                  <th scope="row">{item.learnerName}</th>
                  <td>{item.tutorName}</td>
                  <td>
                    Class {item.class}
                    <span>{item.mode === 'home' ? 'Home Tuition' : 'Online'}</span>
                  </td>
                  <td>{indiaDate(item.request.createdAt, 'en')}</td>
                  <td>
                    <Badge tone="neutral">{statusLabel(item.request.status)}</Badge>
                  </td>
                  <td>
                    <Link
                      className="btn secondary"
                      to={`?${new URLSearchParams({ ...Object.fromEntries(params), request: item.request.id })}`}
                    >
                      Review<span className="sr-only"> request for {item.learnerName}</span>
                    </Link>
                  </td>
                </tr>
              ))}
            </WorkspaceRecordTable>
          ) : (
            <Empty title="No tutor-change requests" body="Parent requests will appear here." />
          )}
          <div className="tu-actions">
            {cursor && (
              <Button variant="secondary" onClick={() => change('cursor', '')}>
                First page
              </Button>
            )}
            {q.data.nextCursor && (
              <Button variant="secondary" onClick={() => change('cursor', q.data.nextCursor)}>
                Next page
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  )
}
function statusLabel(status: string) {
  return (
    (
      {
        requested: 'Needs admin review',
        awaiting_tutor: 'Awaiting tutor',
        completed: 'Completed',
        rejected: 'Declined by admin',
        cancelled: 'Withdrawn',
        declined: 'Declined by tutor',
      } as Record<string, string>
    )[status] ?? status
  )
}
function Review({ item }: { item: Schema['TutorChangeReview'] }) {
  const [action, setAction] = useState('prepare')
  const tutors = useQuery({
    queryKey: ['tutor-change-options', item.class, item.mode],
    enabled: item.request.status === 'requested',
    queryFn: ({ signal }) =>
      allTutors(
        `/tutors?${new URLSearchParams({ class: String(item.class), mode: item.mode })}`,
        signal,
      ),
  })
  const eligible =
    tutors.data?.filter(
      (t) =>
        t.id !== item.request.oldTutorId &&
        (!item.request.newTutorId || t.id === item.request.newTutorId) &&
        t.scope.minClass <= item.class &&
        t.scope.maxClass >= item.class &&
        tutorHasMode(t, item.mode) &&
        item.subjects.every((s) => approvedTutorSubjects(t.scope).includes(s)),
    ) ?? []
  const m = useMutation({
    mutationFn: (body: unknown) => send(`/handovers/${item.request.id}/action`, body),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ['tutor-changes'] }),
        queryClient.invalidateQueries({ queryKey: ['tuition'] }),
      ]),
  })
  return (
    <section className="tu-panel tu-stack">
      <div className="tu-card-top">
        <h2>{item.learnerName}</h2>
        <Badge tone="neutral">{statusLabel(item.request.status)}</Badge>
      </div>
      <p>
        {item.tutorName} · Class {item.class} · {item.mode === 'home' ? 'Home Tuition' : 'Online'}
      </p>
      <p>
        <SubjectNames values={item.subjects} />
      </p>
      <h3>Parent's request</h3>
      <p>{item.request.reason}</p>
      {item.request.status === 'requested' ? (
        <form
          className="tu-stack"
          onSubmit={(event) => {
            event.preventDefault()
            const data = new FormData(event.currentTarget)
            m.mutate({
              action,
              nextSteps: String(data.get('nextSteps') ?? ''),
              ...(action === 'prepare' ? { tutorId: String(data.get('tutorId') ?? '') } : {}),
            })
          }}
        >
          <Field label="Admin decision">
            <select
              value={action}
              disabled={m.isPending}
              onChange={(e) => setAction(e.target.value)}
            >
              <option value="prepare">Arrange replacement</option>
              <option value="reject">Decline request</option>
            </select>
          </Field>
          {action === 'prepare' &&
            (tutors.isPending ? (
              <Loading />
            ) : tutors.isError ? (
              <LoadError retry={() => void tutors.refetch()} />
            ) : eligible.length ? (
              <Field label="Replacement tutor">
                <select name="tutorId" required disabled={m.isPending} defaultValue="">
                  <option value="" disabled>
                    Choose an approved tutor
                  </option>
                  {eligible.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </Field>
            ) : (
              <Alert>
                No approved replacement currently covers every booked subject and teaching mode.
              </Alert>
            ))}
          <Field label={action === 'prepare' ? 'Handover instructions' : 'Reason for declining'}>
            <textarea
              name="nextSteps"
              required
              minLength={10}
              maxLength={2000}
              rows={4}
              disabled={m.isPending}
            />
          </Field>
          <MutationError error={m.error} />
          <Button
            type="submit"
            busy={m.isPending}
            disabled={action === 'prepare' && (!eligible.length || tutors.isError)}
          >
            {action === 'prepare' ? 'Invite replacement tutor' : 'Decline request'}
          </Button>
          <p>
            The replacement must accept before the assignment changes. Their approval and
            availability must cover the remaining classes.
          </p>
        </form>
      ) : (
        <>
          {item.request.nextSteps && <p>{item.request.nextSteps}</p>}
          {item.request.status === 'awaiting_tutor' && (
            <Alert>
              The replacement has been invited. The current assignment continues until acceptance.
            </Alert>
          )}
        </>
      )}
    </section>
  )
}
