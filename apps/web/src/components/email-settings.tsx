import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { api, queryClient, send, indiaDate, type Schema } from '../lib/api'
import { useConfig } from '../lib/session'
import { Alert, Button, Loading, LoadError, MutationError } from './ui'
import { EmailCodeForm } from './email-code-form'

export function EmailSettings({ data }: { data: Schema['Account'] }) {
  const config = useConfig()
  const [verifying, setVerifying] = useState(false)
  const prefs = useQuery({
    queryKey: ['email-preferences'],
    queryFn: ({ signal }) =>
      api<Schema['EmailPreferences']>('/account/email/preferences', { signal }),
  })
  const save = useMutation({
    mutationFn: () =>
      send(
        '/account/email/preferences',
        { reminders: !prefs.data!.reminders, version: prefs.data!.version },
        'PUT',
      ),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['email-preferences'] }),
        queryClient.invalidateQueries({ queryKey: ['account'] }),
      ])
    },
  })
  return (
    <section className="tu-panel email-settings" aria-labelledby="email-settings-title">
      <h2 id="email-settings-title">Email and reminders</h2>
      <p>{data.email}</p>
      {data.emailVerifiedAt ? (
        <p>Email verified on {indiaDate(data.emailVerifiedAt, 'en')}.</p>
      ) : (
        <>
          <p>Your email address has not been verified.</p>
          {config.data?.emailEnabled &&
            (verifying ? (
              <EmailCodeForm
                purpose="verify"
                email={data.email}
                onSuccess={async () => {
                  setVerifying(false)
                  await Promise.all([
                    queryClient.invalidateQueries({ queryKey: ['account'] }),
                    queryClient.invalidateQueries({ queryKey: ['me'] }),
                  ])
                }}
              />
            ) : (
              <Button variant="secondary" onClick={() => setVerifying(true)}>
                Verify email address
              </Button>
            ))}
        </>
      )}
      {!config.data?.emailEnabled && (
        <Alert>
          Email delivery is not configured yet. Contact support@gocoaching.in for account help.
        </Alert>
      )}
      <h3>Class reminders</h3>
      <p>
        Receive emails 24 hours and 1 hour before confirmed trials and regular classes. Booking and
        account security emails remain enabled.
      </p>
      {prefs.isPending ? (
        <Loading />
      ) : prefs.isError ? (
        <LoadError retry={() => void prefs.refetch()} />
      ) : (
        <>
          <p>Reminder emails are {prefs.data.reminders ? 'on' : 'off'}.</p>
          <Button variant="secondary" busy={save.isPending} onClick={() => save.mutate()}>
            {prefs.data.reminders ? 'Turn reminders off' : 'Turn reminders on'}
          </Button>
        </>
      )}
      <MutationError error={save.error} />
    </section>
  )
}
