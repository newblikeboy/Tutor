import type { ReactNode } from 'react'
import { Suspense, useEffect, useRef } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
  ArrowUpRight,
  BookOpen,
  CalendarDays,
  ChevronRight,
  ClipboardCheck,
  FileText,
  GraduationCap,
  LayoutDashboard,
  Languages,
  LogOut,
  Menu,
  ShieldCheck,
  Sprout,
  Users,
  X,
} from 'lucide-react'
import * as Dialog from '@radix-ui/react-dialog'
import { useAuth, useConfig, useTutorApplication } from '../lib/session'
import { api, queryClient, send, setCSRF, type Schema } from '../lib/api'
import {
  initials,
  workspaceLink,
  workspaceView,
  workspaceNavigationView,
  workspaceNavigationViews,
} from '../lib/workspace'
import type { WorkspaceView } from '../lib/workspace'
import { useClock } from '../lib/clock'
import { Button, Empty, LinkButton, Loading, LoadError, MutationError } from './ui'
import '../styles/workspace.css'
import '../styles/experience.css'

const icons: Record<WorkspaceView, typeof BookOpen> = {
  overview: LayoutDashboard,
  learners: Users,
  sessions: CalendarDays,
  progress: Sprout,
  assessments: ClipboardCheck,
  reviews: BookOpen,
  tutors: GraduationCap,
  audit: FileText,
  applications: ClipboardCheck,
  interviews: CalendarDays,
  followups: ShieldCheck,
}

export default function WorkspaceShell({ children }: { children: ReactNode }) {
  const { t, i18n } = useTranslation()
  const auth = useAuth()
  const application = useTutorApplication()
  const now = useClock()
  const appliedPreference = useRef('')
  const preferences = useQuery({
    queryKey: ['account'],
    queryFn: ({ signal }) => api<Schema['Account']>('/account', { signal }),
    enabled: !!auth.data,
  })
  useEffect(() => {
    const saved = preferences.data?.preferences
    const key = auth.data && saved ? `${auth.data.user.id}:${saved.version}` : ''
    if (saved && saved.version > 0 && key !== appliedPreference.current) {
      appliedPreference.current = key
      void i18n.changeLanguage(saved.language)
    }
  }, [auth.data, preferences.data, i18n])
  const config = useConfig()
  const location = useLocation()
  const params = new URLSearchParams(location.search)
  const logout = useMutation({
    mutationFn: () => send('/auth/logout', {}),
    onSuccess: () => {
      setCSRF('')
      queryClient.clear()
      window.location.assign('/')
    },
  })
  const gate =
    auth.isPending || (auth.data?.user.role === 'tutor' && application.isPending) ? (
      <Loading />
    ) : auth.isError ? (
      <LoadError
        title={t('desk.sessionError')}
        body={t('desk.sessionErrorBody')}
        retry={() => void auth.refetch()}
      />
    ) : auth.data?.user.role === 'tutor' && application.isError ? (
      <LoadError retry={() => void application.refetch()} />
    ) : !auth.data ? (
      <Empty title={t('desk.privateTitle')} body={t('privacyNote')}>
        <LinkButton to={`/login?return=${encodeURIComponent(location.pathname + location.search)}`}>
          {t('authRequired')}
        </LinkButton>
      </Empty>
    ) : null
  if (gate)
    return (
      <div className="desk-gate">
        <header>
          <Link to="/" className="desk-gate-brand">
            {config.data?.appName ?? t('brand')}.
          </Link>
        </header>
        <main>
          <h1 className="sr-only">{t('workspace')}</h1>
          {gate}
        </main>
        <nav aria-label={t('desk.navigation')}>
          <Link to="/" className="text-link">
            {t('desk.backToSite')} <ArrowUpRight size={16} />
          </Link>
        </nav>
      </div>
    )
  const user = auth.data!.user
  const tutorApproval = application.data?.application
  const applicant =
    user.role === 'tutor' &&
    (!tutorApproval ||
      tutorApproval.status !== 'approved' ||
      Date.parse(tutorApproval.scope.expiresAt) <= now)
  const view = workspaceView(user.role, params.get('view'))
  const pathname = location.pathname.replace(/\/+$/, '')
  if (
    applicant &&
    !['/apply', '/account', '/notifications'].includes(pathname) &&
    !pathname.startsWith('/cases')
  )
    return <Navigate to="/apply" replace />
  const section =
    pathname === '/account'
      ? t(['parent', 'tutor'].includes(user.role) ? 'parent.account' : 'account.title')
      : pathname.startsWith('/cases')
        ? t(['parent', 'tutor'].includes(user.role) ? 'parent.help' : 'cases.title')
        : pathname === '/notifications'
          ? t('tuition.notifications')
          : pathname.startsWith('/billing')
            ? t(user.role === 'parent' ? 'parent.payments' : 'billing.title')
            : pathname.startsWith('/tuition')
              ? t(user.role === 'parent' ? 'parent.classes' : 'tuition.title')
              : pathname === '/availability'
                ? t('tuition.availability')
                : pathname === '/match'
                  ? t('parent.start')
                  : pathname === '/apply'
                    ? t('applicationTitle')
                    : t(
                        `${['parent', 'tutor'].includes(user.role) ? 'parent' : 'desk'}.nav.${view}`,
                      )
  const navigation = (
    <>
      <Link className="desk-brand" to={applicant ? '/apply' : '/workspace'}>
        <span className="desk-brand-icon">
          <BookOpen size={24} strokeWidth={1.7} aria-hidden="true" />
        </span>
        <span>
          {config.data?.appName ?? t('brand')}
          <small>{t('desk.brandLabel')}</small>
        </span>
      </Link>
      <p className="desk-nav-label">{t('desk.workspaceLabel')}</p>
      <nav className="desk-nav" aria-label={t('desk.navigation')}>
        {(applicant ? [] : workspaceNavigationViews(user.role)).map((item) => {
          const Icon = icons[item]
          const active =
            pathname === '/workspace' && workspaceNavigationView(user.role, view) === item
          return (
            <Link
              key={item}
              to={workspaceLink(item, user.role === 'parent' ? params.get('learner') : null)}
              className={active ? 'active' : undefined}
              aria-current={active ? 'page' : undefined}
            >
              <Icon size={19} strokeWidth={1.7} aria-hidden="true" />
              {t(`${['parent', 'tutor'].includes(user.role) ? 'parent' : 'desk'}.nav.${item}`)}
              {active && <span className="desk-nav-dot" aria-hidden="true" />}
            </Link>
          )
        })}
        {!applicant && ['parent', 'tutor', 'mentor'].includes(user.role) && (
          <Link
            to="/tuition"
            className={pathname.startsWith('/tuition') ? 'active' : undefined}
            aria-current={pathname.startsWith('/tuition') ? 'page' : undefined}
          >
            <BookOpen size={19} aria-hidden="true" />
            {t(user.role === 'parent' ? 'parent.classes' : 'tuition.title')}
          </Link>
        )}
        {['parent', 'finance', 'admin'].includes(user.role) && (
          <Link
            to="/billing"
            className={pathname.startsWith('/billing') ? 'active' : undefined}
            aria-current={pathname.startsWith('/billing') ? 'page' : undefined}
          >
            <FileText size={19} aria-hidden="true" />
            {t(user.role === 'parent' ? 'parent.payments' : 'billing.title')}
          </Link>
        )}
        {user.role === 'tutor' && !applicant && (
          <Link
            to="/availability"
            className={pathname === '/availability' ? 'active' : undefined}
            aria-current={pathname === '/availability' ? 'page' : undefined}
          >
            <CalendarDays size={19} aria-hidden="true" />
            {t('tuition.availability')}
          </Link>
        )}
        {user.role === 'tutor' && (
          <Link
            to="/apply"
            className={pathname === '/apply' ? 'active' : undefined}
            aria-current={pathname === '/apply' ? 'page' : undefined}
          >
            <FileText size={19} aria-hidden="true" />
            {t('desk.application')}
          </Link>
        )}
        <Link
          to="/notifications"
          className={pathname === '/notifications' ? 'active' : undefined}
          aria-current={pathname === '/notifications' ? 'page' : undefined}
        >
          <Sprout size={19} aria-hidden="true" />
          {t('tuition.notifications')}
        </Link>
        <Link
          to="/cases"
          className={pathname.startsWith('/cases') ? 'active' : undefined}
          aria-current={pathname.startsWith('/cases') ? 'page' : undefined}
        >
          <ShieldCheck size={19} aria-hidden="true" />
          {t(['parent', 'tutor'].includes(user.role) ? 'parent.help' : 'cases.title')}
        </Link>
        <Link
          to="/account"
          className={pathname === '/account' ? 'active' : undefined}
          aria-current={pathname === '/account' ? 'page' : undefined}
        >
          <Users size={19} aria-hidden="true" />
          {t(['parent', 'tutor'].includes(user.role) ? 'parent.account' : 'account.title')}
        </Link>
      </nav>
    </>
  )
  return (
    <div className="desk-shell" data-role={user.role}>
      <a className="skip-link" href="#desk-main">
        {t('skip')}
      </a>
      <aside className="desk-sidebar" aria-label={t('desk.navigation')}>
        {navigation}
      </aside>
      <div className="desk-frame">
        <header className="desk-topbar">
          <div className="desk-breadcrumb">
            <div className="desk-mobile-menu" key={location.pathname + location.search}>
              <Dialog.Root>
                <Dialog.Trigger asChild>
                  <button className="icon-button" aria-label={t('menu')}>
                    <Menu aria-hidden="true" />
                  </button>
                </Dialog.Trigger>
                <Dialog.Portal>
                  <Dialog.Overlay className="dialog-overlay" />
                  <Dialog.Content className="desk-drawer" aria-describedby={undefined}>
                    <Dialog.Title className="sr-only">{t('desk.navigation')}</Dialog.Title>
                    <Dialog.Close className="desk-drawer-close icon-button" aria-label={t('close')}>
                      <X aria-hidden="true" />
                    </Dialog.Close>
                    {navigation}
                  </Dialog.Content>
                </Dialog.Portal>
              </Dialog.Root>
            </div>
            <span className="desk-breadcrumb-role">{t(`desk.roles.${user.role}`)}</span>
            <ChevronRight size={14} className="desk-breadcrumb-chevron" aria-hidden="true" />
            <span>{section}</span>
          </div>
          <div className="desk-utilities">
            <button
              className="language-button"
              onClick={() => void i18n.changeLanguage(i18n.language === 'en' ? 'hi' : 'en')}
              lang={i18n.language === 'en' ? 'hi' : 'en'}
            >
              <Languages size={17} aria-hidden="true" />
              {t('language')}
            </button>
            <span className="desk-user-avatar" aria-hidden="true">
              {initials(user.name)}
            </span>
            <div className="desk-user">
              <strong>{user.name}</strong>
              <span>{t(`desk.roles.${user.role}`)}</span>
            </div>
            <Button
              variant="text"
              aria-label={t('logout')}
              busy={logout.isPending}
              onClick={() => logout.mutate()}
            >
              <LogOut size={17} aria-hidden="true" />
              <span className="desk-signout-label">{t('logout')}</span>
            </Button>
          </div>
        </header>
        {config.data?.development && !['parent', 'tutor'].includes(user.role) && (
          <div className="desk-preview" role="region" aria-label={t('dev')}>
            <span className="desk-preview-dot" aria-hidden="true" />
            <strong>{t('dev')}</strong>
            <span>{t('desk.previewDetail')}</span>
          </div>
        )}
        <main className="desk-main" id="desk-main" tabIndex={-1}>
          <MutationError error={logout.error} />
          <Suspense
            fallback={
              <div className="desk-loading">
                <Loading />
              </div>
            }
          >
            {children}
          </Suspense>
        </main>
        <footer className="desk-footnote">
          <ShieldCheck size={14} aria-hidden="true" />
          {t('desk.privateSpace')}
          <span>{t('desk.purnea')}</span>
        </footer>
      </div>
    </div>
  )
}
