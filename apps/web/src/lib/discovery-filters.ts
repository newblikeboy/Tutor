export type DiscoveryFilter = 'class' | 'mode' | 'location' | 'time' | 'language' | 'subject'

// Clear dependent search preferences together; never leave a hidden distance
// restriction behind after its location/mode chip has been removed.
export function removeDiscoveryFilter(
  params: URLSearchParams,
  kind: DiscoveryFilter,
  value?: string,
) {
  const next = new URLSearchParams(params)
  const keys: Record<Exclude<DiscoveryFilter, 'subject'>, string[]> = {
    class: ['class', 'subject'],
    mode: ['mode', 'latitude', 'longitude', 'locality', 'radiusKm'],
    location: ['latitude', 'longitude', 'locality', 'radiusKm'],
    time: ['time', 'goal'],
    language: ['language'],
  }
  if (kind === 'subject') {
    const remaining = next.getAll('subject').filter((subject) => subject !== value)
    next.delete('subject')
    remaining.forEach((subject) => next.append('subject', subject))
  } else keys[kind].forEach((key) => next.delete(key))
  next.set('searched', '1')
  return next
}
