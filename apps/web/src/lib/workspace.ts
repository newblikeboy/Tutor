import type { User } from './api'

export type WorkspaceView =
  | 'overview'
  | 'learners'
  | 'sessions'
  | 'progress'
  | 'assessments'
  | 'reviews'
  | 'tutors'
  | 'audit'
  | 'applications'
  | 'interviews'
  | 'followups'
export function workspaceViews(role: User['role']): WorkspaceView[] {
  switch (role) {
    case 'parent':
      return ['overview', 'learners', 'sessions', 'progress']
    case 'tutor':
      return ['overview', 'sessions']
    case 'mentor':
      return ['overview', 'assessments', 'interviews', 'reviews']
    case 'admin':
      return ['overview', 'applications', 'interviews', 'tutors', 'followups', 'audit']
    default:
      return []
  }
}
export function workspaceView(role: User['role'], value: string | null): WorkspaceView {
  return workspaceViews(role).find((view) => view === value) ?? 'overview'
}
// Keep existing deep links valid while grouping related queues in the sidebar.
export function workspaceNavigationView(role: User['role'], view: WorkspaceView): WorkspaceView {
  if (role === 'parent' && view === 'progress') return 'sessions'
  if (view === 'interviews') return role === 'admin' ? 'applications' : 'assessments'
  if (role === 'admin' && view === 'followups') return 'tutors'
  return view
}
export function workspaceNavigationViews(role: User['role']) {
  return workspaceViews(role).filter((view) => workspaceNavigationView(role, view) === view)
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
