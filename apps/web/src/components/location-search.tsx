import { useId, useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { LocateFixed, Plus, Search, X } from 'lucide-react'
import { api, type Schema } from '../lib/api'

type LocalityOption = { value: string; detail?: string }
export type StoredLocation = Schema['LocationPoint']
export type LocationSelection = StoredLocation & {
  location: string
  primary: string
  secondary?: string
}

export function locationLabel(location: StoredLocation | LocationSelection) {
  const candidate = location as Partial<LocationSelection>
  return clean(candidate.location || location.address || location.locality || location.city)
}

export function toStoredLocation(
  location: LocationSelection | StoredLocation | null | undefined,
): StoredLocation | null {
  if (!location) return null
  const candidate = location as Partial<LocationSelection>
  return {
    address: cleanMax(location.address || candidate.location || location.locality || location.city, 500),
    locality: cleanMax(location.locality || candidate.primary || location.city || candidate.location || '', 120),
    city: cleanMax(location.city || '', 120),
    district: cleanMax(location.district || '', 120),
    state: cleanMax(location.state || '', 120),
    country: cleanMax(location.country || 'India', 80),
    postalCode: cleanMax(location.postalCode || '', 20),
    latitude: Number(location.latitude || 0),
    longitude: Number(location.longitude || 0),
    accuracyMeters: Number(location.accuracyMeters || 0),
    source: cleanMax(location.source || 'browser', 40),
  }
}

export const purneaLocalities: LocalityOption[] = [
  { value: 'Purnea', detail: 'City' },
  { value: 'Purnia', detail: 'Common alternate spelling' },
  { value: 'Line Bazar', detail: 'Purnea' },
  { value: 'Bhatta Bazar', detail: 'Purnea' },
  { value: 'Madhubani, Purnea', detail: 'Purnea locality' },
  { value: 'Gulabbagh', detail: 'Purnea' },
  { value: 'Khuskibagh', detail: 'Purnea' },
  { value: 'Rambagh', detail: 'Purnea' },
  { value: 'Sipahi Tola', detail: 'Purnea' },
  { value: 'Maranga', detail: 'Purnea' },
  { value: 'Prabhat Colony', detail: 'Purnea' },
  { value: 'Tatma Toli', detail: 'Purnea' },
  { value: 'RN Shaw Chowk', detail: 'Purnea landmark' },
  { value: 'Ford Company Chowk', detail: 'Purnea landmark' },
  { value: 'Polytechnic Chowk', detail: 'Purnea landmark' },
  { value: 'Bus Stand, Purnea', detail: 'Landmark' },
  { value: 'Harda', detail: 'Near Purnea' },
  { value: 'Kasba', detail: 'Purnea district' },
  { value: 'Banmankhi', detail: 'Purnea district' },
  { value: 'Dhamdaha', detail: 'Purnea district' },
]

const cityOptions: LocalityOption[] = [
  { value: 'Purnea', detail: 'Launch city' },
  { value: 'Purnia', detail: 'Alternate spelling' },
  { value: 'Kasba', detail: 'Purnea district' },
  { value: 'Banmankhi', detail: 'Purnea district' },
  { value: 'Dhamdaha', detail: 'Purnea district' },
  { value: 'Patna', detail: 'Bihar' },
  { value: 'Delhi', detail: 'NCR' },
  { value: 'Mumbai', detail: 'Maharashtra' },
  { value: 'Kolkata', detail: 'West Bengal' },
  { value: 'Bengaluru', detail: 'Karnataka' },
  { value: 'Hyderabad', detail: 'Telangana' },
  { value: 'Chennai', detail: 'Tamil Nadu' },
  { value: 'Pune', detail: 'Maharashtra' },
]

function clean(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

function cleanMax(value: string, max: number) {
  const cleanValue = clean(value)
  return cleanValue.length > max ? cleanValue.slice(0, max).trim() : cleanValue
}

function useCurrentLocation(onDetected: (location: LocationSelection) => void) {
  const { t } = useTranslation()
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const detect = () => {
    if (!('geolocation' in navigator)) {
      setStatus(t('locationUnsupported'))
      return
    }
    setBusy(true)
    setStatus(t('locationDetecting'))
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords
        void api<LocationSelection>(
          `/location/reverse?${new URLSearchParams({
            latitude: String(latitude),
            longitude: String(longitude),
            accuracyMeters: String(position.coords.accuracy || 0),
          })}`,
        )
          .then((location) => {
            onDetected(location)
            setStatus(t('locationDetected', { location: location.location }))
          })
          .catch(() => {
            const fallback = {
              location: 'Near current location',
              primary: 'Near current location',
              address: 'Near current location',
              locality: 'Near current location',
              city: '',
              district: '',
              state: '',
              country: 'India',
              postalCode: '',
              latitude,
              longitude,
              accuracyMeters: position.coords.accuracy || 0,
              source: 'browser',
            }
            onDetected(fallback)
            setStatus(t('locationDetected', { location: fallback.location }))
          })
          .finally(() => setBusy(false))
      },
      (error) => {
        setBusy(false)
        setStatus(
          error.code === error.PERMISSION_DENIED ? t('locationDenied') : t('locationUnavailable'),
        )
      },
      { enableHighAccuracy: false, maximumAge: 10 * 60 * 1000, timeout: 10000 },
    )
  }
  return { status, busy, detect }
}

export function CurrentLocationButton({
  onLocationChange,
  children,
  className = 'location-current-btn',
}: {
  onLocationChange: (location: StoredLocation) => void
  children?: ReactNode
  className?: string
}) {
  const { t } = useTranslation()
  const { status, busy, detect } = useCurrentLocation((location) => {
    const stored = toStoredLocation(location)
    if (stored) onLocationChange(stored)
  })
  return (
    <div className="location-current-action">
      <button className={className} type="button" onClick={detect} disabled={busy}>
        <LocateFixed size={16} aria-hidden="true" />
        {children ?? (busy ? t('locationDetecting') : t('locationUseCurrent'))}
      </button>
      {status && (
        <span className="hint location-status" role="status">
          {status}
        </span>
      )}
    </div>
  )
}

export function LocationSearchField({
  label,
  value,
  onChange,
  error,
  hint,
  required = false,
  maxLength = 120,
  city = false,
  currentValue,
  onLocationChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  onLocationChange?: (location: StoredLocation | null) => void
  error?: string
  hint?: string
  required?: boolean
  maxLength?: number
  city?: boolean
  currentValue?: string
}) {
  const { t } = useTranslation()
  const id = useId()
  const listId = `${id}-options`
  const options = city ? cityOptions : purneaLocalities
  const { status, busy, detect } = useCurrentLocation((location) => {
    onChange(
      currentValue ?? (city ? location.city || location.primary || location.locality : location.location),
    )
    onLocationChange?.(toStoredLocation(location))
  })
  const described =
    [hint ? `${id}-hint` : '', error ? `${id}-error` : '', status ? `${id}-status` : '']
      .filter(Boolean)
      .join(' ') || undefined
  return (
    <div className="field location-field">
      <label htmlFor={id}>{label}</label>
      <div className="location-input-shell">
        <Search size={17} aria-hidden="true" />
        <input
          id={id}
          type="search"
          list={listId}
          value={value}
          onChange={(event) => {
            onChange(event.target.value)
            onLocationChange?.(null)
          }}
          required={required}
          maxLength={maxLength}
          autoComplete="off"
          placeholder={t(city ? 'citySearchPlaceholder' : 'locationSearchPlaceholder')}
          aria-invalid={!!error}
          aria-describedby={described}
        />
        <datalist id={listId}>
          {options.map((option) => (
            <option key={option.value} value={option.value} label={option.detail} />
          ))}
        </datalist>
      </div>
      <button
        className="location-current-btn"
        type="button"
        onClick={detect}
        disabled={busy}
        aria-describedby={described}
      >
        <LocateFixed size={16} aria-hidden="true" />
        {busy ? t('locationDetecting') : t('locationUseCurrent')}
      </button>
      {hint && (
        <span id={`${id}-hint`} className="hint">
          {hint}
        </span>
      )}
      {status && (
        <span id={`${id}-status`} className="hint location-status" role="status">
          {status}
        </span>
      )}
      {error && (
        <span id={`${id}-error`} className="field-error">
          {error}
        </span>
      )}
    </div>
  )
}

export function ServiceLocalityPicker({
  label,
  value,
  onChange,
  error,
  hint,
  currentLocality,
  locations = [],
  onLocationsChange,
}: {
  label: string
  value: string[]
  onChange: (value: string[]) => void
  locations?: StoredLocation[]
  onLocationsChange?: (value: StoredLocation[]) => void
  error?: string
  hint?: string
  currentLocality?: string
}) {
  const { t } = useTranslation()
  const id = useId()
  const listId = `${id}-options`
  const [query, setQuery] = useState('')
  const { status, busy, detect } = useCurrentLocation((location) => add(location.location, location))
  const selected = useMemo(() => value.map(clean).filter(Boolean), [value])
  const filtered = useMemo(() => {
    const text = query.toLocaleLowerCase()
    return purneaLocalities
      .filter(
        (option) =>
          !selected.some((item) => item.toLocaleLowerCase() === option.value.toLocaleLowerCase()),
      )
      .filter(
        (option) =>
          !text ||
          option.value.toLocaleLowerCase().includes(text) ||
          option.detail?.toLocaleLowerCase().includes(text),
      )
      .slice(0, 6)
  }, [query, selected])
  function add(raw = query, location?: LocationSelection) {
    const next = clean(raw)
    if (!next) return
    if (selected.some((item) => item.toLocaleLowerCase() === next.toLocaleLowerCase())) {
      setQuery('')
      return
    }
    onChange([...selected, next])
    if (location) {
      const stored = toStoredLocation(location)
      if (!stored) return
      onLocationsChange?.([
        ...locations.filter(
          (item) => locationLabel(item).toLocaleLowerCase() !== next.toLocaleLowerCase(),
        ),
        stored,
      ])
    }
    setQuery('')
  }
  function remove(item: string) {
    onChange(selected.filter((value) => value !== item))
    onLocationsChange?.(
      locations.filter(
        (location) =>
          locationLabel(location).toLocaleLowerCase() !== item.toLocaleLowerCase(),
      ),
    )
  }
  const described =
    [hint ? `${id}-hint` : '', error ? `${id}-error` : '', status ? `${id}-status` : '']
      .filter(Boolean)
      .join(' ') || undefined
  return (
    <div className="field location-field location-picker">
      <label htmlFor={id}>{label}</label>
      <div className="location-add-row">
        <div className="location-input-shell">
          <Search size={17} aria-hidden="true" />
          <input
            id={id}
            type="search"
            list={listId}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                add()
              }
            }}
            maxLength={100}
            autoComplete="off"
            placeholder={t('serviceLocalityPlaceholder')}
            aria-invalid={!!error}
            aria-describedby={described}
          />
          <datalist id={listId}>
            {purneaLocalities.map((option) => (
              <option key={option.value} value={option.value} label={option.detail} />
            ))}
          </datalist>
        </div>
        <button className="btn secondary location-add-btn" type="button" onClick={() => add()}>
          <Plus size={16} aria-hidden="true" />
          {t('add')}
        </button>
      </div>
      <div className="location-quick-actions">
        {currentLocality && clean(currentLocality) && (
          <button type="button" onClick={() => add(currentLocality)}>
            {t('addCurrentLocality')}
          </button>
        )}
        <button type="button" onClick={detect} disabled={busy}>
          <LocateFixed size={15} aria-hidden="true" />
          {busy ? t('locationDetecting') : t('locationUseCurrent')}
        </button>
      </div>
      {filtered.length > 0 && (
        <div className="location-suggestions" aria-label={t('locationSuggestions')}>
          {filtered.map((option) => (
            <button key={option.value} type="button" onClick={() => add(option.value)}>
              <span>{option.value}</span>
              {option.detail && <small>{option.detail}</small>}
            </button>
          ))}
        </div>
      )}
      {selected.length > 0 && (
        <ul className="location-chip-list" aria-label={t('serviceLocalitiesSelected')}>
          {selected.map((item) => (
            <li key={item}>
              <span>{item}</span>
              <button
                type="button"
                onClick={() => remove(item)}
                aria-label={`${t('remove')} ${item}`}
              >
                <X size={14} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {hint && (
        <span id={`${id}-hint`} className="hint">
          {hint}
        </span>
      )}
      {status && (
        <span id={`${id}-status`} className="hint location-status" role="status">
          {status}
        </span>
      )}
      {error && (
        <span id={`${id}-error`} className="field-error">
          {error}
        </span>
      )}
    </div>
  )
}
