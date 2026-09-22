import React, { lazy, Suspense, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Link, NavLink, Route, Routes, useLocation } from 'react-router-dom'
import { QueryClientProvider, useMutation } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ArrowUpRight, Languages, Menu } from 'lucide-react'
import './locales'
import '@fontsource/manrope/latin-400.css'
import '@fontsource/manrope/latin-500.css'
import '@fontsource/manrope/latin-600.css'
import '@fontsource/manrope/latin-700.css'
import '@fontsource/noto-sans-devanagari/devanagari-400.css'
import '@fontsource/noto-sans-devanagari/devanagari-600.css'
import './styles/index.css'
import { queryClient, send, setCSRF } from './lib/api'
import { useAuth, useConfig } from './lib/session'
import { Button, Loading, Modal, MutationError } from './components/ui'
import { Home, Info, Search, TutorDetail, Showcase } from './routes/public'
const Login = lazy(() => import('./routes/login'))
const Workspace = lazy(() => import('./routes/workspace'))
const Match = lazy(() => import('./routes/match'))
const Apply = lazy(() => import('./routes/apply'))
function ScrollReset() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])
  return null
}
function Layout() {
  const { t, i18n } = useTranslation()
  const auth = useAuth()
  const config = useConfig()
  const location = useLocation()
  const logout = useMutation({
    mutationFn: () => send('/auth/logout', {}),
    onSuccess: () => {
      setCSRF('')
      queryClient.clear()
      window.location.assign('/')
    },
  })
  const navigation = (
    <>
      <NavLink to="/tutors">{t('tutors')}</NavLink>
      <NavLink to="/approach">{t('approach')}</NavLink>
      <NavLink to="/apply">{t('teach')}</NavLink>
    </>
  )
  return (
    <>
      <a className="skip-link" href="#main">
        {t('skip')}
      </a>
      {config.data?.development && (
        <div className="dev-banner">
          <strong>{t('dev')}</strong>
          <span>{t('devDetail')}</span>
        </div>
      )}
      <header className="site-header">
        <div className="header-inner">
          <Link to="/" className="wordmark">
            <span>
              {config.data?.appName ?? t('brand')}
              <i aria-hidden="true">.</i>
            </span>
            <small>{t('provisional')}</small>
          </Link>
          <nav className="desktop-nav" aria-label={t('menu')}>
            {navigation}
          </nav>
          <div className="header-actions">
            <button
              className="language-button"
              onClick={() => void i18n.changeLanguage(i18n.language === 'en' ? 'hi' : 'en')}
              lang={i18n.language === 'en' ? 'hi' : 'en'}
            >
              <Languages size={17} />
              {t('language')}
            </button>
            <Link className="sign-link" to={auth.data ? '/workspace' : '/login'}>
              {auth.data ? t('workspace') : t('login')}
              <ArrowUpRight size={16} />
            </Link>
            <div className="mobile-menu" key={location.pathname}>
              <Modal
                title={t('brand')}
                drawer
                trigger={
                  <button className="icon-button" aria-label={t('menu')}>
                    <Menu />
                  </button>
                }
              >
                <nav className="drawer-nav">
                  {navigation}
                  <Link to="/workspace">{t('workspace')}</Link>
                </nav>
              </Modal>
            </div>
          </div>
        </div>
      </header>
      <main id="main" tabIndex={-1}>
        <Suspense
          fallback={
            <div className="container section">
              <Loading />
            </div>
          }
        >
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/tutors" element={<Search />} />
            <Route path="/tutors/:id" element={<TutorDetail />} />
            <Route path="/login" element={<Login />} />
            <Route path="/workspace" element={<Workspace />} />
            <Route path="/match" element={<Match />} />
            <Route path="/apply" element={<Apply />} />
            <Route path="/components" element={<Showcase />} />
            {['approach', 'standards', 'privacy', 'support', 'how-it-works'].map((path) => (
              <Route key={path} path={`/${path}`} element={<Info page={path} />} />
            ))}
            <Route path="*" element={<Info page="404" />} />
          </Routes>
        </Suspense>
      </main>
      <footer>
        <div className="container footer-grid">
          <div>
            <Link to="/" className="footer-wordmark">
              {config.data?.appName ?? t('brand')}.
            </Link>
            <p>{t('footer')}</p>
            <small>{t('noFounder')}</small>
          </div>
          <nav aria-label="Footer">
            <Link to="/standards">{t('standards')}</Link>
            <Link to="/privacy">{t('privacy')}</Link>
            <Link to="/support">{t('support')}</Link>
            <Link to="/login?staff=1">{t('staff')}</Link>
            {config.data?.development && <Link to="/components">{t('components')}</Link>}
          </nav>
        </div>
        {auth.data && (
          <div className="container footer-session">
            <span>{auth.data.user.name}</span>
            <Button variant="text" busy={logout.isPending} onClick={() => logout.mutate()}>
              {t('logout')}
            </Button>
            <MutationError error={logout.error} />
          </div>
        )}
      </footer>
      <ScrollReset />
    </>
  )
}
createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Layout />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
)
