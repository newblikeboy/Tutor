import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { useMutation } from '@tanstack/react-query'
import { ArrowRightLeft, X } from 'lucide-react'
import { queryClient, send, type Schema } from '../lib/api'
import { Alert, Button, Field, MutationError } from './ui'

export function TutorChangeRequest({
  enrollment,
  handovers,
}: {
  enrollment: Schema['Enrollment']
  handovers: Schema['Handover'][]
}) {
  const [open, setOpen] = useState(false)
  const [key, setKey] = useState(() => crypto.randomUUID())
  const pending = handovers.some((h) => ['requested', 'awaiting_tutor'].includes(h.status))
  const request = useMutation({
    mutationFn: (reason: string) =>
      send(`/enrollments/${enrollment.id}/handovers`, { reason, consent: true }, 'POST', {
        'Idempotency-Key': key,
      }),
    onSuccess: async () => {
      setOpen(false)
      setKey(crypto.randomUUID())
      await queryClient.invalidateQueries({ queryKey: ['tuition', enrollment.id] })
    },
  })
  if (pending)
    return (
      <Alert>
        Your tutor-change request is being handled by the admin team. Your current tutor continues
        until a replacement accepts.
      </Alert>
    )
  if (!['active', 'paused'].includes(enrollment.status))
    return <p>Tutor changes are available for current bookings.</p>
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!request.isPending) {
          setOpen(next)
          request.reset()
        }
      }}
    >
      <Dialog.Trigger asChild>
        <Button>
          <ArrowRightLeft size={17} aria-hidden="true" />
          Request tutor change
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content
          className="dialog-content"
          onEscapeKeyDown={(e) => {
            if (request.isPending) e.preventDefault()
          }}
          onPointerDownOutside={(e) => {
            if (request.isPending) e.preventDefault()
          }}
        >
          <Dialog.Title className="dialog-title">Request tutor change</Dialog.Title>
          <Dialog.Description>
            The admin team will review your request and arrange an approved replacement for{' '}
            {enrollment.learnerName}.
          </Dialog.Description>
          <Dialog.Close
            className="icon-button dialog-close"
            aria-label="Close"
            disabled={request.isPending}
          >
            <X size={18} aria-hidden="true" />
          </Dialog.Close>
          <form
            className="tu-stack"
            onSubmit={(event) => {
              event.preventDefault()
              request.mutate(String(new FormData(event.currentTarget).get('reason') ?? '').trim())
            }}
          >
            <Field label="Reason for tutor change">
              <textarea
                name="reason"
                required
                minLength={10}
                maxLength={1000}
                rows={4}
                disabled={request.isPending}
                onChange={() => setKey(crypto.randomUUID())}
              />
            </Field>
            <label className="tu-check">
              <input type="checkbox" required disabled={request.isPending} />I agree to share the
              student's learning record with the approved replacement tutor.
            </label>
            <MutationError error={request.error} />
            <Button type="submit" busy={request.isPending}>
              Send request to admin
            </Button>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
