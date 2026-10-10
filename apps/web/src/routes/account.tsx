import '../locales/account'
import '../locales/experience'
import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Link, useSearchParams } from 'react-router-dom'
import { MapPin, Monitor } from 'lucide-react'
import { api, send, setCSRF, queryClient, indiaDate, type Schema } from '../lib/api'
import { Alert, Button, Field, Loading, LoadError, MutationError } from '../components/ui'
import {
  CurrentLocationButton,
  locationLabel,
  type StoredLocation,
} from '../components/location-search'
import { useAuth } from '../lib/session'
import { EmailDeliveries } from '../components/email-deliveries'
import { EmailSettings } from '../components/email-settings'
import '../styles/tuition.css'
import { TabBar, TabPanel, useActivePanel } from '../components/workspace-tabs'
export default function Account() {
  const { t } = useTranslation()
  const [saved, setSaved] = useState(false)
  const auth = useAuth()
  const tabs =
    auth.data?.user.role === 'admin'
      ? ['profile', 'password', 'signins', 'mail']
      : ['profile', 'password', 'signins']
  const [params, setParams] = useSearchParams()
  const tab = tabs.includes(params.get('tab') ?? '') ? params.get('tab')! : 'profile'
  const q = useQuery({
    queryKey: ['account'],
    queryFn: ({ signal }) => api<Schema['Account']>('/account', { signal }),
  })
  return (
    <div className="tu-page account-page">
      <h1 className="sr-only">{t('account.title')}</h1>
      <TabBar
        id="account"
        label={t('account.title')}
        value={tab}
        options={tabs.map((value) => ({
          value,
          label:
            value === 'mail'
              ? 'Emails'
              : t(`experience.${value === 'signins' ? 'signIns' : value}`),
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
          <div className="tu-stack">
            <Details
              key={q.data.preferences.version}
              data={q.data}
              onSaved={() => setSaved(true)}
            />
            <EmailSettings data={q.data} />
          </div>
        )}
      </TabPanel>
      <TabPanel id="account" value="password" active={tab === 'password'} preserve>
        <PasswordChange />
      </TabPanel>
      <TabPanel id="account" value="signins" active={tab === 'signins'}>
        <Sessions />
      </TabPanel>
      {auth.data?.user.role === 'admin' && (
        <TabPanel id="account" value="mail" active={tab === 'mail'}>
          <EmailDeliveries />
        </TabPanel>
      )}
      <Link className="text-link account-help" to="/cases">
        {t('account.recovery')}
      </Link>
    </div>
  )
}
function Details({ data, onSaved }: { data: Schema['Account']; onSaved: () => void }) {
  const { t } = useTranslation(),
    [name, setName] = useState(data.name)
  const [location, setLocation] = useState<StoredLocation | null>(data.preferences.location ?? null)
  const [changingLocation, setChangingLocation] = useState(!data.preferences.location)
  const save = useMutation({
    mutationFn: (nextLocation?: StoredLocation | null) =>
      send(
        '/account',
        {
          name,
          language: 'en',
          location: nextLocation === undefined ? location : nextLocation,
          version: data.preferences.version,
        },
        'PUT',
      ),
    onSuccess: async () => {
      onSaved()
      setChangingLocation(false)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['account'] }),
        queryClient.invalidateQueries({ queryKey: ['email-preferences'] }),
        queryClient.invalidateQueries({ queryKey: ['me'] }),
        queryClient.invalidateQueries({ queryKey: ['tutors'] }),
      ])
    },
  })
  const saveDetectedLocation = (nextLocation: StoredLocation) => {
    setLocation(nextLocation)
    save.mutate(nextLocation)
  }
  return (
    <section className="tu-panel">
      <h2>{t('account.details')}</h2>
      <form
        className="tu-stack account-profile-form"
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
        <div className="account-location-box">
          <div className="account-location-title">
            <MapPin size={18} aria-hidden="true" />
            <div>
              <h3>{t('account.location')}</h3>
              <p>{t('account.locationBody')}</p>
            </div>
          </div>
          {location && !changingLocation ? (
            <div className="account-location-summary">
              <span>
                <small>{t('account.currentLocation')}</small>
                <strong>{locationLabel(location)}</strong>
                {(location.city || location.state || location.postalCode) && (
                  <em>
                    {[location.city, location.state, location.postalCode]
                      .filter(Boolean)
                      .join(', ')}
                  </em>
                )}
              </span>
              <Button type="button" variant="secondary" onClick={() => setChangingLocation(true)}>
                {t('account.changeLocation')}
              </Button>
            </div>
          ) : (
            <>
              {!location && <p className="hint">{t('account.locationEmpty')}</p>}
              <CurrentLocationButton onLocationChange={saveDetectedLocation}>
                {t(location ? 'account.useCurrentLocationAgain' : 'account.useCurrentLocation')}
              </CurrentLocationButton>
            </>
          )}
          {save.isSuccess && <p className="hint success-text">{t('account.locationSaved')}</p>}
        </div>
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
        className="tu-stack account-password-form"
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
            minLength={8}
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
            minLength={8}
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
