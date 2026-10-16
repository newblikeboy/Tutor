import type { Schema, Tutor } from './api'
import { apiPage } from './api'

// Matching/handover selectors filter the complete eligible set locally.
// Read bounded API pages so they never silently lose candidates after page one.
export async function allTutors(path: string, signal: AbortSignal): Promise<Tutor[]> {
  const result: Tutor[] = []
  const url = new URL(path, 'https://local.invalid')
  let cursor = ''
  do {
    if (cursor) url.searchParams.set('cursor', cursor)
    const page = await apiPage<Tutor>(`${url.pathname}${url.search}`, { signal })
    result.push(...page.items)
    cursor = page.nextCursor
  } while (cursor)
  return result
}

export function approvedTutorSubjects(
  scope: Pick<Schema['Scope'], 'subject' | 'subjects'>,
): string[] {
  return scope.subjects?.length ? scope.subjects : [scope.subject]
}

type TutorMode = 'online' | 'home'
type TutorScope = Pick<Schema['Scope'], 'mode'> & { modes?: string[] }

export function approvedTutorModes(scope: TutorScope): TutorMode[] {
  const seen = new Set<string>()
  for (const mode of scope.modes ?? []) {
    if (mode === 'online' || mode === 'home') seen.add(mode)
  }
  if (scope.mode === 'online' || scope.mode === 'home') seen.add(scope.mode)
  return (['online', 'home'] as TutorMode[]).filter((mode) => seen.has(mode))
}

export function tutorHasMode(tutor: Pick<Tutor, 'scope'>, mode: string) {
  return approvedTutorModes(tutor.scope).includes(mode as TutorMode)
}

export function tutorModeLabel(scope: TutorScope, t: (key: string) => string) {
  const labels = approvedTutorModes(scope).map((mode) =>
    t(mode === 'home' ? 'homeTuition' : 'online'),
  )
  return labels.join(' + ')
}

const contextKeys = [
  'learner',
  'class',
  'mode',
  'subject',
  'language',
  'radiusKm',
  'latitude',
  'longitude',
  'locality',
  'time',
]
export function tutorProfileLink(
  id: string,
  context = new URLSearchParams(),
  source: 'match' | 'search' = 'search',
) {
  const next = new URLSearchParams({ source })
  for (const key of contextKeys) for (const value of context.getAll(key)) next.append(key, value)
  if (source === 'match') next.set('tutor', id)
  return `/tutors/${encodeURIComponent(id)}?${next}`
}
export function tutorBookingLink(tutor: Tutor, context: URLSearchParams, mode: string) {
  const next = new URLSearchParams({ tutor: tutor.id, mode, searched: '1' })
  for (const key of contextKeys.filter((key) => key !== 'mode'))
    for (const value of context.getAll(key)) next.append(key, value)
  if (!next.has('subject') && approvedTutorSubjects(tutor.scope).length === 1)
    next.append('subject', approvedTutorSubjects(tutor.scope)[0])
  return `/match?${next}`
}
export function tutorReturnLink(context: URLSearchParams) {
  const next = new URLSearchParams({ searched: '1' })
  for (const key of contextKeys) for (const value of context.getAll(key)) next.append(key, value)
  if (context.get('source') === 'match' && context.has('tutor'))
    next.set('tutor', context.get('tutor')!)
  return `${context.get('source') === 'match' ? '/match' : '/tutors'}?${next}`
}
export function tutorExperience(tutor: Tutor) {
  const months = tutor.experienceMonths
  if (!months) return 'Experience not added'
  const years = Math.floor(months / 12),
    remaining = months % 12
  return [
    years ? `${years} ${years === 1 ? 'year' : 'years'}` : '',
    remaining ? `${remaining} ${remaining === 1 ? 'month' : 'months'}` : '',
  ]
    .filter(Boolean)
    .join(' ')
}
