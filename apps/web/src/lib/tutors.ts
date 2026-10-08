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
