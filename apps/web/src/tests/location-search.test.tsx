import { afterEach, expect, test, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { CurrentLocationButton } from '../components/location-search'
import { api } from '../lib/api'

vi.mock('../lib/api', () => ({ api: vi.fn() }))
const original = Object.getOwnPropertyDescriptor(navigator, 'geolocation')
afterEach(() => {
  vi.resetAllMocks()
  if (original) Object.defineProperty(navigator, 'geolocation', original)
  else Reflect.deleteProperty(navigator, 'geolocation')
})

function provideCoordinates() {
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: {
      getCurrentPosition: (success: PositionCallback) =>
        success({
          coords: { latitude: 25.78, longitude: 87.47, accuracy: 20 },
          timestamp: 0,
        } as GeolocationPosition),
    },
  })
}

test('failed address lookup reports an error without saving a fabricated location', async () => {
  provideCoordinates()
  vi.mocked(api).mockRejectedValue(new Error('Address service unavailable'))
  const onLocationChange = vi.fn()
  render(<CurrentLocationButton onLocationChange={onLocationChange} />)
  fireEvent.click(screen.getByRole('button', { name: 'Use current location' }))
  await screen.findByText(
    'Your location was found, but its address could not be retrieved. Please try again.',
  )
  expect(onLocationChange).not.toHaveBeenCalled()
  await waitFor(() => expect(screen.getByRole('button')).toBeEnabled())
})

test('successful address lookup returns the resolved location', async () => {
  provideCoordinates()
  const resolved = {
    location: 'Fictional test locality',
    primary: 'Fictional test locality',
    address: 'Fictional test locality',
    locality: 'Fictional test locality',
    city: 'Purnea',
    district: 'Purnea',
    state: 'Bihar',
    country: 'India',
    postalCode: '854301',
    latitude: 25.78,
    longitude: 87.47,
    accuracyMeters: 20,
    source: 'test',
  }
  vi.mocked(api).mockResolvedValue(resolved)
  const onLocationChange = vi.fn()
  render(<CurrentLocationButton onLocationChange={onLocationChange} />)
  fireEvent.click(screen.getByRole('button', { name: 'Use current location' }))
  await waitFor(() => expect(onLocationChange).toHaveBeenCalledOnce())
  expect(onLocationChange).toHaveBeenCalledWith(
    expect.objectContaining({
      address: resolved.address,
      latitude: resolved.latitude,
      longitude: resolved.longitude,
    }),
  )
})

test('permission denial does not call the address service or save a location', async () => {
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: {
      getCurrentPosition: (_success: PositionCallback, error: PositionErrorCallback) =>
        error({ code: 1, PERMISSION_DENIED: 1 } as GeolocationPositionError),
    },
  })
  const onLocationChange = vi.fn()
  render(<CurrentLocationButton onLocationChange={onLocationChange} />)
  fireEvent.click(screen.getByRole('button', { name: 'Use current location' }))
  await screen.findByText(
    'Location permission was blocked. You can still search or type the locality.',
  )
  expect(api).not.toHaveBeenCalled()
  expect(onLocationChange).not.toHaveBeenCalled()
})
