import '../styles/home.css'
import '../styles/public-profile.css'
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { BookOpen, GraduationCap, MapPin, ShieldCheck } from 'lucide-react'
import { api, indiaDate, type Tutor, type Schema } from '../lib/api'
import {
  approvedTutorModes,
  approvedTutorSubjects,
  tutorBookingLink,
  tutorExperience,
  tutorReturnLink,
} from '../lib/tutors'
import { TutorFees } from '../components/tutor-fees'
import { Button, Field, LinkButton, LoadError, Loading } from '../components/ui'
import { TutorPhotoSymbol } from '../components/tutor-card'
import { useAuth } from '../lib/session'

export function TutorDetail() {
  const { id } = useParams()
  const auth = useAuth()
  const q = useQuery({
    queryKey: ['tutor', id],
    queryFn: ({ signal }) => api<Tutor>(`/tutors/${id}`, { signal }),
  })
  if (q.isPending)
    return (
      <div className="container section">
        <Loading />
      </div>
    )
  if (q.isError)
    return (
      <div className="container section">
        <LoadError retry={() => void q.refetch()} />
      </div>
    )
  if (auth.data?.user.role === 'tutor' && auth.data.user.id === q.data.id)
    return <Navigate to="/tutor-profile?section=preview" replace />
  return <TutorProfileView tutor={q.data} />
}

export function TutorProfileView({ tutor, preview = false }: { tutor: Tutor; preview?: boolean }) {
  const [params, setParams] = useSearchParams()
  const modes = approvedTutorModes(tutor.scope)
  const mode = modes.find((item) => item === params.get('mode')) ?? modes[0]
  const subjects = approvedTutorSubjects(tutor.scope)
  const classValue = Number(params.get('class'))
  const requestedClass =
    Number.isInteger(classValue) && classValue >= 1 && classValue <= 12 ? classValue : 0
  const requestedSubjects = params.getAll('subject')
  const fits =
    (!requestedClass ||
      (requestedClass >= tutor.scope.minClass && requestedClass <= tutor.scope.maxClass)) &&
    requestedSubjects.every((subject) => subjects.includes(subject))
  const chooseMode = (value: string) => {
    const next = new URLSearchParams(params)
    next.set('mode', value)
    setParams(next, { replace: true })
  }
  return (
    <div
      className={
        preview
          ? 'tutor-profile-page approved-profile profile-workspace-preview'
          : 'container section tutor-profile-page approved-profile'
      }
    >
      {!preview && (
        <Link className="back-link" to={tutorReturnLink(params)}>
          {params.get('source') === 'match' ? 'Back to your tutor choices' : 'Back to tutors'}
        </Link>
      )}
      <div className="approved-profile-layout">
        <section className="approved-profile-hero" aria-labelledby="teacher-profile-title">
          <div className="approved-profile-identity">
            <TutorPhotoSymbol tutor={tutor} large />
            <div>
              <span className="profile-assessed">
                <ShieldCheck size={16} aria-hidden="true" />
                {tutor.sample ? 'Sample assessed profile' : 'Assessed by GoCoaching'}
              </span>
              {preview ? (
                <h2 id="teacher-profile-title">{tutor.name}</h2>
              ) : (
                <h1 id="teacher-profile-title">{tutor.name}</h1>
              )}
              <p className="profile-speciality">
                {subjects.join(' & ')} · Classes {tutor.scope.minClass}–{tutor.scope.maxClass}
              </p>
            </div>
          </div>
          <dl className="profile-quick-facts">
            <div>
              <dt>Teaching modes</dt>
              <dd>
                {modes.map((value) => (value === 'home' ? 'Home Tuition' : 'Online')).join(' · ')}
              </dd>
            </div>
            <div>
              <dt>Teaching languages · tutor provided</dt>
              <dd>{tutor.teachingLanguages.join(' · ') || 'Not added'}</dd>
            </div>
            <div>
              <dt>Experience · tutor provided</dt>
              <dd>{tutorExperience(tutor)}</dd>
            </div>
          </dl>
          {requestedClass > 0 && (
            <p className={fits ? 'profile-context-fit' : 'profile-context-mismatch'}>
              {fits
                ? `Approved for your selected Class ${requestedClass}${requestedSubjects.length ? ' and ' + requestedSubjects.join(', ') : ''}.`
                : 'Your selected class or subjects are outside this tutor’s approved scope. Return to your tutor choices to find a suitable tutor.'}
            </p>
          )}
        </section>
        {preview ? (
          <aside className="profile-booking">
            <h2>Teaching fees</h2>
            <TutorFees plans={tutor.feePlans} />
            <p className="profile-disclosure">Fees are set by your assigned mentor.</p>
          </aside>
        ) : (
          <ProfileBooking
            tutor={tutor}
            mode={mode}
            chooseMode={chooseMode}
            context={params}
            eligible={fits}
          />
        )}
        <div className="approved-profile-content">
          <section className="approved-profile-section" aria-labelledby="profile-about">
            <h2 id="profile-about">
              <GraduationCap size={21} aria-hidden="true" />
              About the tutor
            </h2>
            {tutor.qualification ? (
              <>
                <p className="profile-qualification">{tutor.qualification}</p>
                {tutor.institution && <p>{tutor.institution}</p>}
                <p className="profile-disclosure">Education details are provided by the tutor.</p>
              </>
            ) : (
              <p>Education details have not been added to this public profile.</p>
            )}
            {tutor.boards.length > 0 && (
              <p>
                <strong>Boards taught · tutor provided:</strong> {tutor.boards.join(', ')}
              </p>
            )}
          </section>
          <section className="approved-profile-section" aria-labelledby="profile-approach">
            <h2 id="profile-approach">
              <BookOpen size={21} aria-hidden="true" />
              Teaching approach
            </h2>
            <p className="profile-introduction">{tutor.approach}</p>
            {tutor.introVideoUrl && (
              <video
                className="teacher-intro-video"
                controls
                preload="metadata"
                src={tutor.introVideoUrl}
                aria-label={`${tutor.name} public introduction video`}
              />
            )}
          </section>
          {modes.includes('home') && (
            <section className="approved-profile-section">
              <h2>
                <MapPin size={21} aria-hidden="true" />
                Home tuition area
              </h2>
              <p>
                {tutor.publicLocality || 'Service area not added'}
                {tutor.serviceRadiusKm > 0 && ` · within ${tutor.serviceRadiusKm} km`}
              </p>
              <p className="profile-disclosure">
                Home tuition eligibility is checked against your saved location.
              </p>
            </section>
          )}
          <section
            className="approved-profile-section profile-approval"
            aria-labelledby="profile-approval"
          >
            <h2 id="profile-approval">
              <ShieldCheck size={21} aria-hidden="true" />
              Approved teaching scope
            </h2>
            <p>
              {subjects.join(', ')} · Classes {tutor.scope.minClass}–{tutor.scope.maxClass} ·{' '}
              {modes.map((value) => (value === 'home' ? 'Home Tuition' : 'Online')).join(' / ')}
            </p>
            {Date.parse(tutor.assessmentAt) > 0 && (
              <p className="profile-disclosure">Assessed {indiaDate(tutor.assessmentAt, 'en')}</p>
            )}
            <p className="profile-disclosure">
              Approval covers the subjects, classes and teaching modes shown here. Your trial helps
              you decide whether the tutor suits your child.
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}

function ProfileBooking({
  tutor,
  mode,
  chooseMode,
  context,
  eligible,
}: {
  tutor: Tutor
  mode: string
  chooseMode: (value: string) => void
  context: URLSearchParams
  eligible: boolean
}) {
  const times = useQuery({
    queryKey: ['trial-times', tutor.id, mode],
    queryFn: ({ signal }) =>
      api<Schema['PublicTrialTimes']>(`/tutors/${tutor.id}/trial-times?mode=${mode}`, { signal }),
    refetchInterval: 30000,
    refetchOnWindowFocus: true,
  })
  const next = times.data?.slots[0]
  const ready = eligible && !!next && !times.isError
  const plans = tutor.feePlans.filter((plan) => plan.mode === mode)
  const subjectCount =
    Number(context.get('class')) > 5 ? Math.max(1, new Set(context.getAll('subject')).size) : 1
  const money = (amount: number) =>
    new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 2,
    }).format(amount / 100)
  const href = tutorBookingLink(tutor, context, mode)
  const modeName = mode === 'home' ? 'Home Tuition' : 'Online'
  const action = ready ? (
    <LinkButton to={href}>Request a trial</LinkButton>
  ) : (
    <Button disabled>Request a trial</Button>
  )
  return (
    <>
      <aside className="profile-booking" aria-labelledby="profile-booking-title">
        <p className="eyebrow">Start with a trial</p>
        <h2 id="profile-booking-title">Meet your tutor</h2>
        <Field label="Teaching mode">
          <select value={mode} onChange={(event) => chooseMode(event.target.value)}>
            {approvedTutorModes(tutor.scope).map((value) => (
              <option key={value} value={value}>
                {value === 'home' ? 'Home Tuition' : 'Online'}
              </option>
            ))}
          </select>
        </Field>
        <TutorFees plans={plans} subjectCount={subjectCount} />
        <p className="profile-disclosure">
          Regular tuition prices shown. For Classes 6–12, the package price is multiplied by the
          number of selected subjects. Home packages contain 6 or 24 classes, scheduled on the
          tutor’s teaching days.
        </p>
        <div className="profile-trial-availability" aria-live="polite">
          {times.isPending ? (
            <p>Checking trial times…</p>
          ) : times.isError ? (
            <LoadError retry={() => void times.refetch()} />
          ) : next ? (
            <>
              <strong>Next trial time</strong>
              <p>
                {new Intl.DateTimeFormat('en-IN', {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                  timeZone: 'Asia/Kolkata',
                }).format(new Date(next.start))}{' '}
                IST
              </p>
              <span>You can choose from available times in the next step.</span>
            </>
          ) : (
            <>
              <strong>No trial times available</strong>
              <p>
                {modeName} trial times will appear when teaching setup and availability are ready.
              </p>
            </>
          )}
        </div>
        {action}
        <p className="profile-disclosure">
          Choose your learner and time next. Your tutor confirms the trial request. Availability is
          checked again when you submit.
        </p>
      </aside>
      <div className="profile-mobile-action" aria-label="Trial booking">
        <div>
          <strong>
            {plans[0] ? money(plans[0].amountPaise * subjectCount) : 'Fees unavailable'}
          </strong>
          <small>
            {modeName} · {plans[0]?.period === 'hour' ? 'per hour' : 'per package'}
          </small>
        </div>
        {action}
      </div>
    </>
  )
}
