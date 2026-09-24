import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Link, useSearchParams } from 'react-router-dom'
import { ShieldCheck, Monitor } from 'lucide-react'
import { api, send, setCSRF, queryClient, indiaDate, type Schema } from '../lib/api'
import { Alert, Button, Field, Loading, LoadError, MutationError } from '../components/ui'
import '../styles/tuition.css'
import { TabBar, TabPanel, useActivePanel } from '../components/workspace-tabs'
export default function Account() {
  const { t } = useTranslation()
  const [saved, setSaved] = useState(false)
  const [params, setParams] = useSearchParams()
  const tab = ['password', 'signins'].includes(params.get('tab') ?? '')
    ? params.get('tab')!
    : 'profile'
  const q = useQuery({
    queryKey: ['account'],
    queryFn: ({ signal }) => api<Schema['Account']>('/account', { signal }),
  })
  return (
    <div className="tu-page account-page">
      <header className="tu-heading">
        <div>
          <h1>{t('account.title')}</h1>
        </div>
        <span className="tu-book">
          <ShieldCheck aria-hidden="true" />
        </span>
      </header>
      <TabBar
        id="account"
        label={t('account.title')}
        value={tab}
        options={['profile', 'password', 'signins'].map((value) => ({
          value,
          label: t(`experience.${value === 'signins' ? 'signIns' : value}`),
        }))}
        onChange={(value) => {
          const next = new URLSearchParams(params)
          next.set('tab', value)
          setParams(next)
        }}
      />
      <TabPanel id="account" value="profile" active={tab === 'profile'} preserve>
        {saved && <Alert kind="success">{t('account.saved')}</Alert>}
        {q.isPending ? (
          <Loading />
        ) : q.isError ? (
          <LoadError retry={() => void q.refetch()} />
        ) : (
          <Details key={q.data.preferences.version} data={q.data} onSaved={() => setSaved(true)} />
        )}
      </TabPanel>
      <TabPanel id="account" value="password" active={tab === 'password'} preserve>
        <PasswordChange />
      </TabPanel>
      <TabPanel id="account" value="signins" active={tab === 'signins'}>
        <Sessions />
      </TabPanel>
      <Link className="text-link account-help" to="/cases">
        {t('account.recovery')}
      </Link>
    </div>
  )
}
function Details({ data, onSaved }: { data: Schema['Account']; onSaved: () => void }) {
  const { t, i18n } = useTranslation(),
    [name, setName] = useState(data.name),
    [language, setLanguage] = useState(data.preferences.language)
  const save = useMutation({
    mutationFn: () =>
      send('/account', { name, language, version: data.preferences.version }, 'PUT'),
    onSuccess: async () => {
      onSaved()
      await i18n.changeLanguage(language)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['account'] }),
        queryClient.invalidateQueries({ queryKey: ['me'] }),
      ])
    },
  })
  return (
    <section className="tu-panel">
      <h2>{t('account.details')}</h2>
      <form
        className="tu-stack"
        onSubmit={(e) => {
          e.preventDefault()
          save.mutate()
        }}
      >
        <Field label={t('account.name')}>
          <input
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            minLength={2}
            maxLength={80}
            required
            disabled={save.isPending}
          />
        </Field>
        <Field label={t('account.email')} hint={t('account.emailHelp')}>
          <input value={data.email} type="email" readOnly autoComplete="email" />
        </Field>
        <Field label={t('account.language')}>
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value as 'en' | 'hi')}
            disabled={save.isPending}
          >
            <option value="en">English</option>
            <option value="hi">हिन्दी</option>
          </select>
        </Field>
        <MutationError error={save.error} />
        <Button busy={save.isPending}>{t('account.save')}</Button>
      </form>
    </section>
  )
}
function PasswordChange() {
  const { t } = useTranslation(),
    [current, setCurrent] = useState(''),
    [next, setNext] = useState(''),
    [confirm, setConfirm] = useState(''),
    [mismatch, setMismatch] = useState(false)
  const change = useMutation({
    mutationFn: () =>
      send<Schema['Auth']>('/account/password', { currentPassword: current, newPassword: next }),
    onSuccess: async (data) => {
      setCSRF(data.csrf)
      queryClient.setQueryData(['me'], data)
      setCurrent('')
      setNext('')
      setConfirm('')
      await queryClient.invalidateQueries({ queryKey: ['account', 'sessions'] })
    },
  })
  return (
    <section className="tu-panel">
      <h2>{t('account.security')}</h2>
      <p>{t('account.securityBody')}</p>
      <form
        className="tu-stack"
        onSubmit={(e) => {
          e.preventDefault()
          setMismatch(next !== confirm)
          if (next === confirm) change.mutate()
        }}
      >
        <Field label={t('account.current')}>
          <input
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            required
            maxLength={128}
            disabled={change.isPending}
          />
        </Field>
        <Field label={t('account.new')} hint={t('account.hint')}>
          <input
            type="password"
            autoComplete="new-password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            required
            minLength={15}
            maxLength={128}
            disabled={change.isPending}
          />
        </Field>
        <Field label={t('account.confirm')}>
          <input
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            minLength={15}
            maxLength={128}
            disabled={change.isPending}
          />
        </Field>
        {mismatch && <Alert kind="error">{t('account.mismatch')}</Alert>}
        <MutationError error={change.error} />
        {change.isSuccess && <Alert kind="success">{t('account.changed')}</Alert>}
        <Button busy={change.isPending}>{t('account.security')}</Button>
      </form>
    </section>
  )
}
function Sessions() {
  const active = useActivePanel()
  const { t, i18n } = useTranslation(),
    [cursor, setCursor] = useState('')
  const q = useQuery({
    queryKey: ['account', 'sessions', cursor],
    enabled: active,
    queryFn: ({ signal }) =>
      api<Schema['AccountSessions']>(`/account/sessions?cursor=${encodeURIComponent(cursor)}`, {
        signal,
      }),
  })
  const revoke = useMutation({
    mutationFn: (id: string) => send(`/account/sessions/${id}/revoke`, {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['account', 'sessions'] }),
  })
  return (
    <section className="tu-panel">
      <h2>{t('account.sessions')}</h2>
      <MutationError error={revoke.error} />
      {revoke.isSuccess && <Alert kind="success">{t('account.revoked')}</Alert>}
      {q.isPending ? (
        <Loading />
      ) : q.isError ? (
        <LoadError retry={() => void q.refetch()} />
      ) : (
        <>
          <div className="tu-session-list">
            {q.data.items.map((s) => (
              <article className="tu-panel" key={s.id}>
                <div className="tu-card-top">
                  <h3>
                    <Monitor size={18} aria-hidden="true" />{' '}
                    {t(s.current ? 'account.thisSession' : 'account.otherSession')}
                  </h3>
                </div>
                <p>
                  {t('account.expires')}: {indiaDate(s.expiresAt, i18n.language)}
                </p>
                {!s.current && (
                  <Button
                    variant="secondary"
                    busy={revoke.isPending}
                    onClick={() => revoke.mutate(s.id)}
                  >
                    {t('account.revoke')}
                  </Button>
                )}
              </article>
            ))}
          </div>
          <div className="tu-actions">
            {cursor && (
              <Button variant="text" onClick={() => setCursor('')}>
                {t('tuition.firstPage')}
              </Button>
            )}
            {q.data.nextCursor && (
              <Button variant="secondary" onClick={() => setCursor(q.data.nextCursor)}>
                {t('tuition.nextPage')}
              </Button>
            )}
          </div>
        </>
      )}
    </section>
  )
}
