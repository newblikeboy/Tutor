import { useId, useState, type ReactNode } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { queryClient, send, type Schema } from '../lib/api'
import { useConfig } from '../lib/session'
import { useClock } from '../lib/clock'
import { Alert, Button, Field, MutationError } from './ui'

function ClassDialog({
  title,
  description,
  trigger,
  children,
  open,
  setOpen,
}: {
  title: string
  description: string
  trigger: ReactNode
  children: ReactNode
  open: boolean
  setOpen: (value: boolean) => void
}) {
  const descriptionID = useId()
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content
          className="dialog-content class-completion-dialog"
          aria-describedby={descriptionID}
        >
          <Dialog.Title className="dialog-title">{title}</Dialog.Title>
          <Dialog.Description id={descriptionID}>{description}</Dialog.Description>
          <Dialog.Close className="icon-button dialog-close" aria-label="Close">
            <X />
          </Dialog.Close>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
async function refreshClass(enrollmentID: string) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ['tuition', enrollmentID] }),
    queryClient.invalidateQueries({ queryKey: ['tuition'] }),
    queryClient.invalidateQueries({ queryKey: ['tutor-workspace'] }),
    queryClient.invalidateQueries({ queryKey: ['learner-progress'] }),
  ])
}
export function CompleteClass({
  session,
  enrollment,
}: {
  session: Schema['ClassSession']
  enrollment: Schema['Enrollment']
}) {
  const [open, setOpen] = useState(false)
  const [notes, setNotes] = useState('')
  const [homeworkGiven, setHomeworkGiven] = useState(false)
  const [homework, setHomework] = useState('')
  const [developmentRecord, setDevelopmentRecord] = useState(false)
  const config = useConfig()
  const now = useClock()
  const beforeEnd = Date.parse(session.end) > now
  const mutation = useMutation({
    mutationFn: () =>
      send(`/classes/${encodeURIComponent(session.id)}/action`, {
        action: 'complete',
        version: session.version,
        notes,
        homeworkGiven,
        homework,
        developmentRecord,
      }),
    onSuccess: async () => {
      setOpen(false)
      await refreshClass(enrollment.id)
    },
  })
  return (
    <ClassDialog
      title="Mark class completed"
      description={
        config.data?.emailEnabled
          ? 'Record what you taught. A completion email with a report link will be queued for the parent.'
          : 'Record what you taught. Email delivery is not configured; the parent can view the completion in their account.'
      }
      open={open}
      setOpen={setOpen}
      trigger={<Button>Mark class completed</Button>}
    >
      <form
        className="tu-stack"
        onSubmit={(e) => {
          e.preventDefault()
          mutation.mutate()
        }}
      >
        <Field label="What did you teach today?">
          <textarea
            rows={4}
            required
            minLength={10}
            maxLength={2000}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </Field>
        <label className="tu-check">
          <input
            type="checkbox"
            checked={homeworkGiven}
            onChange={(e) => setHomeworkGiven(e.target.checked)}
          />
          Did you give homework?
        </label>
        {homeworkGiven && (
          <Field label="Homework assigned">
            <textarea
              rows={2}
              required
              minLength={5}
              maxLength={1200}
              value={homework}
              onChange={(e) => setHomework(e.target.value)}
            />
          </Field>
        )}
        {beforeEnd &&
          (config.data?.development ? (
            <label className="tu-check">
              <input
                type="checkbox"
                checked={developmentRecord}
                onChange={(e) => setDevelopmentRecord(e.target.checked)}
              />
              Development test recording before the scheduled end; this does not assert real
              attendance.
            </label>
          ) : (
            <Alert>This class can be completed after its scheduled end.</Alert>
          ))}
        <MutationError error={mutation.error} />
        <div className="button-row">
          <Button disabled={beforeEnd && !developmentRecord} busy={mutation.isPending}>
            Complete class
          </Button>
          <Button variant="secondary" type="button" onClick={() => setOpen(false)}>
            Cancel
          </Button>
        </div>
      </form>
    </ClassDialog>
  )
}
export function ReportClassCompletion({
  session,
  enrollment,
}: {
  session: Schema['ClassSession']
  enrollment: Schema['Enrollment']
}) {
  const [params, setParams] = useSearchParams()
  const [open, setOpen] = useState(
    params.get('report') === '1' && params.get('class') === session.id,
  )
  const [reason, setReason] = useState('')
  const [key, setKey] = useState(() => crypto.randomUUID())
  const navigate = useNavigate()
  const mutation = useMutation({
    mutationFn: () =>
      send<Schema['ServiceCase']>(
        `/classes/${encodeURIComponent(session.id)}/report`,
        { version: session.version, reason },
        'POST',
        { 'Idempotency-Key': key },
      ),
    onSuccess: async (data) => {
      await refreshClass(enrollment.id)
      navigate(`/cases/${encodeURIComponent(data.id)}`)
    },
  })
  const changeOpen = (value: boolean) => {
    setOpen(value)
    if (!value && params.has('report')) {
      const next = new URLSearchParams(params)
      next.delete('report')
      setParams(next, { replace: true })
    }
  }
  return (
    <ClassDialog
      title="Report a class concern"
      description="Tell us if this class was marked completed by mistake or you have another concern. Your report opens a private support ticket for review."
      open={open}
      setOpen={changeOpen}
      trigger={<Button variant="secondary">Report a class concern</Button>}
    >
      <form
        className="tu-stack"
        onSubmit={(e) => {
          e.preventDefault()
          mutation.mutate()
        }}
      >
        <Field label="What happened?">
          <textarea
            rows={4}
            required
            minLength={10}
            maxLength={2000}
            value={reason}
            onChange={(e) => {
              setReason(e.target.value)
              setKey(crypto.randomUUID())
              mutation.reset()
            }}
          />
        </Field>
        <p>Submitting a concern does not automatically change attendance or issue a refund.</p>
        <MutationError error={mutation.error} />
        <Button busy={mutation.isPending}>Submit report</Button>
      </form>
    </ClassDialog>
  )
}
