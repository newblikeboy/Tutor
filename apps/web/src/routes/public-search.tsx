import { useState } from 'react'
import '../styles/home.css'

import { Link, useSearchParams } from 'react-router-dom'
import { useInfiniteQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ArrowRight, House, Monitor, SlidersHorizontal } from 'lucide-react'
import { apiPage } from '../lib/api'
import type { Tutor } from '../lib/api'
import { tutorHasMode } from '../lib/tutors'
import { LocationSearchField, type StoredLocation } from '../components/location-search'

import { SubjectSelect } from '../components/subject-select'
import {
  Badge,
  Button,
  Empty,
  Field,
  LinkButton,
  LoadError,
  Loading,
  Modal,
  PageHeading,
} from '../components/ui'
import { TutorCard } from '../components/tutor-card'
function QuickTutorFinder() {
  const { t } = useTranslation()
  const classOptions = [
    { value: 5, label: t('landing.finderClassPrimary') },
    { value: 8, label: t('landing.finderClassMiddle') },
    { value: 10, label: t('landing.finderClassBoard') },
    { value: 12, label: t('landing.finderClassSenior') },
  ]
  const modeOptions = [
    { value: 'online', label: t('online') },
    { value: 'home', label: t('landing.finderOffline') },
  ]
  const [finderClass, setFinderClass] = useState(classOptions[1].value)
  const [finderMode, setFinderMode] = useState('online')
  const [finderSubjects, setFinderSubjects] = useState<string[]>([])
  const [finderTime, setFinderTime] = useState('17:00')
  const finderGoal = t('landing.finderGoal', {
    mode: t(finderMode === 'online' ? 'online' : 'landing.finderOffline'),
    time: finderTime,
  })
  const finderParams = new URLSearchParams({
    searched: '1',
    class: String(finderClass),
    mode: finderMode,
    time: finderTime,
    goal: finderGoal,
  })
  finderSubjects.forEach((subject) => finderParams.append('subject', subject))
  const finderLink = `/tutors?${finderParams}`
  return (
    <aside
      id="quick-tutor-finder"
      className="home-finder tutor-search-finder"
      aria-label={t('landing.finderTitle')}
    >
      <div className="home-finder-group">
        <span>{t('landing.finderClassLabel')}</span>
        <div className="home-finder-options">
          {classOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={finderClass === option.value}
              onClick={() => setFinderClass(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
      <div className="home-finder-group">
        <span>{t('landing.finderModeLabel')}</span>
        <div className="home-finder-options two">
          {modeOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={finderMode === option.value}
              onClick={() => setFinderMode(option.value)}
            >
              {option.value === 'online' ? (
                <Monitor size={15} aria-hidden="true" />
              ) : (
                <House size={15} aria-hidden="true" />
              )}
              {option.label}
            </button>
          ))}
        </div>
      </div>
      <SubjectSelect value={finderSubjects} onChange={setFinderSubjects} />
      <Field label={t('landing.finderPreferredTime')}>
        <input
          type="time"
          value={finderTime}
          onChange={(event) => setFinderTime(event.target.value)}
        />
      </Field>
      <LinkButton to={finderLink}>{t('landing.finderButton')}</LinkButton>
      <p className="home-finder-note">{t('landing.finderNote')}</p>
    </aside>
  )
}

export function Search() {
  const { t } = useTranslation()
  const [params, setParams] = useSearchParams()
  const subjects = params.getAll('subject').filter(Boolean)
  const language = params.get('language') ?? ''
  const hasSearched =
    params.get('searched') === '1' ||
    params.has('class') ||
    params.has('mode') ||
    params.has('subject')
  const requestedClass = Number(params.get('class'))
  const classFilter =
    Number.isInteger(requestedClass) && requestedClass >= 1 && requestedClass <= 12
      ? requestedClass
      : null
  const modeFilter = params.get('mode')
  const selectedMode = modeFilter === 'home' || modeFilter === 'online' ? modeFilter : ''
  const timeFilter = params.get('time')?.trim() ?? ''
  const locationText = params.get('locality')?.trim() ?? ''
  const latitude = params.get('latitude') ?? ''
  const longitude = params.get('longitude') ?? ''
  const radiusKm = params.get('radiusKm') ?? '5'
  const modeLabel = selectedMode
    ? t(selectedMode === 'home' ? 'landing.homeMode' : 'landing.onlineMode')
    : t('allModes')
  const query = useInfiniteQuery({
    queryKey: [
      'tutors',
      subjects,
      language,
      classFilter,
      selectedMode,
      latitude,
      longitude,
      radiusKm,
    ],
    initialPageParam: '',
    queryFn: ({ signal, pageParam }) => {
      const request = new URLSearchParams()
      if (pageParam) request.set('cursor', pageParam)
      subjects.forEach((subject) => request.append('subject', subject))
      if (language) request.set('language', language)
      if (classFilter) request.set('class', String(classFilter))
      if (selectedMode) request.set('mode', selectedMode)
      if (selectedMode === 'home' && latitude && longitude) {
        request.set('latitude', latitude)
        request.set('longitude', longitude)
        request.set('radiusKm', radiusKm)
      }
      return apiPage<Tutor>(`/tutors?${request}`, { signal })
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor || undefined,
    enabled: hasSearched,
  })
  const results =
    query.data?.pages
      .flatMap((page) => page.items)
      .filter((tutor) => {
        return !selectedMode || tutorHasMode(tutor, selectedMode)
      }) ?? []
  function filter(key: string, value: string) {
    const next = new URLSearchParams(params)
    if (value) {
      next.set(key, value)
      next.set('searched', '1')
    } else {
      next.delete(key)
    }
    setParams(next)
  }
  function updateSearch(values: Record<string, string | null>) {
    const next = new URLSearchParams(params)
    next.set('searched', '1')
    for (const [key, value] of Object.entries(values)) {
      if (value) next.set(key, value)
      else next.delete(key)
    }
    setParams(next)
  }
  function setSearchLocation(location: StoredLocation | null) {
    if (!location) {
      updateSearch({ latitude: null, longitude: null })
      return
    }
    updateSearch({
      locality: location.address || location.locality || location.city,
      latitude: String(location.latitude),
      longitude: String(location.longitude),
    })
  }
  const fields = (
    <div className="filter-fields">
      <SubjectSelect
        value={subjects}
        onChange={(values) => {
          const next = new URLSearchParams(params)
          next.delete('subject')
          values.forEach((subject) => next.append('subject', subject))
          next.set('searched', '1')
          setParams(next)
        }}
      />
      <Field label={t('preferredLanguage')}>
        <select value={language} onChange={(e) => filter('language', e.target.value)}>
          <option value="">{t('allLanguages')}</option>
          <option value="Hindi">{t('hindi')}</option>
          <option value="English">{t('english')}</option>
        </select>
      </Field>
      <Field label={t('classes')}>
        <select value={classFilter ?? ''} onChange={(e) => filter('class', e.target.value)}>
          <option value="">{t('allClasses')}</option>
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((klass) => (
            <option key={klass} value={klass}>
              {klass}
            </option>
          ))}
        </select>
      </Field>
      <Field label={t('landing.finderModeLabel')}>
        <select value={selectedMode} onChange={(e) => filter('mode', e.target.value)}>
          <option value="">{t('allModes')}</option>
          <option value="home">{t('landing.homeMode')}</option>
          <option value="online">{t('landing.onlineMode')}</option>
        </select>
      </Field>
      {selectedMode === 'home' && (
        <>
          <LocationSearchField
            label={t('parentSearchLocation')}
            value={locationText}
            onChange={(value) => updateSearch({ locality: value, latitude: null, longitude: null })}
            onLocationChange={setSearchLocation}
            maxLength={160}
            hint={t('parentSearchLocationHint')}
          />
          <Field label={t('searchRadius')}>
            <select value={radiusKm} onChange={(e) => filter('radiusKm', e.target.value)}>
              {['2', '5', '10', '15', '25'].map((value) => (
                <option key={value} value={value}>
                  {t('radiusKm', { count: Number(value) })}
                </option>
              ))}
            </select>
          </Field>
        </>
      )}
      <div className="scope-filter">
        {selectedMode === 'home' ? <House size={18} /> : <Monitor size={18} />}
        <div>
          <strong>{t('yourSearch')}</strong>
          <p>
            {classFilter ? `${t('classes')} ${classFilter}` : t('allClasses')}
            {` - ${modeLabel}`}
            {timeFilter ? ` - ${timeFilter}` : ''}
            {selectedMode === 'home' && locationText ? ` - ${locationText}` : ''}
          </p>
        </div>
      </div>
      <Button variant="text" onClick={() => setParams({})}>
        {t('reset')}
      </Button>
    </div>
  )
  if (!hasSearched) {
    return (
      <div className="container section tutor-finder-page">
        <PageHeading title={t('landing.finderTitle')} body={t('searchIntro')} />
        <QuickTutorFinder />
      </div>
    )
  }
  return (
    <div className="container section tutor-results-page">
      <div className="tutor-results-heading">
        <div>
          <p className="eyebrow">{t('teacherResultsEyebrow')}</p>
          <h1>{t('searchTitle')}</h1>
          <p>{t('searchIntro')}</p>
        </div>
        <Link to="/tutors" className="text-link">
          {t('editNeed')} <ArrowRight size={17} />
        </Link>
      </div>
      <div className="search-layout tutor-results-layout">
        <aside className="filter-rail tutor-filter-rail">
          <h2>{t('filters')}</h2>
          {fields}
        </aside>
        <div className="tutor-results-main">
          <div className="results-bar">
            <p aria-live="polite">
              <strong>{query.data ? results.length : '...'}</strong> {t('results')}
            </p>
            <div className="mobile-filters">
              <Modal
                title={t('filters')}
                drawer
                trigger={
                  <Button variant="secondary">
                    <SlidersHorizontal size={18} />
                    {t('filters')}
                  </Button>
                }
              >
                {fields}
              </Modal>
            </div>
          </div>
          <div className="filter-chips">
            {subjects.map((subject) => (
              <Badge key={subject} tone="neutral">
                {subject}
              </Badge>
            ))}
            {classFilter && <Badge tone="neutral">{`${t('classes')} ${classFilter}`}</Badge>}
            {selectedMode && <Badge tone="neutral">{modeLabel}</Badge>}
            {selectedMode === 'home' && locationText && (
              <Badge tone="neutral">{locationText}</Badge>
            )}
            {selectedMode === 'home' && latitude && longitude && (
              <Badge tone="neutral">{t('radiusKm', { count: Number(radiusKm) })}</Badge>
            )}
            {timeFilter && <Badge tone="neutral">{timeFilter}</Badge>}
            {language && (
              <button className="filter-chip" onClick={() => filter('language', '')}>
                {t(language === 'Hindi' ? 'hindi' : 'english')} ?
              </button>
            )}
          </div>
          {query.isPending ? (
            <Loading />
          ) : query.isError && !query.data ? (
            <LoadError retry={() => void query.refetch()} />
          ) : results.length ? (
            <div className="search-cards">
              {results.map((tutor) => (
                <TutorCard key={tutor.id} tutor={tutor} />
              ))}
            </div>
          ) : (
            <Empty title={t('noTutors')} body={t('noTutorsBody')}>
              <LinkButton to="/match">{t('requestMatch')}</LinkButton>
            </Empty>
          )}
          {query.isError && query.data && (
            <LoadError
              retry={() =>
                void (query.isFetchNextPageError ? query.fetchNextPage() : query.refetch())
              }
            />
          )}
          {query.hasNextPage && !query.isFetchNextPageError && (
            <Button
              variant="secondary"
              busy={query.isFetchingNextPage}
              onClick={() => void query.fetchNextPage()}
            >
              Load more tutors
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
