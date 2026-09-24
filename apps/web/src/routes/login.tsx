import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  ArrowRight,
  BookOpen,
  Check,
  Eye,
  EyeOff,
  GraduationCap,
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
type LoginRole = 'parent' | 'tutor' | 'staff'

const loginRoles = [
  { value: 'parent', label: 'authParentLogin', title: 'authParentLoginTitle', icon: UsersRound },
  { value: 'tutor', label: 'authTutor', title: 'authTutorLoginTitle', icon: GraduationCap },
  { value: 'staff', label: 'authStaffLogin', title: 'authStaffTitle', icon: ShieldCheck },
] as const

export default function Login() {
  const { t } = useTranslation()
  const config = useConfig()
  const auth = useAuth()
  const { pathname } = useLocation()
  const signup = pathname.replace(/\/+$/, '') === '/signup'
  const [params] = useSearchParams()
  const staff = !signup && params.get('staff') === '1'
  const initialRole =
    params.get('role') === 'tutor' ||
    (!params.has('role') && /^\/(apply|availability)(\?|$)/.test(params.get('return') ?? ''))
      ? 'tutor'
      : 'parent'
  const signedInRole = auth.data?.user.role
  const loginRole: LoginRole = signedInRole
    ? signedInRole === 'parent' || signedInRole === 'tutor'
      ? signedInRole
      : 'staff'
    : staff
      ? 'staff'
      : initialRole
  const loginIdentity = loginRoles.find((item) => item.value === loginRole)!
  const LoginIcon = loginIdentity.icon
  const [visible, setVisible] = useState(false)
  const navigate = useNavigate()
  const form = useForm<AccountValues>({
    resolver: zodResolver(accountSchema),
    defaultValues: {
      name: '',
      email: '',
      password: '',
      role: initialRole,
      adult: false,
    },
  })
  const role = useWatch({ control: form.control, name: 'role' })
  const rawReturn = params.get('return')
  const returnPath =
    rawReturn &&
    /^\/(workspace|apply|match|availability|notifications|account|tuition(?:\/[a-zA-Z0-9_-]+)?|billing(?:\/[a-zA-Z0-9_-]+)?|cases(?:\/[a-zA-Z0-9_-]+)?)(\?|$)/.test(
      rawReturn,
    )
      ? rawReturn
      : undefined
  const accountPath = (accountRole: LoginRole, create = false) => {
    const nextParams = new URLSearchParams()
    if (accountRole === 'staff') nextParams.set('staff', '1')
    else nextParams.set('role', accountRole)
    if (returnPath) nextParams.set('return', returnPath)
    return `${create ? '/signup' : '/login'}?${nextParams.toString()}`
  }
  const switchPath = accountPath(role, !signup)
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
        <div className="auth-wordmark">
          {config.data?.appName ?? t('brand')}
          <span>.</span>
          <small>{t('authBrandLine')}</small>
        </div>
      </header>
      <main
        className={`auth-stage ${signup ? 'auth-signup-stage' : 'auth-login-stage'}`}
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
          {!staff && !auth.data && (
            <div className="auth-form-top">
              <span>{t(signup ? 'authAlready' : 'authNewHere')}</span>
              <Link to={switchPath}>
                {t(signup ? 'authSignIn' : 'authCreate')}
                <ArrowRight size={14} />
              </Link>
            </div>
          )}
          <div className="auth-form-content">
            {!signup && !auth.data && (
              <nav className="auth-login-roles" aria-label={t('authAccountType')}>
                {loginRoles.map(({ value, label, icon: Icon }) => (
                  <Link
                    key={value}
                    to={accountPath(value)}
                    aria-current={loginRole === value ? 'page' : undefined}
                  >
                    <Icon size={18} aria-hidden="true" />
                    <span>{t(label)}</span>
                  </Link>
                ))}
              </nav>
            )}
            {signup ? (
              <>
                <div className="auth-form-symbol">
                  <BookOpen size={23} />
                </div>
                <p className="auth-kicker">{t('authSignupKicker')}</p>
                <h1 id="auth-title">{t('authSignupTitle')}</h1>
                <p className="auth-subtitle">{t('authSignupBody')}</p>
              </>
            ) : (
              <div className="auth-login-heading">
                <div className="auth-form-symbol">
                  <LoginIcon size={23} aria-hidden="true" />
                </div>
                <h1 id="auth-title">{t(loginIdentity.title)}</h1>
              </div>
            )}
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
            ) : staff && !config.data.development ? (
              <Alert>{t('authStaffUnavailable')}</Alert>
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
          </div>
          {signup && (
            <div className="auth-form-bottom">
              <Link to={accountPath('staff')}>
                {t('staff')}
                <ArrowRight size={13} />
              </Link>
            </div>
          )}
        </section>
      </main>
    </div>
  )
}
