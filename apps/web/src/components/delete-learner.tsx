import { useRef, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { useMutation } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { queryClient, send, type Learner } from '../lib/api'
import { workspaceLink } from '../lib/workspace'
import { Button, MutationError } from './ui'
import '../styles/delete-learner.css'

export function DeleteLearner({ learner }: { learner: Learner }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const cancel = useRef<HTMLButtonElement>(null)
  const deleted = useRef(false)
  const navigate = useNavigate()
  const mutation = useMutation({
    mutationFn: () =>
      send(
        `/learners/${encodeURIComponent(learner.id)}`,
        { expectedVersion: learner.version },
        'DELETE',
      ),
    onSuccess: async () => {
      deleted.current = true
      setOpen(false)
      // Leave any selected/deleted learner URL before refreshing the household.
      navigate(workspaceLink('learners'), { replace: true })
      queryClient.removeQueries({ queryKey: ['learner-progress', 'parent', learner.id] })
      await queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(value) => {
        if (mutation.isPending) return
        mutation.reset()
        setOpen(value)
      }}
    >
      <Dialog.Trigger asChild>
        <button
          type="button"
          className="learner-delete-link"
          aria-label={`Delete learner ${learner.name}`}
        >
          <Trash2 size={15} aria-hidden="true" /> Delete learner
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content
          role="alertdialog"
          className="dialog-content learner-delete-dialog"
          onOpenAutoFocus={(event) => {
            event.preventDefault()
            cancel.current?.focus()
          }}
          onCloseAutoFocus={(event) => {
            if (deleted.current) {
              event.preventDefault()
              document.getElementById('desk-main')?.focus({ preventScroll: true })
            }
          }}
          onEscapeKeyDown={(event) => {
            if (mutation.isPending) event.preventDefault()
          }}
          onPointerDownOutside={(event) => event.preventDefault()}
        >
          <Dialog.Title className="dialog-title">Delete learner?</Dialog.Title>
          <Dialog.Description>
            Delete {learner.name}'s profile and any unbooked learning requests? This cannot be
            undone. Learners with trial, booking or progress history cannot be deleted.
          </Dialog.Description>
          <MutationError error={mutation.error} />
          <div className="button-row">
            <Dialog.Close asChild>
              <button
                ref={cancel}
                type="button"
                className="btn secondary"
                disabled={mutation.isPending}
              >
                {t('cancel')}
              </button>
            </Dialog.Close>
            <Button variant="danger" busy={mutation.isPending} onClick={() => mutation.mutate()}>
              Delete learner
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
