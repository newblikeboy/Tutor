import '../locales/parent'
import '../locales/tuition'
import { useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Search,
  ShieldCheck,
  SlidersHorizontal,
} from 'lucide-react'
import { api, indiaDate, queryClient, send } from '../lib/api'
import type { Dashboard, Learner, Schema, Tutor } from '../lib/api'
import { useAuth, useDashboard } from '../lib/session'
import { allTutors, approvedTutorSubjects, tutorHasMode, tutorModeLabel } from '../lib/tutors'
import { workspaceLink } from '../lib/workspace'
import { ParentLocationControl } from '../components/parent-location-control'
import { TutorFees } from '../components/tutor-fees'
import { LearnerProfile } from '../components/learner-profile'
import { SubjectSelect } from '../components/subject-select'
import { teachingSubjects } from '../lib/subjects'
import {
  Alert,
  Button,
  Field,
  LinkButton,
  Loading,
  LoadError,
  MutationError,
} from '../components/ui'
import '../styles/parent.css'

export default function Match() {
  const { t } = useTranslation()
  const auth = useAuth()
  const dashboard = useDashboard()
  const [params] = useSearchParams()
  if (auth.isPending || dashboard.isPending) return <Loading />
  if (dashboard.isError) return <LoadError retry={() => void dashboard.refetch()} />
  if (auth.data?.user.role !== 'parent') return <Alert>{t('permission')}</Alert>
  const learner = dashboard.data.learners.find((item) => item.id === params.get('learner'))
  const profile = params.get('profile') === '1'
  return (
    <div className="container section wizard-container parent-match">
      <Link className="text-link parent-match-back" to={workspaceLink('overview', learner?.id)}>
        <ArrowLeft size={16} aria-hidden="true" />
        {t('parent.back')}
      </Link>
      <h1>
        {t(profile ? (params.get('edit') === '1' ? 'parent.edit' : 'parent.add') : 'parent.start')}
      </h1>
      {profile ? (
        params.get('edit') === '1' && !learner ? (
          <Alert>{t('parent.learnerMissing')}</Alert>
        ) : (
          <LearnerProfile learner={params.get('edit') === '1' ? learner : undefined} />
        )
      ) : (
        <ParentTutorFinder key={params.toString()} data={dashboard.data} />
      )}
    </div>
  )
}

function ParentTutorFinder({ data }: { data: Dashboard }) {
  const { t } = useTranslation()
  const [params, setParams] = useSearchParams()
  const [learnerId, setLearnerId] = useState(params.get('learner') ?? data.learners[0]?.id ?? '')
  const learner = data.learners.find((item) => item.id === learnerId)
  const [mode, setMode] = useState(params.get('mode') === 'home' ? 'home' : 'online')
  const [subjects, setSubjects] = useState<string[]>(() =>
    learner && learner.class <= 5
      ? ['All Subjects']
      : params.getAll('subject').filter((subject) => teachingSubjects.includes(subject)),
  )
  const [radius, setRadius] = useState(Number(params.get('radiusKm') ?? 5))
  const [selection, setSelection] = useState<{
    learner: Learner
    mode: string
    subjects: string[]
    radius: number
  } | null>(() =>
    params.get('searched') === '1' && learner && subjects.length
      ? { learner, mode, subjects, radius }
      : null,
  )
  const [invalid, setInvalid] = useState(false)
  const account = useQuery({
    queryKey: ['account'],
    queryFn: ({ signal }) => api<Schema['Account']>('/account', { signal }),
  })
  if (!data.learners.length)
    return <LinkButton to="/match?new=1&profile=1">{t('parent.add')}</LinkButton>
  return (
    <div className="form-stack">
      {account.data && <ParentLocationControl account={account.data} />}
      <form
        className="panel parent-finder"
        onSubmit={(event) => {
          event.preventDefault()
          if (
            !learner ||
            !subjects.length ||
            (mode === 'home' && !account.data?.preferences.location)
          ) {
            setInvalid(true)
            return
          }
          setInvalid(false)
          const next = new URLSearchParams({
            learner: learner.id,
            mode,
            radiusKm: String(radius),
            searched: '1',
          })
          subjects.forEach((subject) => next.append('subject', subject))
          if (params.get('tutor')) next.set('tutor', params.get('tutor')!)
          setParams(next)
        }}
      >
        <div className="parent-finder-fields">
          <Field label={t('parent.learner')}>
            <select
              value={learnerId}
              onChange={(event) => {
                const next = data.learners.find((item) => item.id === event.target.value)
                setLearnerId(event.target.value)
                setSubjects(next && next.class <= 5 ? ['All Subjects'] : [])
                setSelection(null)
              }}
            >
              {data.learners.map((item) => (
                <option value={item.id} key={item.id}>
                  {item.name} · Class {item.class}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Teaching mode">
            <select
              value={mode}
              onChange={(event) => {
                setMode(event.target.value)
                setSelection(null)
              }}
            >
              <option value="online">Online</option>
              <option value="home">Home Tuition</option>
            </select>
          </Field>
          {learner && learner.class <= 5 ? (
            <Field label="Subject">
              <select defaultValue="All Subjects">
                <option>All Subjects</option>
              </select>
            </Field>
          ) : (
            <SubjectSelect
              label="Subjects"
              placeholder="Select subjects"
              value={subjects}
              onChange={(value) => {
                setSubjects(value)
                setSelection(null)
              }}
              error={invalid && !subjects.length ? 'Select at least one subject.' : undefined}
            />
          )}
          <Field
            label="Teacher distance"
            hint={
              mode === 'online'
                ? 'Distance applies to Home Tuition.'
                : `${radius} km from your saved location`
            }
          >
            <select
              value={radius}
              disabled={mode === 'online'}
              onChange={(event) => {
                setRadius(Number(event.target.value))
                setSelection(null)
              }}
            >
              {[1, 3, 5, 10, 15, 25, 50, 100].map((value) => (
                <option value={value} key={value}>
                  {value} km
                </option>
              ))}
            </select>
          </Field>
        </div>
        {invalid && mode === 'home' && !account.data?.preferences.location && (
          <Alert kind="error">Save your location to search for home tutors.</Alert>
        )}
        {account.isError && <LoadError retry={() => void account.refetch()} />}
        <Button type="submit" disabled={account.isPending}>
          <Search size={17} aria-hidden="true" />
          Search tutors
        </Button>
      </form>
      {selection && (
        <TrialRequest
          key={JSON.stringify(selection)}
          learner={selection.learner}
          bookingSubjects={selection.subjects}
          bookingMode={selection.mode}
          radius={selection.radius}
          selectedTutor={params.get('tutor') ?? ''}
        />
      )}
    </div>
  )
}

function compareTutorDistance(a: Tutor, b: Tutor) {
  if (a.distanceKm != null && b.distanceKm != null) return a.distanceKm - b.distanceKm
  if (a.distanceKm != null) return -1
  if (b.distanceKm != null) return 1
  return 0
}

function TrialRequest({
  learner,
  bookingSubjects,
  bookingMode,
  radius,
  selectedTutor,
}: {
  learner: Learner
  bookingSubjects: string[]
  bookingMode: string
  radius: number
  selectedTutor: string
}) {
  const { t, i18n } = useTranslation()
  const account = useQuery({
    queryKey: ['account'],
    queryFn: ({ signal }) => api<Schema['Account']>('/account', { signal }),
  })
  const parentLocation = account.data?.preferences.location ?? null
  const tutors = useQuery({
    queryKey: [
      'tutors',
      'request',
      learner.id,
      bookingSubjects,
      bookingMode,
      radius,
      parentLocation,
    ],
    queryFn: ({ signal }) => {
      const search = new URLSearchParams({ class: String(learner.class), mode: bookingMode })
      bookingSubjects.forEach((subject) => search.append('subject', subject))
      if (bookingMode === 'home' && parentLocation) {
        search.set('latitude', String(parentLocation.latitude))
        search.set('longitude', String(parentLocation.longitude))
        search.set('radiusKm', String(radius))
      }
      return allTutors(`/tutors?${search}`, signal)
    },
    enabled: !account.isPending,
  })
  const [tutorId, setTutorId] = useState(selectedTutor)
  const [start, setStart] = useState('')
  const [terms, setTerms] = useState(false)
  const [search, setSearch] = useState('')
  const [language, setLanguage] = useState('')
  const mode = bookingMode
  const [sort, setSort] = useState('recommended')
  const key = useRef(crypto.randomUUID())
  const request = useMutation({
    mutationFn: () =>
      send<Schema['Trial']>(
        '/trials',
        {
          learnerId: learner.id,
          subjects: bookingSubjects,
          mode: bookingMode,
          tutorId,
          start: new Date(start).toISOString(),
          termsAccepted: terms,
        },
        'POST',
        { 'Idempotency-Key': key.current },
      ),
    onSuccess: (trial) => {
      queryClient.setQueryData<Dashboard>(
        ['dashboard'],
        (dashboard) =>
          dashboard && {
            ...dashboard,
            trials: [...dashboard.trials.filter((item) => item.id !== trial.id), trial],
          },
      )
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
  if (account.isPending || tutors.isPending) return <Loading />
  if (account.isError) return <LoadError retry={() => void account.refetch()} />
  if (tutors.isError) return <LoadError retry={() => void tutors.refetch()} />
  const learnerLanguage = learner.language
  const suitable = tutors.data.filter(
    (v) =>
      learner.class >= v.scope.minClass &&
      learner.class <= v.scope.maxClass &&
      bookingSubjects.every((subject) => approvedTutorSubjects(v.scope).includes(subject)),
  )
  const visibleTutors = suitable
    .filter((tutor) => {
      const text = search.trim().toLocaleLowerCase()
      const matchesSearch =
        !text ||
        [tutor.name, tutor.approach, tutor.scope.subject]
          .join(' ')
          .toLocaleLowerCase()
          .includes(text)
      const matchesLanguage = !language || tutor.language === language
      const matchesMode = !mode || tutorHasMode(tutor, mode)
      return matchesSearch && matchesLanguage && matchesMode
    })
    .sort((a, b) => {
      if (sort === 'distance') return compareTutorDistance(a, b) || a.name.localeCompare(b.name)
      if (sort === 'experience') return b.experience - a.experience || a.name.localeCompare(b.name)
      if (sort === 'review') return a.scope.expiresAt.localeCompare(b.scope.expiresAt)
      const aLanguage = learnerLanguage && a.language === learnerLanguage ? 1 : 0
      const bLanguage = learnerLanguage && b.language === learnerLanguage ? 1 : 0
      return (
        bLanguage - aLanguage ||
        compareTutorDistance(a, b) ||
        b.experience - a.experience ||
        a.name.localeCompare(b.name)
      )
    })
  const selected = suitable.find((tutor) => tutor.id === tutorId)
  const chooseTutor = (id: string) => {
    if (id !== tutorId) {
      setStart('')
      setTerms(false)
    }
    setTutorId(id)
    key.current = crypto.randomUUID()
  }
  return (
    <form
      className="panel form-stack trial-form parent-tutor-choice"
      onSubmit={(e) => {
        e.preventDefault()
        if (!tutorId || !start || !terms) return
        request.mutate()
      }}
    >
      <h2>{t('requestTrial')}</h2>
      <p className="fine-print">
        {learner.name} · {bookingSubjects.join(', ')}
      </p>
      {suitable.length === 0 ? (
        <Alert>{t('noTutorsBody')}</Alert>
      ) : (
        <>
          <section className="parent-tutor-browser" aria-label={t('parentTutorChooserEyebrow')}>
            <div className="parent-tutor-browser-head">
              <div>
                <p className="eyebrow">{t('parentTutorChooserEyebrow')}</p>
              </div>
              <span>
                <ShieldCheck size={17} aria-hidden="true" />
                {t('parentTutorChooserCount', { count: visibleTutors.length })}
              </span>
            </div>
            <div className="parent-tutor-filters" aria-label={t('parentTutorFilters')}>
              <div className="parent-tutor-search">
                <Search size={16} aria-hidden="true" />
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={t('parentTutorSearch')}
                  aria-label={t('parentTutorSearch')}
                />
              </div>
              <label>
                <span>{t('preferredLanguage')}</span>
                <select value={language} onChange={(event) => setLanguage(event.target.value)}>
                  <option value="">{t('allLanguages')}</option>
                  <option value="Hindi">{t('hindi')}</option>
                  <option value="English">{t('english')}</option>
                </select>
              </label>
              <label>
                <span>{t('parentTutorSort')}</span>
                <select value={sort} onChange={(event) => setSort(event.target.value)}>
                  <option value="recommended">{t('parentTutorSortRecommended')}</option>
                  <option value="distance">{t('parentTutorSortDistance')}</option>
                  <option value="experience">{t('parentTutorSortExperience')}</option>
                  <option value="review">{t('parentTutorSortReview')}</option>
                </select>
              </label>
              <button
                type="button"
                className="parent-tutor-reset"
                onClick={() => {
                  setSearch('')
                  setLanguage('')
                  setSort('recommended')
                }}
              >
                <SlidersHorizontal size={15} aria-hidden="true" />
                {t('reset')}
              </button>
            </div>
            {visibleTutors.length === 0 ? (
              <Alert>{t('parentTutorNoFilterResults')}</Alert>
            ) : (
              <div className="parent-tutor-grid" role="radiogroup" aria-label={t('selectTutor')}>
                {visibleTutors.map((tutor) => {
                  const isSelected = tutor.id === tutorId
                  const tutorMode = tutorModeLabel(tutor.scope, t)
                  const tutorLanguage = t(tutor.language === 'Hindi' ? 'hindi' : 'english')
                  const experience =
                    tutor.experience > 0
                      ? t('teacherProofExperienceValue', { count: tutor.experience })
                      : t('teacherExperienceNew')
                  const distance =
                    tutor.distanceKm != null
                      ? t('teacherDistanceAway', { distance: tutor.distanceKm.toFixed(1) })
                      : ''
                  const serviceRadius =
                    tutor.serviceRadiusKm > 0
                      ? t('teacherServiceRadius', { count: tutor.serviceRadiusKm })
                      : ''
                  const classFit = learner
                    ? t('parentTutorClassFit', { class: learner.class })
                    : t('scoped')
                  return (
                    <article
                      className={`parent-tutor-option ${isSelected ? 'selected' : ''}`}
                      key={tutor.id}
                    >
                      <label>
                        <input
                          type="radio"
                          name="tutorId"
                          value={tutor.id}
                          checked={isSelected}
                          required
                          onChange={() => chooseTutor(tutor.id)}
                        />
                        <span className="parent-tutor-card-shell">
                          <span className="parent-tutor-card-main">
                            <span className="parent-tutor-card-top">
                              <TutorPhoto tutor={tutor} />
                              <span>
                                <small>{tutor.sample ? t('sampleProfile') : t('scoped')}</small>
                                <strong>{tutor.name}</strong>
                                <em>
                                  {approvedTutorSubjects(tutor.scope).join(', ')} - {t('classes')}{' '}
                                  {tutor.scope.minClass}-{tutor.scope.maxClass}
                                </em>
                              </span>
                            </span>
                            <span className="parent-tutor-meta">
                              <span>{classFit}</span>
                              <span>{tutorMode}</span>
                              <span>{tutorLanguage}</span>
                              <span>{experience}</span>
                              {distance && <span>{distance}</span>}
                              {!distance && tutor.publicLocality && (
                                <span>{tutor.publicLocality}</span>
                              )}
                              {serviceRadius && <span>{serviceRadius}</span>}
                            </span>
                            <span className="parent-tutor-approach">{tutor.approach}</span>
                            {tutor.introVideoUrl && (
                              <video
                                className="parent-tutor-video"
                                controls
                                preload="metadata"
                                src={tutor.introVideoUrl}
                                aria-label={`${tutor.name} introduction video`}
                              />
                            )}
                            <span className="parent-tutor-review">
                              {t('teacherProofReview')}:{' '}
                              {indiaDate(tutor.scope.expiresAt, i18n.language)}
                            </span>
                          </span>
                          <span className="parent-tutor-card-aside">
                            <span className="parent-tutor-price">
                              <TutorFees plans={tutor.feePlans} />
                            </span>
                          </span>
                        </span>
                      </label>
                      <Link
                        className="text-link parent-tutor-profile-link"
                        to={`/tutors/${tutor.id}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {t('viewCompleteProfile')}
                      </Link>
                      <TutorTrialActions
                        tutor={tutor}
                        selected={isSelected}
                        start={start}
                        terms={terms}
                        pending={request.isPending}
                        error={request.error}
                        onSelect={() => chooseTutor(tutor.id)}
                        onStartChange={(value) => {
                          setStart(value)
                          key.current = crypto.randomUUID()
                        }}
                        onTermsChange={setTerms}
                      />
                    </article>
                  )
                })}
              </div>
            )}
          </section>
          {selected && (
            <Alert kind="success">{t('parentTutorSelected', { name: selected.name })}</Alert>
          )}
        </>
      )}
    </form>
  )
}

function TutorPhoto({ tutor }: { tutor: Tutor }) {
  const [failed, setFailed] = useState(false)
  return (
    <span className="initial-avatar parent-tutor-photo" aria-hidden="true">
      {tutor.photoUrl && !failed ? (
        <img src={tutor.photoUrl} alt="" onError={() => setFailed(true)} />
      ) : (
        tutor.name.slice(0, 1)
      )}
    </span>
  )
}

function TutorTrialActions({
  tutor,
  selected,
  start,
  terms,
  pending,
  error,
  onSelect,
  onStartChange,
  onTermsChange,
}: {
  tutor: Tutor
  selected: boolean
  start: string
  terms: boolean
  pending: boolean
  error: unknown
  onSelect: () => void
  onStartChange: (value: string) => void
  onTermsChange: (value: boolean) => void
}) {
  const { t, i18n } = useTranslation()
  const [pickedDate, setPickedDate] = useState('')
  const [calendarMonth, setCalendarMonth] = useState(() => startOfMonth(new Date()))
  const availability = useQuery({
    queryKey: ['availability', tutor.id, 'trial'],
    queryFn: ({ signal }) =>
      api<Schema['Availability']>(`/tutors/${tutor.id}/availability`, { signal }),
    enabled: selected,
  })
  if (!selected) {
    return (
      <div className="parent-tutor-actions compact">
        <Button type="button" variant="secondary" className="parent-tutor-book" onClick={onSelect}>
          {t('bookTrial')}
        </Button>
      </div>
    )
  }
  if (availability.isPending) {
    return (
      <div className="parent-tutor-actions">
        <Loading />
      </div>
    )
  }
  if (availability.isError) {
    return (
      <div className="parent-tutor-actions">
        <LoadError retry={() => void availability.refetch()} />
      </div>
    )
  }
  const selectedDate = pickedDate || start.slice(0, 10)
  const slots = selectedDate ? trialSlotsForDate(availability.data, selectedDate) : []
  const selectedMinute =
    selectedDate && start.startsWith(`${selectedDate}T`) ? timeToMinute(start.slice(11, 16)) : -1
  const selectedStillAvailable =
    !!selectedDate &&
    selectedMinute >= 0 &&
    slotAvailable(availability.data, selectedDate, selectedMinute)
  const calendarWeeks = trialCalendarWeeks(calendarMonth)
  const todayMonth = startOfMonth(new Date())
  const latest = new Date()
  latest.setMonth(latest.getMonth() + 1)
  const latestMonth = startOfMonth(latest)
  const canGoPrevious = calendarMonth > todayMonth
  const canGoNext = calendarMonth < latestMonth
  const monthLabel = new Intl.DateTimeFormat('en-IN', {
    month: 'long',
    year: 'numeric',
  }).format(calendarMonth)
  return (
    <div className="parent-tutor-actions">
      <div className="parent-trial-picker">
        <div>
          <p className="eyebrow">{t('availabilityCalendar')}</p>
          <p className="hint">{t('availabilityCalendarHint')}</p>
        </div>
        {availability.data.paused || !availability.data.windows.length ? (
          <Alert>{t('tuition.noAvailabilityBody')}</Alert>
        ) : (
          <>
            <div className="parent-trial-calendar-box" aria-label={t('availabilityDates')}>
              <div className="parent-trial-calendar-head">
                <button
                  type="button"
                  className="icon-button"
                  onClick={() => setCalendarMonth(addMonths(calendarMonth, -1))}
                  disabled={!canGoPrevious}
                  aria-label={t('back')}
                >
                  <ChevronLeft size={17} aria-hidden="true" />
                </button>
                <strong>{monthLabel}</strong>
                <button
                  type="button"
                  className="icon-button"
                  onClick={() => setCalendarMonth(addMonths(calendarMonth, 1))}
                  disabled={!canGoNext}
                  aria-label={t('next')}
                >
                  <ChevronRight size={17} aria-hidden="true" />
                </button>
              </div>
              <div className="parent-trial-weekdays" aria-hidden="true">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                  <span key={day}>{day}</span>
                ))}
              </div>
              <div className="parent-trial-calendar" role="group" aria-label={monthLabel}>
                {calendarWeeks.flat().map((date, index) => {
                  if (!date) return <span aria-hidden="true" key={`empty-${index}`} />
                  const value = dateInputValue(date)
                  const inMonth = date.getMonth() === calendarMonth.getMonth()
                  const inRange = trialDateInRange(value)
                  const available = inMonth && inRange && hasTrialSlot(availability.data, value)
                  const unavailable = inMonth && inRange && !available
                  return (
                    <button
                      type="button"
                      key={value}
                      aria-label={new Intl.DateTimeFormat('en-IN', { dateStyle: 'full' }).format(
                        date,
                      )}
                      aria-pressed={selectedDate === value}
                      className={`trial-date ${available ? 'available' : ''} ${
                        unavailable ? 'unavailable' : ''
                      } ${selectedDate === value ? 'selected' : ''}`}
                      onClick={() => {
                        if (!available) return
                        setPickedDate(value)
                        if (!start.startsWith(`${value}T`)) onStartChange('')
                      }}
                      disabled={!available}
                    >
                      <strong>{date.getDate()}</strong>
                    </button>
                  )
                })}
              </div>
            </div>
            {selectedDate ? (
              <div>
                <p className="parent-trial-section-label">{t('availabilityTimes')}</p>
                <div className="parent-trial-times" aria-label={t('availabilityTimes')}>
                  {slots.map((slot) => (
                    <button
                      type="button"
                      key={slot.minute}
                      className={`trial-time ${slot.available ? 'available' : 'unavailable'} ${
                        selectedMinute === slot.minute ? 'selected' : ''
                      }`}
                      disabled={!slot.available}
                      onClick={() => onStartChange(`${selectedDate}T${slot.label}`)}
                    >
                      {formatTrialTime(slot.label, i18n.language)}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <p className="parent-trial-section-label">{t('availabilityPickDate')}</p>
            )}
          </>
        )}
      </div>
      <Alert>{t('termsBody')}</Alert>
      <label className="check-label">
        <input
          type="checkbox"
          checked={terms}
          onChange={(event) => onTermsChange(event.target.checked)}
          required
        />
        {t('terms')}
      </label>
      <MutationError error={error} />
      <Button type="submit" busy={pending} disabled={!selectedStillAvailable || !terms}>
        {t('bookTrial')}
      </Button>
    </div>
  )
}

function trialSlotsForDate(availability: Schema['Availability'], date: string) {
  const starts = new Set<number>()
  for (let minute = 6 * 60; minute <= 21 * 60; minute += 30) starts.add(minute)
  for (const window of availability.windows) {
    if (window.day !== weekdayForDate(date)) continue
    const first = Math.ceil(window.startMinute / 30) * 30
    const last = window.endMinute - 60
    for (let minute = first; minute <= last; minute += 30) starts.add(minute)
  }
  return Array.from(starts)
    .sort((a, b) => a - b)
    .map((minute) => ({
      minute,
      label: minuteLabel(minute),
      available: slotAvailable(availability, date, minute),
    }))
}

function startOfMonth(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), 1)
}

function addMonths(value: Date, months: number) {
  return new Date(value.getFullYear(), value.getMonth() + months, 1)
}

function trialCalendarWeeks(month: Date) {
  const first = startOfMonth(month)
  const days = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate()
  const cells: Array<Date | null> = Array.from({ length: first.getDay() }, () => null)
  for (let day = 1; day <= days; day += 1) {
    cells.push(new Date(first.getFullYear(), first.getMonth(), day))
  }
  while (cells.length % 7 !== 0) cells.push(null)
  const weeks: Array<Array<Date | null>> = []
  for (let index = 0; index < cells.length; index += 7) weeks.push(cells.slice(index, index + 7))
  return weeks
}

function trialDateInRange(value: string) {
  const date = localDateTime(value, 12 * 60)
  if (!date) return false
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const latest = new Date(today)
  latest.setMonth(latest.getMonth() + 1)
  return date >= today && date <= latest
}

function hasTrialSlot(availability: Schema['Availability'], date: string) {
  return trialSlotsForDate(availability, date).some((slot) => slot.available)
}

function slotAvailable(availability: Schema['Availability'], date: string, minute: number) {
  if (availability.paused || availability.leaveDates.includes(date)) return false
  const start = localDateTime(date, minute)
  const end = localDateTime(date, minute + 60)
  const now = new Date()
  const latest = new Date(now)
  latest.setMonth(latest.getMonth() + 1)
  if (!start || !end || start <= new Date(now.getTime() + 5 * 60 * 1000) || start > latest) {
    return false
  }
  return availability.windows.some(
    (window) =>
      window.day === weekdayForDate(date) &&
      minute >= window.startMinute &&
      minute + 60 <= window.endMinute,
  )
}

function dateInputValue(value: Date) {
  return [
    value.getFullYear(),
    String(value.getMonth() + 1).padStart(2, '0'),
    String(value.getDate()).padStart(2, '0'),
  ].join('-')
}

function weekdayForDate(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day).getDay()
}

function localDateTime(date: string, minute: number) {
  const [year, month, day] = date.split('-').map(Number)
  return new Date(year, month - 1, day, Math.floor(minute / 60), minute % 60)
}

function minuteLabel(minute: number) {
  return `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(
    2,
    '0',
  )}`
}

function timeToMinute(value: string) {
  const [hour, minute] = value.split(':').map(Number)
  return hour * 60 + minute
}

function formatTrialTime(value: string, language: string) {
  const [hour, minute] = value.split(':').map(Number)
  const date = new Date(2000, 0, 1, hour, minute)
  return new Intl.DateTimeFormat(language === 'hi' ? 'hi-IN' : 'en-IN', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}
