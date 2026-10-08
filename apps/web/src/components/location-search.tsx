import { useId, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { LocateFixed, Search } from 'lucide-react'
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
    address: cleanMax(
      location.address || candidate.location || location.locality || location.city,
      500,
    ),
    locality: cleanMax(
      location.locality || candidate.primary || location.city || candidate.location || '',
      120,
    ),
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
            setStatus(t('locationResolveFailed'))
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
      currentValue ??
        (city ? location.city || location.primary || location.locality : location.location),
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
