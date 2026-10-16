import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { api, send, type Schema } from '../lib/api'
import { Alert, Button, Field, Loading, LoadError, MutationError } from './ui'
import { TabBar, TabPanel } from './workspace-tabs'

type Draft = Schema['TeachingAgreementDraft']
export function TeachingAgreementBuilder() {
  const [mode, setMode] = useState('online')
  const [notice, setNotice] = useState('')
  const q = useQuery({
    queryKey: ['teaching-agreements'],
    refetchOnWindowFocus: false,
    queryFn: ({ signal }) => api<{ items: Draft[] }>('/admin/teaching-agreements', { signal }),
  })
  return (
    <section className="tu-stack">
      <header>
        <h2>Teaching agreements</h2>
        <p>
          Write the tutor's responsibilities and policies for each teaching mode. Published changes
          apply to new bookings; signed bookings keep their original document.
        </p>
      </header>
      {notice && <Alert kind="success">{notice}</Alert>}
      <TabBar
        id="agreement-mode"
        label="Teaching agreement mode"
        value={mode}
        options={[
          { value: 'online', label: 'Online' },
          { value: 'home', label: 'Home Tuition (offline)' },
        ]}
        onChange={setMode}
      />
      {q.isPending ? (
        <Loading />
      ) : q.isError ? (
        <LoadError retry={() => void q.refetch()} />
      ) : (
        q.data.items.map((item) => (
          <TabPanel
            key={item.mode}
            id="agreement-mode"
            value={item.mode}
            active={mode === item.mode}
            preserve
          >
            <DraftEditor
              key={`${item.mode}:${item.version}`}
              value={item}
              onEdit={() => setNotice('')}
              refresh={(message) => {
                setNotice(message)
                void q.refetch()
              }}
            />
          </TabPanel>
        ))
      )}
    </section>
  )
}
function DraftEditor({
  value,
  refresh,
  onEdit,
}: {
  value: Draft
  refresh: (message: string) => void
  onEdit: () => void
}) {
  const [content, setContent] = useState(value.draft)
  const [publishConfirmed, setPublishConfirmed] = useState(false)
  const mutation = useMutation({
    mutationFn: (action: 'save' | 'publish') =>
      send<Draft>(
        `/admin/teaching-agreements/${value.mode}`,
        { version: value.version, action, content },
        'PUT',
      ),
    onSuccess: (_, action) => {
      refresh(
        action === 'publish'
          ? 'Agreement published for new bookings.'
          : 'Draft saved. The published agreement is unchanged.',
      )
    },
  })
  return (
    <div className="tu-panel tu-stack">
      <p>
        {value.published
          ? `Published version ${value.published.version}`
          : 'Not published — new bookings in this mode are unavailable until an agreement is published.'}
      </p>
      {(['title', 'body', 'privacy', 'education'] as const).map((key) => (
        <Field
          key={key}
          label={
            {
              title: 'Agreement title',
              body: 'Tutor responsibilities, do’s and don’ts',
              privacy: 'Privacy policy conditions',
              education: 'Education policy conditions',
            }[key]
          }
        >
          {key === 'title' ? (
            <input
              value={content[key]}
              maxLength={150}
              onChange={(e) => {
                onEdit()
                setContent({ ...content, [key]: e.target.value })
              }}
            />
          ) : (
            <textarea
              rows={key === 'body' ? 9 : 5}
              maxLength={key === 'body' ? 20000 : 15000}
              value={content[key]}
              onChange={(e) => {
                onEdit()
                setContent({ ...content, [key]: e.target.value })
              }}
            />
          )}
        </Field>
      ))}
      <details className="tu-disclosure">
        <summary>Preview agreement</summary>
        <div
          className="agreement-document"
          role="region"
          aria-label="Agreement preview"
          tabIndex={0}
        >
          <h3>{content.title}</h3>
          <p>{content.body}</p>
          <h4>Privacy conditions</h4>
          <p>{content.privacy}</p>
          <h4>Education conditions</h4>
          <p>{content.education}</p>
        </div>
      </details>
      <label className="tu-check">
        <input
          type="checkbox"
          checked={publishConfirmed}
          onChange={(e) => setPublishConfirmed(e.target.checked)}
        />
        I have reviewed this agreement and its policies and want to publish it for new bookings.
      </label>
      <MutationError error={mutation.error} />
      <div className="button-row">
        <Button
          variant="secondary"
          busy={mutation.isPending}
          onClick={() => mutation.mutate('save')}
        >
          Save draft
        </Button>
        <Button
          disabled={!publishConfirmed}
          busy={mutation.isPending}
          onClick={() => mutation.mutate('publish')}
        >
          Publish agreement
        </Button>
      </div>
    </div>
  )
}
