import type { Schema, Tutor } from './api'

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
    t(mode === 'home' ? 'applicationForm.home' : 'online'),
  )
  return labels.join(' + ')
}
