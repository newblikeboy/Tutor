import '../locales/experience'
import '../locales/account'
import '../locales/cases'
import '../locales/billing'
import '../locales/tuition'
import '../locales/workspace'
import '../locales/parent'
import '../locales/inbox'
import type { ReactNode } from 'react'
import { BrandMark } from './brand-mark'
import { Suspense, useState } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
  BookOpen,
  CalendarDays,
  ChevronRight,
  ClipboardCheck,
  FileText,
  GraduationCap,
  LayoutDashboard,
  LocateFixed,
  LogOut,
  Mail,
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
import { isInformationPath } from '../lib/public-pages'
import { Alert, Button, Loading, LoadError, Modal, MutationError } from './ui'
import { CurrentLocationButton, locationLabel, type StoredLocation } from './location-search'
import { NotificationBell } from './notification-bell'
import '../styles/workspace.css'
import '../styles/experience.css'
import '../styles/teaching-shell.css'
import '../styles/mentor-workspace.css'
import '../styles/admin-workspace.css'
import '../styles/customer-workspace.css'
import '../styles/customer-experience.css'

const icons: Record<WorkspaceView, typeof BookOpen> = {
  overview: LayoutDashboard,
  learners: Users,
  sessions: CalendarDays,
  progress: Sprout,
  assessments: ClipboardCheck,
  reviews: BookOpen,
  tutors: GraduationCap,
  team: Users,
  families: Users,
  reports: FileText,
  audit: FileText,
  applications: ClipboardCheck,
  interviews: CalendarDays,
  followups: ShieldCheck,
}

export default function WorkspaceShell({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  const auth = useAuth()
  const notificationStatus = useQuery({
    queryKey: ['notifications', 'status', auth.data?.user.id],
    enabled: !!auth.data,
    queryFn: ({ signal }) => api<Schema['NotificationStatus']>('/notifications/status', { signal }),
    refetchInterval: 15000,
    refetchOnWindowFocus: true,
  })
  const locationAccount = useQuery({
    queryKey: ['account'],
    enabled: !!auth.data && ['parent', 'tutor'].includes(auth.data.user.role),
    queryFn: ({ signal }) => api<Schema['Account']>('/account', { signal }),
  })
  const application = useTutorApplication()
  const now = useClock()
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
  if (!auth.isPending && !auth.isError && !auth.data)
    return (
      <Navigate
        to={`/login?return=${encodeURIComponent(location.pathname + location.search)}`}
        replace
      />
    )
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
    ) : null
  if (gate)
    return (
      <div className="desk-gate">
        <header>
          <span className="desk-gate-brand">
            <BrandMark />
            {config.data?.appName ?? t('brand')}
          </span>
        </header>
        <main>
          <h1 className="sr-only">{t('workspace')}</h1>
          {gate}
        </main>
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
    !['/apply', '/account', '/notifications', '/billing'].includes(pathname) &&
    !isInformationPath(pathname) &&
    !pathname.startsWith('/cases')
  )
    return <Navigate to="/apply" replace />
  if (user.role === 'tutor' && !applicant && pathname === '/apply') {
    const destination = new URLSearchParams()
    if (params.get('tab') === 'documents') destination.set('record', 'documents')
    else if (params.get('tab') === 'application') destination.set('record', 'information')
    return <Navigate to={`/tutor-profile${destination.size ? `?${destination}` : ''}`} replace />
  }
  if (user.role === 'tutor' && !applicant && pathname === '/account') {
    const section = ['password', 'signins'].includes(params.get('tab') ?? '')
      ? params.get('tab')
      : 'account'
    return <Navigate to={`/tutor-profile?section=${section}`} replace />
  }
  const section =
    pathname === '/tutor-changes'
      ? 'Tutor change requests'
      : pathname === '/subjects'
        ? 'Subject master'
        : pathname === '/study'
          ? 'Papers, quizzes & notes'
          : pathname === '/tutor-profile'
            ? 'My profile'
            : pathname === '/tutors'
              ? 'Find a tutor'
              : pathname.startsWith('/tutors/')
                ? 'Tutor profile'
                : pathname === '/account'
                  ? t(user.role === 'parent' ? 'parent.account' : 'account.title')
                  : pathname.startsWith('/cases')
                    ? t(['parent', 'tutor'].includes(user.role) ? 'parent.help' : 'cases.title')
                    : pathname === '/notifications'
                      ? t('tuition.notifications')
                      : pathname.startsWith('/billing')
                        ? user.role === 'tutor'
                          ? 'Earnings & payouts'
                          : params.get('tab') === 'business'
                            ? 'Business & taxes'
                            : t(user.role === 'parent' ? 'parent.payments' : 'billing.title')
                        : pathname.startsWith('/tuition')
                          ? t(user.role === 'parent' ? 'parent.classes' : 'tuition.title')
                          : pathname === '/availability'
                            ? t('tuition.availability')
                            : pathname === '/match'
                              ? t(
                                  params.get('edit') === '1'
                                    ? 'parent.edit'
                                    : params.get('profile') === '1'
                                      ? 'parent.add'
                                      : 'parent.start',
                                )
                              : pathname === '/apply'
                                ? t('applicationTitle')
                                : user.role === 'tutor' && view === 'learners'
                                  ? params.get('learner')
                                    ? 'Student progress report'
                                    : 'My students'
                                  : user.role === 'tutor' &&
                                      view === 'sessions' &&
                                      params.get('trial')
                                    ? 'Trial details'
                                    : user.role === 'mentor'
                                      ? t(`desk.mentorNav.${view}`)
                                      : t(
                                          `${['parent', 'tutor'].includes(user.role) ? 'parent' : 'desk'}.nav.${view}`,
                                        )
  const navigationViews = applicant ? [] : workspaceNavigationViews(user.role)
  function workspaceNavigationItem(item: WorkspaceView) {
    const Icon = icons[item]
    const active = pathname === '/workspace' && workspaceNavigationView(user.role, view) === item
    return (
      <Link
        key={item}
        to={workspaceLink(
          item,
          user.role === 'parent' && item !== 'learners' ? params.get('learner') : null,
        )}
        className={active ? 'active' : undefined}
        aria-current={active ? 'page' : undefined}
      >
        <Icon size={19} strokeWidth={1.7} aria-hidden="true" />
        {user.role === 'tutor' && item === 'learners'
          ? 'My students'
          : user.role === 'mentor'
            ? t(`desk.mentorNav.${item}`)
            : t(`${['parent', 'tutor'].includes(user.role) ? 'parent' : 'desk'}.nav.${item}`)}
        {active && <span className="desk-nav-dot" aria-hidden="true" />}
      </Link>
    )
  }
  const navigation = (
    <>
      <Link className="desk-brand" to={applicant ? '/apply' : '/workspace'}>
        <span className="desk-brand-icon">
          <BrandMark />
        </span>
        <span>
          {config.data?.appName ?? t('brand')}
          <small>{t('desk.brandLabel')}</small>
        </span>
      </Link>
      <p className="desk-nav-label">
        {t(
          user.role === 'mentor'
            ? 'desk.mentorLabel'
            : user.role === 'tutor'
              ? 'desk.tutorLabel'
              : user.role === 'admin'
                ? 'desk.adminLabel'
                : 'desk.workspaceLabel',
        )}
      </p>
      <nav className="desk-nav" aria-label={t('desk.navigation')}>
        {user.role === 'admin' && (
          <p className="admin-nav-group">{t('desk.adminGroups.teaching')}</p>
        )}
        {user.role === 'mentor' && (
          <p className="mentor-nav-group">{t('desk.mentorGroups.approval')}</p>
        )}
        {navigationViews
          .filter((item) =>
            user.role === 'admin'
              ? !['reports', 'audit'].includes(item)
              : user.role !== 'mentor' || item !== 'reviews',
          )
          .map(workspaceNavigationItem)}
        {user.role === 'admin' && (
          <>
            <p className="admin-nav-group">{t('desk.adminGroups.business')}</p>
            {workspaceNavigationItem('reports')}
          </>
        )}
        {user.role === 'mentor' && (
          <>
            <p className="mentor-nav-group">{t('desk.mentorGroups.learners')}</p>
            {workspaceNavigationItem('reviews')}
          </>
        )}
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
        {user.role === 'admin' && (
          <Link
            to="/tutor-changes"
            className={pathname === '/tutor-changes' ? 'active' : undefined}
            aria-current={pathname === '/tutor-changes' ? 'page' : undefined}
          >
            <BookOpen size={19} aria-hidden="true" />
            Tutor changes
          </Link>
        )}
        {user.role === 'admin' && (
          <Link
            to="/subjects"
            className={pathname === '/subjects' ? 'active' : undefined}
            aria-current={pathname === '/subjects' ? 'page' : undefined}
          >
            <BookOpen size={19} aria-hidden="true" />
            Subject master
          </Link>
        )}
        {['parent', 'admin'].includes(user.role) && (
          <Link
            to="/study"
            className={pathname === '/study' ? 'active' : undefined}
            aria-current={pathname === '/study' ? 'page' : undefined}
          >
            <ClipboardCheck size={19} aria-hidden="true" />
            Papers, quizzes & notes
          </Link>
        )}
        {['parent', 'tutor', 'finance', 'admin'].includes(user.role) && (
          <Link
            to="/billing"
            className={
              pathname.startsWith('/billing') && params.get('tab') !== 'business'
                ? 'active'
                : undefined
            }
            aria-current={
              pathname.startsWith('/billing') && params.get('tab') !== 'business'
                ? 'page'
                : undefined
            }
          >
            <FileText size={19} aria-hidden="true" />
            {user.role === 'tutor'
              ? 'Earnings & payouts'
              : t(user.role === 'parent' ? 'parent.payments' : 'billing.title')}
          </Link>
        )}
        {user.role === 'admin' && (
          <Link
            to="/billing?tab=business"
            className={
              pathname === '/billing' && params.get('tab') === 'business' ? 'active' : undefined
            }
            aria-current={
              pathname === '/billing' && params.get('tab') === 'business' ? 'page' : undefined
            }
          >
            <FileText size={19} aria-hidden="true" />
            Business &amp; taxes
          </Link>
        )}
        {user.role === 'tutor' && !applicant && (
          <Link
            to="/tutor-profile"
            className={pathname === '/tutor-profile' ? 'active' : undefined}
            aria-current={pathname === '/tutor-profile' ? 'page' : undefined}
          >
            <GraduationCap size={19} aria-hidden="true" />
            My profile
          </Link>
        )}
        {user.role === 'parent' && (
          <Link
            to="/account"
            className={pathname === '/account' ? 'active' : undefined}
            aria-current={pathname === '/account' ? 'page' : undefined}
          >
            <Users size={19} aria-hidden="true" />
            {t('parent.account')}
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
        {user.role === 'tutor' && applicant && (
          <Link
            to="/apply"
            className={pathname === '/apply' ? 'active' : undefined}
            aria-current={pathname === '/apply' ? 'page' : undefined}
          >
            <FileText size={19} aria-hidden="true" />
            {t('desk.application')}
          </Link>
        )}
        {user.role === 'admin' && (
          <>
            <p className="admin-nav-group">{t('desk.adminGroups.administration')}</p>
            {workspaceNavigationItem('audit')}
            <Link
              to="/account?tab=agreements"
              className={
                pathname === '/account' && params.get('tab') === 'agreements' ? 'active' : undefined
              }
              aria-current={
                pathname === '/account' && params.get('tab') === 'agreements' ? 'page' : undefined
              }
            >
              <FileText size={19} aria-hidden="true" />
              Agreement Builder
            </Link>
          </>
        )}
        {user.role === 'mentor' && (
          <p className="mentor-nav-group">{t('desk.mentorGroups.account')}</p>
        )}
        <Link
          to="/notifications"
          className={pathname === '/notifications' ? 'active' : undefined}
          aria-current={pathname === '/notifications' ? 'page' : undefined}
        >
          <Mail size={19} aria-hidden="true" />
          {t('tuition.notifications')}
          {!!notificationStatus.data?.updatesUnreadCount && (
            <span
              className="workspace-inbox-count"
              aria-label={`${notificationStatus.data.updatesUnreadCount} ${t('inbox.unread')}`}
            >
              {notificationStatus.data.updatesUnreadCount}
            </span>
          )}
        </Link>
        <Link
          to="/cases"
          className={pathname.startsWith('/cases') ? 'active' : undefined}
          aria-current={pathname.startsWith('/cases') ? 'page' : undefined}
        >
          <ShieldCheck size={19} aria-hidden="true" />
          {t(['parent', 'tutor'].includes(user.role) ? 'parent.help' : 'cases.title')}
        </Link>
        {((user.role !== 'tutor' && user.role !== 'parent') || applicant) && (
          <Link
            to="/account"
            className={
              pathname === '/account' &&
              !(user.role === 'admin' && params.get('tab') === 'agreements')
                ? 'active'
                : undefined
            }
            aria-current={
              pathname === '/account' &&
              !(user.role === 'admin' && params.get('tab') === 'agreements')
                ? 'page'
                : undefined
            }
          >
            <Users size={19} aria-hidden="true" />
            {t(user.role === 'parent' ? 'parent.account' : 'account.title')}
          </Link>
        )}
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
            <div className="desk-mobile-menu" key={location.key}>
              <WorkspaceMenu role={user.role}>{navigation}</WorkspaceMenu>
            </div>
            {['parent', 'tutor'].includes(user.role) ? (
              <WorkspaceTopbarLocation
                account={locationAccount.data}
                tutor={user.role === 'tutor'}
              />
            ) : (
              <>
                <span className="desk-breadcrumb-role">{t(`desk.roles.${user.role}`)}</span>
                <ChevronRight size={14} className="desk-breadcrumb-chevron" aria-hidden="true" />
                <span>{section}</span>
              </>
            )}
          </div>
          <div className="desk-utilities">
            <NotificationBell
              user={user}
              status={notificationStatus.data}
              statusError={notificationStatus.isError}
            />
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
      {!applicant && ['parent', 'tutor'].includes(user.role) && (
        <nav className="customer-mobile-nav" aria-label="Everyday navigation">
          {[
            {
              to: workspaceLink('overview', user.role === 'parent' ? params.get('learner') : null),
              label: 'Home',
              icon: LayoutDashboard,
              active: pathname === '/workspace' && view === 'overview',
            },
            {
              to: workspaceLink('learners'),
              label: user.role === 'tutor' ? 'My students' : 'Learners',
              icon: Users,
              active: pathname === '/workspace' && view === 'learners',
            },
            {
              to: '/tuition',
              label: 'Classes',
              icon: BookOpen,
              active:
                pathname.startsWith('/tuition') ||
                (user.role === 'tutor' && pathname === '/workspace' && view === 'sessions'),
            },
            {
              to: '/notifications',
              label: 'Updates',
              icon: Mail,
              active: pathname === '/notifications',
            },
          ].map(({ to, label, icon: Icon, active }) => (
            <Link key={to} to={to} aria-current={active ? 'page' : undefined}>
              <Icon size={21} aria-hidden="true" />
              <span>{label}</span>
            </Link>
          ))}
        </nav>
      )}
    </div>
  )
}

function WorkspaceMenu({ children, role }: { children: ReactNode; role: Schema['User']['role'] }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button className="icon-button" aria-label={t('menu')}>
          <Menu aria-hidden="true" />
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content
          className="desk-drawer"
          data-role={role}
          aria-describedby={undefined}
          onClick={(event) => {
            if (event.target instanceof Element && event.target.closest('a[href]')) setOpen(false)
          }}
        >
          <Dialog.Title className="sr-only">{t('desk.navigation')}</Dialog.Title>
          <Dialog.Close className="desk-drawer-close icon-button" aria-label={t('close')}>
            <X aria-hidden="true" />
          </Dialog.Close>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function WorkspaceTopbarLocation({
  account,
  tutor,
}: {
  account?: Schema['Account']
  tutor: boolean
}) {
  const { t } = useTranslation()
  const savedLocation = account?.preferences.location ?? null
  const save = useMutation({
    mutationFn: (nextLocation: StoredLocation) => {
      if (!account) throw new Error(t('loading'))
      return send(
        '/account',
        {
          name: account.name,
          language: 'en',
          location: nextLocation,
          version: account.preferences.version,
        },
        'PUT',
      )
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['account'] }),
        queryClient.invalidateQueries({ queryKey: ['tutors'] }),
        queryClient.invalidateQueries({ queryKey: ['tutor-workspace'] }),
        queryClient.invalidateQueries({ queryKey: ['tutor-profile'] }),
        queryClient.invalidateQueries({ queryKey: ['tutor'] }),
        queryClient.invalidateQueries({ queryKey: ['application'] }),
      ])
    },
  })
  const location = savedLocation
  const label = location
    ? location.district || location.city || location.locality || locationLabel(location)
    : t('locationUseCurrent')

  if (!account)
    return (
      <span className="desk-location-pill is-static" aria-label={t('account.currentLocation')}>
        <LocateFixed size={19} aria-hidden="true" />
        <span>{t('locationUseCurrent')}</span>
      </span>
    )

  if (tutor)
    return (
      <Modal
        title="Tutor location"
        description="Used for student distances and new Home Tuition matches."
        trigger={
          <button className="desk-location-pill" type="button" aria-label="Your teaching location">
            <LocateFixed size={19} aria-hidden="true" />
            <span>{label}</span>
          </button>
        }
      >
        {location ? (
          <p className="tutor-location-summary">{locationLabel(location)}</p>
        ) : (
          <p>No tutor location saved yet.</p>
        )}
        <CurrentLocationButton
          disabled={save.isPending}
          onLocationChange={(nextLocation) => save.mutate(nextLocation)}
        >
          {location ? 'Update to my current location' : 'Use current location'}
        </CurrentLocationButton>
        {save.isPending && <p role="status">Saving your location…</p>}
        {save.isSuccess && (
          <Alert kind="success">Tutor location saved. Student distances are updated.</Alert>
        )}
        <MutationError error={save.error} />
        {save.isError && (
          <Button
            variant="secondary"
            onClick={() => {
              save.reset()
              void queryClient.invalidateQueries({ queryKey: ['account'] })
            }}
          >
            Reload saved location
          </Button>
        )}
      </Modal>
    )

  return (
    <div className="desk-location-control">
      <CurrentLocationButton
        className="desk-location-pill"
        disabled={save.isPending}
        onLocationChange={(nextLocation) => save.mutate(nextLocation)}
      >
        <span>{label}</span>
      </CurrentLocationButton>
      {save.isError && (
        <span className="sr-only" role="alert">
          {t('actionError')}
        </span>
      )}
    </div>
  )
}
