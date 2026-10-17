import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight } from 'lucide-react'
import { api, type Learner, type Schema } from '../lib/api'
import { useClock } from '../lib/clock'
import { SubjectNames } from './subject-name'
import { LearningMotif } from './learning-motif'
import { Badge, LinkButton, LoadError, Loading } from './ui'
import { useTranslation } from 'react-i18next'
import '../styles/journey-workspaces.css'

export function ParentHome({ learner, children }: { learner: Learner; children: ReactNode }) {
  const { t } = useTranslation()
  const now = useClock()
  const bookings = useQuery({
    queryKey: ['tuition', 'home'],
    queryFn: ({ signal }) => api<Schema['EnrollmentPage']>('/enrollments?history=0', { signal }),
    refetchInterval: 15000,
  })
  const current = bookings.data?.items.filter((item) => item.status !== 'awaiting_payment') ?? []
  const checkouts =
    bookings.data?.items.filter(
      (item) =>
        item.status === 'awaiting_payment' && !!item.holdUntil && Date.parse(item.holdUntil) > now,
    ) ?? []
  const returning = current.length > 0 || checkouts.length > 0
  return (
    <>
      {bookings.isPending ? (
        <Loading />
      ) : bookings.isError ? (
        <LoadError retry={() => void bookings.refetch()} />
      ) : current.length > 0 ? (
        <section className="family-bookings" aria-labelledby="family-bookings-title">
          <header>
            <div>
              <h2 id="family-bookings-title">Continue learning</h2>
              <p>Current bookings for your family</p>
            </div>
            <Link className="text-link" to="/tuition">
              All bookings <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </header>
          <div>
            {current.slice(0, 3).map((item) => (
              <Link
                className="family-booking-row"
                key={item.id}
                to={`/tuition/${encodeURIComponent(item.id)}`}
              >
                <div>
                  <strong>{item.learnerName}</strong>
                  <p>
                    {item.tutorName} ·{' '}
                    <SubjectNames values={item.agreement.subjects ?? [item.agreement.subject]} />
                  </p>
                </div>
                <div>
                  <Badge tone={item.status === 'active' ? 'teal' : 'neutral'}>
                    {t(`tuition.status.${item.status}`)}
                  </Badge>
                  {item.paymentSimulated && (
                    <span className="family-booking-test">Test booking</span>
                  )}
                </div>
                <ArrowRight size={18} aria-hidden="true" />
              </Link>
            ))}
          </div>
          {bookings.data?.nextCursor && (
            <p className="family-bookings-more">See Regular classes for the complete list.</p>
          )}
        </section>
      ) : checkouts.length > 0 ? null : (
        <section className="parent-next customer-hero">
          <div className="customer-hero-copy">
            <h2>Find a tutor for {learner.name}</h2>
            <p>Choose the subjects and teaching mode that fit your child's day.</p>
            <LinkButton to={`/match?learner=${encodeURIComponent(learner.id)}`}>
              {t('parent.start')}
            </LinkButton>
          </div>
          <LearningMotif />
        </section>
      )}
      {checkouts.length > 0 && (
        <section className="tutor-acceptance-list" aria-label="Unfinished checkouts">
          <h2>Finish your booking</h2>
          <p>Your selection is saved. Complete payment before its reservation ends.</p>
          {checkouts.slice(0, 3).map((item) => (
            <Link key={item.id} to={`/tuition/${encodeURIComponent(item.id)}`}>
              Resume checkout for {item.learnerName}
              <ArrowRight size={17} aria-hidden="true" />
            </Link>
          ))}
        </section>
      )}
      {children}
      {bookings.data?.nextCursor && !current.length && (
        <Link className="text-link" to="/tuition">
          View all bookings
        </Link>
      )}
      {(returning || bookings.isError) && (
        <Link
          className="parent-discovery-link text-link"
          to={`/match?learner=${encodeURIComponent(learner.id)}`}
        >
          Find a tutor for {learner.name}
          <ArrowRight size={16} aria-hidden="true" />
        </Link>
      )}
    </>
  )
}
