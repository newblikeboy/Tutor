import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { MapPin } from 'lucide-react'
import { queryClient, send, type Schema } from '../lib/api'
import {
  CurrentLocationButton,
  locationLabel,
  type StoredLocation,
} from './location-search'
import { Button, MutationError } from './ui'

export function ParentLocationControl({
  account,
  className = '',
}: {
  account: Schema['Account']
  className?: string
}) {
  const { t } = useTranslation()
  const [changing, setChanging] = useState(!account.preferences.location)
  const location = account.preferences.location ?? null
  const save = useMutation({
    mutationFn: (nextLocation: StoredLocation) =>
      send(
        '/account',
        {
          name: account.name,
          language: 'en',
          location: nextLocation,
          version: account.preferences.version,
        },
        'PUT',
      ),
    onSuccess: async () => {
      setChanging(false)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['account'] }),
        queryClient.invalidateQueries({ queryKey: ['tutors'] }),
      ])
    },
  })
  return (
    <section className={`parent-saved-location ${className}`} aria-label={t('account.location')}>
      <div>
        <MapPin size={18} aria-hidden="true" />
        <span>
          <strong>{t('account.location')}</strong>
          <small>{t('account.locationBody')}</small>
        </span>
      </div>
      {location && !changing ? (
        <div className="parent-saved-location-current">
          <span>{locationLabel(location)}</span>
          <Button type="button" variant="secondary" onClick={() => setChanging(true)}>
            {t('account.changeLocation')}
          </Button>
        </div>
      ) : (
        <CurrentLocationButton onLocationChange={(next) => save.mutate(next)}>
          {t(location ? 'account.useCurrentLocationAgain' : 'account.useCurrentLocation')}
        </CurrentLocationButton>
      )}
      <MutationError error={save.error} />
    </section>
  )
}
