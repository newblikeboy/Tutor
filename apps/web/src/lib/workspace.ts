import type { User } from './api'

export type WorkspaceView =
  'overview' | 'learners' | 'sessions' | 'progress' | 'assessments' | 'reviews' | 'tutors' | 'audit'
export function workspaceViews(role: User['role']): WorkspaceView[] {
  switch (role) {
    case 'parent':
      return ['overview', 'learners', 'sessions', 'progress']
    case 'tutor':
      return ['overview', 'sessions']
    case 'mentor':
      return ['overview', 'assessments', 'reviews']
    case 'admin':
      return ['overview', 'tutors', 'audit']
    default:
      return ['overview']
  }
}
export function workspaceView(role: User['role'], value: string | null): WorkspaceView {
  return workspaceViews(role).find((view) => view === value) ?? 'overview'
}
export function workspaceLink(view: WorkspaceView, learner?: string | null) {
  const params = new URLSearchParams()
  if (view !== 'overview') params.set('view', view)
  if (learner) params.set('learner', learner)
  return `/workspace${params.size ? `?${params}` : ''}`
}
export function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => Array.from(part)[0])
    .join('')
    .toLocaleUpperCase()
}
