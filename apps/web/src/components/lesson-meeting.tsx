import { useMutation, useQuery } from '@tanstack/react-query'
import { api, APIError, queryClient, send, type Schema } from '../lib/api'
import { useClock } from '../lib/clock'
import { Alert, Button } from './ui'
import '../styles/lesson-meeting.css'

export function LessonMeeting({
  kind,
  lesson,
  role,
}: {
  kind: 'classes' | 'trials'
  lesson: {
    id: string
    start: string
    end: string
    version?: number
    meeting?: Schema['LessonMeeting']
  }
  role: 'parent' | 'tutor'
}) {
  const now = useClock()
  const path = `/${kind}/${encodeURIComponent(lesson.id)}/meeting`
  const open =
    now >= Date.parse(lesson.start) - 15 * 60000 && now <= Date.parse(lesson.end) + 15 * 60000
  const m = useMutation({
    mutationFn: () => send(path, { version: lesson.version ?? 0 }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['tuition'] }),
        queryClient.invalidateQueries({ queryKey: ['tutor-workspace'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
      ])
    },
  })
  const join = useQuery({
    queryKey: ['lesson-meeting', kind, lesson.id, lesson.meeting?.status, lesson.start],
    queryFn: ({ signal }) => api<Schema['MeetingJoin']>(`${path}/join`, { signal }),
    enabled: open && lesson.meeting?.status === 'ready',
    refetchInterval: 20000,
    staleTime: 0,
    retry: false,
  })
  if (now > Date.parse(lesson.end) + 15 * 60000) return null
  return (
    <div className="lesson-meeting">
      {role === 'tutor' && (
        <p>Sign in to Zoom with your GoCoaching login email to host the lesson.</p>
      )}
      {role === 'tutor' && (!lesson.meeting || lesson.meeting.status === 'failed') && (
        <Button variant="secondary" busy={m.isPending} onClick={() => m.mutate()}>
          {lesson.meeting?.status === 'failed' ? 'Retry Zoom meeting' : 'Prepare Zoom meeting'}
        </Button>
      )}
      {lesson.meeting?.status === 'pending' && <p role="status">Preparing Zoom meeting…</p>}
      {lesson.meeting?.status === 'ready' && !open && (
        <p>Zoom opens 15 minutes before the lesson.</p>
      )}
      {open && join.isFetching && !join.data && <p role="status">Checking meeting access…</p>}
      {open && join.data && !join.isError && (
        <a
          className="btn secondary"
          href={join.data.joinUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          Open Zoom
        </a>
      )}
      {role === 'parent' && !lesson.meeting && <p>Your tutor will prepare the Zoom meeting.</p>}
      {(m.error || join.error) && (
        <Alert kind="error">
          {(m.error ?? join.error) instanceof APIError
            ? (m.error ?? join.error)!.message
            : 'The meeting could not be loaded. Please try again.'}
        </Alert>
      )}
      {join.isError && (
        <Button variant="text" onClick={() => void join.refetch()}>
          Check meeting again
        </Button>
      )}
    </div>
  )
}
