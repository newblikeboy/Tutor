import { describe, it, expect } from 'vitest'
import { removeDiscoveryFilter } from '../lib/discovery-filters'

describe('dependent discovery preferences', () => {
  it('removes one subject and retains the student and other preferences', () => {
    const next = removeDiscoveryFilter(
      new URLSearchParams(
        'learner=private-student&class=8&subject=Math&subject=Science&mode=home&time=17%3A00',
      ),
      'subject',
      'Math',
    )
    expect(next.getAll('subject')).toEqual(['Science'])
    expect(next.get('class')).toBe('8')
    expect(next.get('learner')).toBe('private-student')
    expect(next.get('mode')).toBe('home')
    expect(next.get('time')).toBe('17:00')
  })
  it('clears scope subjects with class and clears hidden distance restrictions with mode', () => {
    const original = new URLSearchParams(
      'class=5&subject=All+Subjects&mode=home&latitude=25&longitude=87&locality=Test&radiusKm=10&language=English',
    )
    const scope = removeDiscoveryFilter(original, 'class')
    expect(scope.has('class')).toBe(false)
    expect(scope.has('subject')).toBe(false)
    const mode = removeDiscoveryFilter(original, 'mode')
    for (const key of ['mode', 'latitude', 'longitude', 'locality', 'radiusKm'])
      expect(mode.has(key)).toBe(false)
    expect(mode.get('language')).toBe('English')
    expect(original.get('class')).toBe('5')
    const location = removeDiscoveryFilter(original, 'location')
    expect(location.get('mode')).toBe('home')
    expect(location.has('latitude')).toBe(false)
  })
})
