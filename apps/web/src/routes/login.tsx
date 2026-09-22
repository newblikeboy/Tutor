import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  Eye,
  EyeOff,
  GraduationCap,
  Languages,
  LockKeyhole,
  Mail,
  ShieldCheck,
  UsersRound,
} from 'lucide-react'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { queryClient, send, setCSRF } from '../lib/api'
import type { Schema } from '../lib/api'
import { useAuth, useConfig } from '../lib/session'
import { Alert, Button, Field, LinkButton, Loading, Modal, MutationError } from '../components/ui'
import '../styles/auth.css'

const accountSchema = z.object({
  name: z.string(),
  email: z.string().trim().email(),
  password: z.string().min(1).max(512),
  role: z.enum(['parent', 'tutor']),
  adult: z.boolean(),
})
type AccountValues = z.infer<typeof accountSchema>

export default function Login() {
  const { t, i18n } = useTranslation()
  const config = useConfig()
  const auth = useAuth()
  const { pathname } = useLocation()
  const signup = pathname.replace(/\/+$/, '') === '/signup'
  const [params] = useSearchParams()
  const staff = !signup && params.get('staff') === '1'
  const [visible, setVisible] = useState(false)
  const navigate = useNavigate()
  const form = useForm<AccountValues>({
    resolver: zodResolver(accountSchema),
    defaultValues: {
      name: '',
      email: '',
      password: '',
      role:
        params.get('role') === 'tutor' || params.get('return')?.startsWith('/apply')
          ? 'tutor'
          : 'parent',
      adult: false,
    },
  })
  const role = useWatch({ control: form.control, name: 'role' })
  const rawReturn = params.get('return')
  const returnPath =
    rawReturn && /^\/(workspace|apply|match)(\?|$)/.test(rawReturn) ? rawReturn : undefined
  const nextParams = new URLSearchParams()
  if (returnPath) nextParams.set('return', returnPath)
  const switchPath =
    (signup ? '/login' : '/signup') + (nextParams.size ? '?' + nextParams.toString() : '')
  const mutation = useMutation({
    mutationFn: (values: AccountValues) =>
      send<Schema['Auth']>(
        signup ? '/auth/signup' : '/auth/login',
        signup ? values : { email: values.email, password: values.password },
      ),
    onSuccess: async (data) => {
      await queryClient.cancelQueries()
      queryClient.clear()
      setCSRF(data.csrf)
      queryClient.setQueryData(['me'], data)
      form.reset()
      navigate(returnPath ?? (signup && data.user.role === 'tutor' ? '/apply' : '/workspace'), {
        replace: true,
      })
    },
  })
  const submit = form.handleSubmit((values) => {
    if (signup) {
      let invalid = false
      if (values.name.trim().length < 2 || values.name.trim().length > 80) {
        form.setError('name', { message: t('authNameError') })
        invalid = true
      }
      if (Array.from(values.password).length < 15 || Array.from(values.password).length > 128) {
        form.setError('password', { message: t('authPasswordHint') })
        invalid = true
      }
      if (!values.adult) {
        form.setError('adult', { message: t('authAdultRequired') })
        invalid = true
      }
      if (invalid) return
    }
    mutation.mutate(values)
  })
  return (
    <div className="auth-experience">
      <a className="skip-link" href="#auth-main">
        {t('skip')}
      </a>
      <header className="auth-header">
        <Link to="/" className="auth-wordmark">
          {config.data?.appName ?? t('brand')}
          <span>.</span>
          <small>{t('authBrandLine')}</small>
        </Link>
        <nav aria-label={t('menu')}>
          <Link to="/tutors" className="auth-browse">
            <ArrowLeft size={16} />
            {t('authExplore')}
          </Link>
          <button
            className="auth-language"
            onClick={() => void i18n.changeLanguage(i18n.language === 'en' ? 'hi' : 'en')}
          >
            <Languages size={17} />
            {t('language')}
          </button>
        </nav>
      </header>
      <main
        className={`auth-stage ${signup ? 'auth-signup-stage' : ''}`}
        id="auth-main"
        tabIndex={-1}
      >
        <aside className="auth-story" aria-label={t('authStoryLabel')}>
          <div className="auth-story-top">
            <span className="auth-story-dot" />
            {t('authStoryEyebrow')}
            <span className="auth-story-number">01 — 03</span>
          </div>
          <div className="auth-story-copy">
            <h2>
              {t(signup ? 'authStorySignup' : 'authStoryTitle')}
              <em>{t(signup ? 'authStorySignupAccent' : 'authStoryAccent')}</em>
            </h2>
            <p>{t('authStoryBody')}</p>
          </div>
          <div className="auth-learning-art" aria-hidden="true">
            <div className="auth-orbit orbit-one" />
            <div className="auth-orbit orbit-two" />
            <div className="auth-art-star">✳</div>
            <div className="auth-note note-back">
              <span>ABC</span>
              <div />
              <div />
              <div />
            </div>
            <div className="auth-note note-front">
              <div className="auth-note-heading">
                <BookOpen size={19} />
                <span>{t('authArtTitle')}</span>
                <span>↗</span>
              </div>
              <div className="auth-number-line">
                <span>0</span>
                <span>½</span>
                <span>1</span>
                <i />
                <b />
              </div>
              <div className="auth-art-equation">
                ½ + ½ <span>=</span> 1
              </div>
              <div className="auth-note-bottom">
                <Check size={15} />
                {t('authArtCaption')}
              </div>
            </div>
            <div className="auth-art-label">
              <span className="auth-tiny-line" />
              {t('authArtSide')}
            </div>
            <div className="auth-art-seal">
              <GraduationCap size={23} />
            </div>
          </div>
          <div className="auth-story-footer">
            <span>{t('authStoryPlace')}</span>
            <span>{t('authStoryFooter')}</span>
          </div>
        </aside>
        <section className="auth-form-side" aria-labelledby="auth-title">
          <div className="auth-form-top">
            <span>{t(staff ? 'authStaffKicker' : signup ? 'authAlready' : 'authNewHere')}</span>
            <Link to={staff ? '/login' : switchPath}>
              {t(staff ? 'authBackFamily' : signup ? 'authSignIn' : 'authCreate')}
              <ArrowRight size={14} />
            </Link>
          </div>
          <div className="auth-form-content">
            <div className="auth-form-symbol">
              {staff ? (
                <ShieldCheck size={23} />
              ) : signup ? (
                <BookOpen size={23} />
              ) : (
                <LockKeyhole size={23} />
              )}
            </div>
            <p className="auth-kicker">
              {t(staff ? 'authStaffKicker' : signup ? 'authSignupKicker' : 'authWelcomeKicker')}
            </p>
            <h1 id="auth-title">
              {t(staff ? 'authStaffTitle' : signup ? 'authSignupTitle' : 'authLoginTitle')}
            </h1>
            <p className="auth-subtitle">
              {t(staff ? 'authStaffBody' : signup ? 'authSignupBody' : 'authLoginBody')}
            </p>
            {config.isPending || auth.isPending ? (
              <Loading />
            ) : config.isError ? (
              <div className="auth-load-error">
                <Alert kind="error">
                  <strong>{t('authLoadTitle')}</strong>
                  <p>{t('authLoadBody')}</p>
                </Alert>
                <Button variant="secondary" onClick={() => void config.refetch()}>
                  {t('retry')}
                </Button>
              </div>
            ) : auth.data ? (
              <div className="auth-signed-in">
                <p>{t('authSignedIn', { name: auth.data.user.name })}</p>
                <LinkButton to={returnPath ?? '/workspace'}>{t('viewWorkspace')}</LinkButton>
              </div>
            ) : !config.data?.authEnabled ? (
              <Alert>{t('authUnavailable')}</Alert>
            ) : (
              <form onSubmit={submit} noValidate className="auth-form">
                {signup && (
                  <fieldset className="auth-role-picker">
                    <legend>{t('authAccountFor')}</legend>
                    {[
                      { value: 'parent', label: 'authParent', icon: UsersRound },
                      { value: 'tutor', label: 'authTutor', icon: GraduationCap },
                    ].map(({ value, label, icon: Icon }) => (
                      <label key={value} className={role === value ? 'selected' : ''}>
                        <input {...form.register('role')} type="radio" value={value} />
                        <Icon size={19} />
                        <span>{t(label)}</span>
                        <Check size={14} className="auth-role-check" />
                      </label>
                    ))}
                  </fieldset>
                )}
                {signup && (
                  <Field label={t('authName')} error={form.formState.errors.name?.message}>
                    <input
                      {...form.register('name')}
                      autoComplete="name"
                      maxLength={80}
                      placeholder={t('authNamePlaceholder')}
                      aria-invalid={!!form.formState.errors.name}
                    />
                  </Field>
                )}
                <Field
                  label={t('authEmail')}
                  error={form.formState.errors.email ? t('authEmailError') : undefined}
                >
                  <input
                    {...form.register('email')}
                    type="email"
                    autoComplete="username"
                    inputMode="email"
                    autoCapitalize="none"
                    spellCheck={false}
                    maxLength={254}
                    placeholder="you@example.com"
                    aria-invalid={!!form.formState.errors.email}
                  />
                </Field>
                <div className="auth-password-wrap">
                  <Field
                    label={t('authPassword')}
                    hint={signup ? t('authPasswordHint') : undefined}
                    error={
                      form.formState.errors.password
                        ? form.formState.errors.password.message === t('authPasswordHint')
                          ? t('authPasswordHint')
                          : t('authPasswordRequired')
                        : undefined
                    }
                  >
                    <input
                      {...form.register('password')}
                      type={visible ? 'text' : 'password'}
                      autoComplete={signup ? 'new-password' : 'current-password'}
                      maxLength={512}
                      placeholder={t(
                        signup ? 'authPasswordPlaceholder' : 'authPasswordLoginPlaceholder',
                      )}
                      aria-invalid={!!form.formState.errors.password}
                    />
                  </Field>
                  <button
                    type="button"
                    className="auth-password-toggle"
                    aria-label={t(visible ? 'authHidePassword' : 'authShowPassword')}
                    aria-pressed={visible}
                    onClick={() => setVisible(!visible)}
                  >
                    {visible ? <EyeOff size={19} /> : <Eye size={19} />}
                  </button>
                </div>
                {signup ? (
                  <div>
                    <label className="auth-adult">
                      <input
                        type="checkbox"
                        {...form.register('adult')}
                        aria-invalid={!!form.formState.errors.adult}
                        aria-describedby={form.formState.errors.adult ? 'adult-error' : undefined}
                      />
                      <span>{t('authAdult')}</span>
                    </label>
                    {form.formState.errors.adult && (
                      <p id="adult-error" className="field-error">
                        {t('authAdultRequired')}
                      </p>
                    )}
                    {role === 'tutor' && (
                      <p className="auth-approval-note">
                        <ShieldCheck size={16} />
                        {t('authTutorApproval')}
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="auth-help-row">
                    <span>
                      <LockKeyhole size={13} />
                      {t('authPrivate')}
                    </span>
                    <Modal
                      title={t('authHelpTitle')}
                      description={t('authHelpBody')}
                      trigger={
                        <button type="button" className="auth-help-link">
                          {t('authHelp')}
                        </button>
                      }
                    >
                      <LinkButton to="/support">{t('support')}</LinkButton>
                    </Modal>
                  </div>
                )}
                <MutationError error={mutation.error} />
                <Button type="submit" busy={mutation.isPending} className="auth-submit">
                  {t(mutation.isPending ? 'authWorking' : signup ? 'authCreate' : 'authSignIn')}
                  <ArrowRight size={18} />
                </Button>
                {signup && (
                  <p className="auth-privacy">
                    {t('authPrivacyIntro')} <Link to="/privacy">{t('authPrivacyLink')}</Link>.
                  </p>
                )}
              </form>
            )}
            <div className="auth-form-divider">
              <span />
              {t('authCare')}
              <span />
            </div>
            <div className="auth-trust-points">
              <span>
                <ShieldCheck size={16} />
                {t('authTrustAssessment')}
              </span>
              <span>
                <BookOpen size={16} />
                {t('authTrustContinuity')}
              </span>
            </div>
          </div>
          <div className="auth-form-bottom">
            <span>{config.data?.development ? t('authPreview') : t('authBrandLine')}</span>
            <Link to={staff ? '/login' : '/login?staff=1'}>
              {t(staff ? 'authBackFamily' : 'staff')}
              <ArrowRight size={13} />
            </Link>
          </div>
        </section>
      </main>
      <footer className="auth-footer">
        <p>{t('authFooter')}</p>
        <Link to="/support">
          <Mail size={14} />
          {t('authNeedHand')}
        </Link>
      </footer>
    </div>
  )
}
