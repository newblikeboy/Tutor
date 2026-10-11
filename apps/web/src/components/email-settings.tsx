import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Bell, CheckCircle2, Mail } from 'lucide-react'
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
      <div className="account-section-heading">
        <Mail size={20} aria-hidden="true" />
        <h2 id="email-settings-title">Email and reminders</h2>
      </div>
      <div className="account-email-status">
        <p className="account-email-address">{data.email}</p>
        {data.emailVerifiedAt ? (
          <p className="account-email-verified">
            <CheckCircle2 size={16} aria-hidden="true" />{' '}
            <span>Email verified on {indiaDate(data.emailVerifiedAt, 'en')}.</span>
          </p>
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
      </div>
      <div className="account-reminders">
        <h3>
          <Bell size={18} aria-hidden="true" /> Class reminders
        </h3>
        <p>
          Receive emails 24 hours and 1 hour before confirmed trials and regular classes. Booking
          and account security emails remain enabled.
        </p>
        {prefs.isPending ? (
          <Loading />
        ) : prefs.isError ? (
          <LoadError retry={() => void prefs.refetch()} />
        ) : (
          <>
            <p className="account-reminder-status" data-enabled={prefs.data.reminders}>
              Reminder emails are {prefs.data.reminders ? 'on' : 'off'}.
            </p>
            <Button variant="secondary" busy={save.isPending} onClick={() => save.mutate()}>
              {prefs.data.reminders ? 'Turn reminders off' : 'Turn reminders on'}
            </Button>
          </>
        )}
        <MutationError error={save.error} />
      </div>
    </section>
  )
}
