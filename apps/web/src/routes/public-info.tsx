import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { ArrowRight, BookOpen, CalendarDays, LifeBuoy, ShieldCheck } from 'lucide-react'
import { LinkButton } from '../components/ui'
import { useAuth } from '../lib/session'
import '../styles/public-info.css'

const process = [
  [
    'Explore assessed tutors',
    'Compare approved subjects, class ranges, teaching modes and staff-set fees. Browse profiles before creating an account.',
  ],
  [
    'Choose a trial',
    'Add your student, select a tutor and request an available time. Your tutor confirms or declines the request.',
  ],
  [
    'Continue with regular classes',
    'After a trial, choose a package and available dates. Pay, then track your tutor’s agreement signature and acceptance before teaching begins.',
  ],
]
const standards = [
  [
    'Approval has a defined scope',
    'Academic approval applies to the subjects, classes and teaching modes shown on the tutor’s profile. Registration or document upload alone does not establish approval.',
  ],
  [
    'Know the source of each detail',
    'Profiles distinguish assessed teaching scope from tutor-provided education, experience and teaching approach. Your trial helps you judge whether the tutor suits your child.',
  ],
  [
    'Keep a continuing learning record',
    'Recorded lessons, homework and tutor feedback stay with your family’s account. Tutor changes require a request, family sharing consent and an approved replacement’s acceptance.',
  ],
]
export function Info({ page }: { page: string }) {
  const { t } = useTranslation()
  const auth = useAuth()
  const missing = page === '404'
  const prefix = page === 'how-it-works' ? 'approach' : page
  const destination = auth.data
    ? auth.data.user.role === 'parent'
      ? '/match'
      : '/workspace'
    : '/tutors'
  const sections = page === 'standards' ? standards : process
  return (
    <div className="container section info-page">
      <header className="info-heading">
        <p className="eyebrow">{t('brand')}</p>
        <h1>{t(missing ? 'notFound' : page === 'support' ? 'support' : `${prefix}Title`)}</h1>
        {!missing && <p className="intro">{t(`${prefix}Body`)}</p>}
      </header>
      {page === 'support' ? (
        <>
          <section className="info-support-start" aria-labelledby="support-start-title">
            <LifeBuoy size={26} aria-hidden="true" />
            <div>
              <h2 id="support-start-title">How can we help?</h2>
              <p>
                Open a private ticket with the details of your question. Follow replies and updates
                in your learning space.
              </p>
            </div>
            <LinkButton to="/cases?new=1">Create a support ticket</LinkButton>
            <Link className="text-link" to="/cases">
              View my tickets <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </section>
          <nav className="info-shortcuts" aria-label="Common help topics">
            <Link to="/tuition">
              <CalendarDays aria-hidden="true" />
              <strong>Bookings & classes</strong>
              <span>Open a booking for its schedule and class support.</span>
            </Link>
            <Link to="/billing">
              <BookOpen aria-hidden="true" />
              <strong>Payments</strong>
              <span>Check the saved payment status and records.</span>
            </Link>
            <Link to="/cases?new=1">
              <ShieldCheck aria-hidden="true" />
              <strong>Privacy or account help</strong>
              <span>Submit a private request through Help.</span>
            </Link>
          </nav>
        </>
      ) : missing ? (
        <>
          <p>The page may have moved. Use your workspace or tutor discovery to continue.</p>
          <LinkButton to={auth.data ? '/workspace' : '/'}>
            {auth.data ? 'Back to workspace' : t('returnHome')}
          </LinkButton>
        </>
      ) : (
        <div className="info-layout">
          <div className="info-sections">
            {sections.map(([title, body], index) => (
              <section key={title}>
                <span className="info-step" aria-hidden="true">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <div>
                  <h2>{title}</h2>
                  <p>{body}</p>
                </div>
              </section>
            ))}
          </div>
          <aside className="info-next">
            <h2>Choose your next step</h2>
            <p>Review real tutor profiles, available teaching modes and fees.</p>
            <LinkButton to={destination}>
              {auth.data && auth.data.user.role !== 'parent' ? 'Open workspace' : 'Explore tutors'}
            </LinkButton>
            <Link className="text-link" to="/support">
              Help & support <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </aside>
        </div>
      )}
    </div>
  )
}
