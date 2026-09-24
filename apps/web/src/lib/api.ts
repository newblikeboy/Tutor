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
    public fieldErrors: Record<string, string> = {},
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
      data.fieldErrors,
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
        interview_conflict: 'staffOps.failureOverlap',
        interview_validation: 'staffOps.failureInterview',
        meeting_unconfigured: 'staffOps.zoomUnconfigured',
        meeting_pending: 'staffOps.zoomBusy',
        meeting_unavailable: 'staffOps.zoomFailed',
        video_unconfigured: 'applicationForm.videoUnavailable',
        stale: 'staffOps.failureStale',
        tutor_restricted: 'staffOps.restriction',
        scope_unavailable: 'failureScope',
        invalid_credentials: 'authInvalidCredentials',
        staff_auth_unavailable: 'authStaffUnavailable',
        signup_unavailable: 'authSignupUnavailable',
        weak_password: 'authWeakPassword',
        rate_limited: 'failureLimit',
        validation: 'failureValidation',
        application_validation: 'invalidFields',
        application_file: 'applicationForm.fileError',
        application_photo: 'applicationForm.photoError',
        staff_fees_only: 'tutorFees.staffOnly',
        fees_pending: 'tutorFees.required',
        fee_plans: 'tutorFees.invalid',
        eligibility_pending: 'applicationForm.eligibilityPending',
        requested_scope: 'applicationForm.scopeBoundary',
        guardian_required: 'consentHelp',
        unauthenticated: 'authRequired',
        forbidden: 'permission',
        origin: 'actionError',
        csrf: 'actionError',
        invalid_transition: 'actionError',
        availability: 'tuition.failureAvailability',
        availability_required: 'tuition.noAvailabilityBody',
        stale_version: 'tuition.failureStale',
        capacity: 'tuition.failureCapacity',
        not_finished: 'tuition.failureTiming',
        attendance_dispute: 'tuition.failureDispute',
        hold_expired: 'billing.failureHold',
        payment_pending: 'billing.failurePending',
        signature: 'billing.failureSignature',
        refund_amount: 'billing.failureRefund',
        reconciliation_required: 'billing.reconcileBody',
        file_type: 'files.failureType',
        upload_expired: 'files.failureExpired',
        file_unavailable: 'files.failureUnavailable',
        file_quota: 'files.failureQuota',
        file_quarantined: 'files.failureQuarantine',
        storage_unavailable: 'files.failureStorage',
        storage_unconfigured: 'files.disabled',
        scanner_unconfigured: 'files.scanner',
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
