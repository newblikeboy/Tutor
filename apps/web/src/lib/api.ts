import { QueryClient } from '@tanstack/react-query'
import type { components } from './schema'
export type Schema = components['schemas']
export type User = Schema['User']
export type Tutor = Schema['PublicTutor']
export type Application = Schema['Application']
export type Learner = Schema['Learner']
export type Requirement = Schema['Requirement']
export type Trial = Schema['Trial']
export type Dashboard = Schema['Dashboard']
export const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 15_000, retry: 1, refetchOnWindowFocus: false } },
})
let csrf = ''
export function setCSRF(value: string) {
  csrf = value
}
export class APIError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message)
  }
}
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api/v1${path}`, {
    ...options,
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
      ...options.headers,
    },
  })
  if (!response.ok) {
    let data: Partial<Schema['Error']> = {}
    try {
      data = await response.json()
    } catch {
      /* network proxy error */
    }
    throw new APIError(
      response.status,
      data.code ?? 'unavailable',
      data.message ?? 'Request failed',
    )
  }
  return response.json() as Promise<T>
}
export const send = <T>(
  path: string,
  body: unknown,
  method = 'POST',
  headers: Record<string, string> = {},
) => api<T>(path, { method, body: JSON.stringify(body), headers })
export function errorKey(error: unknown): string {
  const code = error instanceof APIError ? error.code : ''
  return (
    (
      {
        schedule_conflict: 'failureConflict',
        scope_unavailable: 'failureScope',
        invalid_credentials: 'authInvalidCredentials',
        signup_unavailable: 'authSignupUnavailable',
        weak_password: 'authWeakPassword',
        rate_limited: 'failureLimit',
        validation: 'failureValidation',
        guardian_required: 'consentHelp',
        unauthenticated: 'authRequired',
        forbidden: 'permission',
        origin: 'actionError',
        csrf: 'actionError',
        invalid_transition: 'actionError',
      } as Record<string, string>
    )[code] ?? 'actionError'
  )
}
export const indiaDate = (value: string, language: string) =>
  new Intl.DateTimeFormat(language === 'hi' ? 'hi-IN' : 'en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Kolkata',
  }).format(new Date(value)) + ' IST'
