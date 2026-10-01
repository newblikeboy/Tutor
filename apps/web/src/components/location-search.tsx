import { useId, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LocateFixed, Plus, Search, X } from 'lucide-react'

type LocalityOption = { value: string; detail?: string }

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
  { value: 'Purnea', detail: 'Recommended spelling' },
  { value: 'Purnia', detail: 'Alternate spelling' },
  { value: 'Kasba', detail: 'Purnea district' },
  { value: 'Banmankhi', detail: 'Purnea district' },
  { value: 'Dhamdaha', detail: 'Purnea district' },
]

const purneaBounds = {
  minLat: 25.55,
  maxLat: 26.15,
  minLng: 87.0,
  maxLng: 87.75,
}

function clean(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

function isNearPurnea(latitude: number, longitude: number) {
  return (
    latitude >= purneaBounds.minLat &&
    latitude <= purneaBounds.maxLat &&
    longitude >= purneaBounds.minLng &&
    longitude <= purneaBounds.maxLng
  )
}

function useCurrentLocation(onDetected: () => void) {
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
        setBusy(false)
        const { latitude, longitude } = position.coords
        if (isNearPurnea(latitude, longitude)) {
          onDetected()
          setStatus(t('locationDetected'))
        } else {
          setStatus(t('locationOutsidePurnea'))
        }
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
}: {
  label: string
  value: string
  onChange: (value: string) => void
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
  const { status, busy, detect } = useCurrentLocation(() =>
    onChange(currentValue ?? (city ? 'Purnea' : 'Near current location, Purnea')),
  )
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
          onChange={(event) => onChange(event.target.value)}
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
}: {
  label: string
  value: string[]
  onChange: (value: string[]) => void
  error?: string
  hint?: string
  currentLocality?: string
}) {
  const { t } = useTranslation()
  const id = useId()
  const listId = `${id}-options`
  const [query, setQuery] = useState('')
  const { status, busy, detect } = useCurrentLocation(() => add('Near current location, Purnea'))
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
  function add(raw = query) {
    const next = clean(raw)
    if (!next) return
    if (selected.some((item) => item.toLocaleLowerCase() === next.toLocaleLowerCase())) {
      setQuery('')
      return
    }
    onChange([...selected, next])
    setQuery('')
  }
  function remove(item: string) {
    onChange(selected.filter((value) => value !== item))
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
