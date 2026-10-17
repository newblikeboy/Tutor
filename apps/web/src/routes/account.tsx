import '../locales/account'
import '../locales/experience'
import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowRight, CircleHelp, LockKeyhole, MapPin, Monitor, UserRound } from 'lucide-react'
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
import { GoogleConnection } from '../components/google-connection'
import { TeachingAgreementBuilder } from '../components/teaching-agreement-builder'
import '../styles/tuition.css'
import { TabBar, TabPanel, useActivePanel } from '../components/workspace-tabs'
import '../styles/account.css'
export default function Account() {
  const { t } = useTranslation()
  const auth = useAuth()
  const tabs =
    auth.data?.user.role === 'admin'
      ? ['profile', 'password', 'signins', 'mail', 'agreements']
      : ['profile', 'password', 'signins']
  const [params, setParams] = useSearchParams()
  const tab = tabs.includes(params.get('tab') ?? '') ? params.get('tab')! : 'profile'
  return (
    <div className="tu-page account-page">
      <header className="account-heading">
        <h1>
          {tab === 'agreements'
            ? 'Agreement Builder'
            : auth.data?.user.role === 'parent'
              ? t('parent.account')
              : t('account.title')}
        </h1>
        <p>
          {tab === 'agreements'
            ? 'Manage the agreements tutors sign before accepting a new booking.'
            : t('account.intro')}
        </p>
      </header>
      <TabBar
        id="account"
        scrollable
        label={t('account.title')}
        value={tab}
        options={tabs.map((value) => ({
          value,
          label:
            value === 'mail'
              ? 'Emails'
              : value === 'agreements'
                ? 'Agreement Builder'
                : t(`experience.${value === 'signins' ? 'signIns' : value}`),
        }))}
        onChange={(value) => {
          const next = new URLSearchParams(params)
          next.set('tab', value)
          setParams(next)
        }}
      />
      <TabPanel id="account" value="profile" active={tab === 'profile'} preserve>
        <AccountDetails />
      </TabPanel>
      <TabPanel id="account" value="password" active={tab === 'password'} preserve>
        <PasswordChange />
      </TabPanel>
      <TabPanel id="account" value="signins" active={tab === 'signins'}>
        <AccountSignIns />
      </TabPanel>
      {auth.data?.user.role === 'admin' && (
        <TabPanel id="account" value="mail" active={tab === 'mail'}>
          <EmailDeliveries />
        </TabPanel>
      )}
      {auth.data?.user.role === 'admin' && (
        <TabPanel id="account" value="agreements" active={tab === 'agreements'}>
          <TeachingAgreementBuilder />
        </TabPanel>
      )}
      <AccountHelp />
    </div>
  )
}
export function AccountDetails() {
  const { t } = useTranslation()
  const [saved, setSaved] = useState(false)
  const active = useActivePanel()
  const q = useQuery({
    queryKey: ['account'],
    queryFn: ({ signal }) => api<Schema['Account']>('/account', { signal }),
    enabled: active,
  })
  return (
    <>
      {saved && <Alert kind="success">{t('account.saved')}</Alert>}
      {q.isPending ? (
        <Loading />
      ) : q.isError ? (
        <LoadError retry={() => void q.refetch()} />
      ) : (
        <div className="account-profile-layout">
          <Details key={q.data.preferences.version} data={q.data} onSaved={() => setSaved(true)} />
          <EmailSettings data={q.data} />
        </div>
      )}
    </>
  )
}
export function AccountSignIns() {
  const auth = useAuth()
  return (
    <>
      <Sessions />
      {auth.data?.user.role === 'tutor' && <GoogleConnection />}
    </>
  )
}
export function AccountHelp() {
  const { t } = useTranslation()
  return (
    <footer className="account-help">
      <CircleHelp size={20} aria-hidden="true" />
      <Link className="text-link" to="/cases">
        {t('account.recovery')}
        <ArrowRight size={16} aria-hidden="true" />
      </Link>
    </footer>
  )
}
function Details({ data, onSaved }: { data: Schema['Account']; onSaved: () => void }) {
  const tutor = useAuth().data?.user.role === 'tutor'
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
        queryClient.invalidateQueries({ queryKey: ['tutor-workspace'] }),
        queryClient.invalidateQueries({ queryKey: ['tutor-profile'] }),
        queryClient.invalidateQueries({ queryKey: ['tutor'] }),
        queryClient.invalidateQueries({ queryKey: ['application'] }),
      ])
    },
  })
  const saveDetectedLocation = (nextLocation: StoredLocation) => {
    setLocation(nextLocation)
    save.mutate(nextLocation)
  }
  return (
    <section className="tu-panel account-details">
      <div className="account-section-heading">
        <UserRound size={20} aria-hidden="true" />
        <h2>{t('account.details')}</h2>
      </div>
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
              <h3>{tutor ? 'Tutor location' : t('account.location')}</h3>
              <p>
                {tutor
                  ? 'Used for student distances and new Home Tuition matches.'
                  : t('account.locationBody')}
              </p>
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
              {!location && (
                <p className="hint">
                  {tutor ? 'No tutor location saved yet.' : t('account.locationEmpty')}
                </p>
              )}
              <CurrentLocationButton onLocationChange={saveDetectedLocation}>
                {t(location ? 'account.useCurrentLocationAgain' : 'account.useCurrentLocation')}
              </CurrentLocationButton>
            </>
          )}
          {save.isSuccess && (
            <p className="hint success-text">
              {tutor ? 'Tutor location saved.' : t('account.locationSaved')}
            </p>
          )}
        </div>
        <MutationError error={save.error} />
        <Button busy={save.isPending}>{t('account.save')}</Button>
      </form>
    </section>
  )
}
export function PasswordChange() {
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
    <section className="tu-panel account-security">
      <div className="account-section-heading">
        <LockKeyhole size={20} aria-hidden="true" />
        <div>
          <h2>{t('account.security')}</h2>
          <p>{t('account.securityBody')}</p>
        </div>
      </div>
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
    <section className="tu-panel account-signins">
      <div className="account-section-heading">
        <Monitor size={20} aria-hidden="true" />
        <h2>{t('account.sessions')}</h2>
      </div>
      <MutationError error={revoke.error} />
      {revoke.isSuccess && <Alert kind="success">{t('account.revoked')}</Alert>}
      {q.isPending ? (
        <Loading />
      ) : q.isError ? (
        <LoadError retry={() => void q.refetch()} />
      ) : (
        <>
          <div className="account-session-list">
            {q.data.items.map((s) => (
              <article className="account-session" key={s.id} data-current={s.current}>
                <Monitor size={20} aria-hidden="true" />
                <div>
                  <h3>{t(s.current ? 'account.thisSession' : 'account.otherSession')}</h3>
                  <p>
                    {t('account.expires')}:{' '}
                    <time dateTime={s.expiresAt}>{indiaDate(s.expiresAt, i18n.language)}</time>
                  </p>
                </div>
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
