import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Plus, BookOpen, X } from 'lucide-react'
import { useAuth } from '../lib/session'
import { useSubjects, subjectCatalogKey } from '../lib/subjects'
import { APIError, send, queryClient, type Schema } from '../lib/api'
import { Alert, Badge, Button, Empty, Field, Loading, LoadError } from '../components/ui'
import { WorkspaceRecordTable } from '../components/workspace-record-table'
import '../styles/subjects.css'

type Subject = Schema['Subject']
export default function SubjectMaster() {
  const auth = useAuth()
  const catalog = useSubjects()
  const [editing, setEditing] = useState<Subject | 'new' | null>(null)
  const [notice, setNotice] = useState('')
  if (!auth.data) return <Loading />
  if (auth.data.user.role !== 'admin')
    return <Alert kind="error">Only administrators can manage the Subject master.</Alert>
  return (
    <div className="subjects-page">
      <header className="subjects-heading">
        <div>
          <p className="eyebrow">Master data</p>
          <h1>Subject master</h1>
          <p>Manage the subjects used across GoCoaching.</p>
        </div>
        <Button
          onClick={() => {
            setNotice('')
            setEditing('new')
          }}
          disabled={editing !== null}
        >
          <Plus size={18} aria-hidden="true" />
          Add subject
        </Button>
      </header>
      <div className="subjects-guide">
        <BookOpen size={21} aria-hidden="true" />
        <p>
          Active subjects appear in applications, tutor discovery, bookings and the study library.
          Deactivation stops new selections; saved classes, agreements and reports stay available.
        </p>
      </div>
      {notice && <Alert kind="success">{notice}</Alert>}
      {editing && (
        <SubjectForm
          key={editing === 'new' ? 'new' : `${editing.id}-${editing.version}`}
          subject={editing === 'new' ? undefined : editing}
          cancel={() => setEditing(null)}
          saved={async (value) => {
            setEditing(null)
            setNotice(`${value.name} saved.`)
            await queryClient.invalidateQueries({ queryKey: subjectCatalogKey })
          }}
        />
      )}
      {catalog.isPending ? (
        <Loading />
      ) : catalog.isError ? (
        <LoadError retry={() => void catalog.refetch()} />
      ) : !catalog.rows.length ? (
        <Empty title="No subjects available" />
      ) : (
        <WorkspaceRecordTable
          label="Subject master"
          countLabel={`${catalog.rows.length} subjects · ${catalog.rows.filter((row) => row.active).length} active`}
          intro="Lower display-order numbers appear first."
          columns={['Subject', 'Availability', 'Display order', 'Manage']}
        >
          {catalog.rows.map((row) => (
            <tr key={row.id}>
              <th scope="row">
                <strong>{row.name}</strong>
                {row.system && <span>Classes 1–5 package · Protected</span>}
                {row.id !== row.name && <span>Original reference: {row.id}</span>}
              </th>
              <td>
                <Badge tone={row.active ? 'teal' : 'neutral'}>
                  {row.active ? 'Active' : 'Inactive'}
                </Badge>
              </td>
              <td>{row.sortOrder}</td>
              <td>
                <Button
                  variant="text"
                  disabled={editing !== null}
                  onClick={() => {
                    setNotice('')
                    setEditing(row)
                  }}
                >
                  Edit<span className="sr-only"> {row.name}</span>
                </Button>
              </td>
            </tr>
          ))}
        </WorkspaceRecordTable>
      )}
    </div>
  )
}

function SubjectForm({
  subject,
  cancel,
  saved,
}: {
  subject?: Subject
  cancel: () => void
  saved: (subject: Subject) => Promise<void>
}) {
  const [name, setName] = useState(subject?.name ?? '')
  const [active, setActive] = useState(subject?.active ?? true)
  const [order, setOrder] = useState(subject?.sortOrder ?? 100)
  const mutation = useMutation({
    mutationFn: () =>
      send<Subject>(
        subject ? `/admin/subjects/${encodeURIComponent(subject.id)}` : '/admin/subjects',
        { name, active, sortOrder: order, expectedVersion: subject?.version ?? 0 },
        subject ? 'PUT' : 'POST',
      ),
    onSuccess: saved,
  })
  return (
    <form
      className="subject-form"
      onSubmit={(event) => {
        event.preventDefault()
        mutation.mutate()
      }}
    >
      <div className="subjects-heading">
        <h2>{subject ? 'Edit subject' : 'Add subject'}</h2>
        <Button
          type="button"
          variant="text"
          aria-label="Close subject editor"
          disabled={mutation.isPending}
          onClick={cancel}
        >
          <X size={18} />
        </Button>
      </div>
      <fieldset disabled={mutation.isPending}>
        <legend className="sr-only">Subject details</legend>
        <Field
          label="Subject name"
          hint={
            subject?.system
              ? 'All Subjects is required for Classes 1–5.'
              : subject
                ? 'Updates the displayed name. Saved subject references stay intact.'
                : 'Use a clear, unique subject name.'
          }
        >
          <input
            autoFocus
            required
            minLength={2}
            maxLength={80}
            value={name}
            readOnly={subject?.system}
            onChange={(event) => setName(event.target.value)}
          />
        </Field>
        <Field label="Display order">
          <input
            type="number"
            required
            min={0}
            max={999}
            value={order}
            onChange={(event) => setOrder(Number(event.target.value))}
          />
        </Field>
        <label className="subject-active">
          <input
            type="checkbox"
            checked={active}
            disabled={subject?.system}
            onChange={(event) => setActive(event.target.checked)}
          />
          <span>Available for new selections</span>
        </label>
      </fieldset>
      {mutation.error && (
        <Alert kind="error">
          {mutation.error instanceof APIError
            ? mutation.error.message
            : 'The subject could not be saved. Please try again.'}
        </Alert>
      )}
      <div className="subject-form-actions">
        <Button type="submit" busy={mutation.isPending}>
          Save subject
        </Button>
        <Button type="button" variant="secondary" disabled={mutation.isPending} onClick={cancel}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
