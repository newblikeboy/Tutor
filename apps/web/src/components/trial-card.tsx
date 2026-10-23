import { SubjectNames } from './subject-name'
import { useSearchParams } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { indiaDate, queryClient, send, type Trial } from '../lib/api'
import { LessonMeeting } from './lesson-meeting'
import { Badge, Button, LinkButton, MutationError } from './ui'
export function TrialCard({
  trial: v,
  role,
  headingLevel = 3,
}: {
  trial: Trial
  role: 'parent' | 'tutor'
  headingLevel?: 2 | 3
}) {
  const { t, i18n } = useTranslation()
  const [params] = useSearchParams()
  const Heading = headingLevel === 2 ? 'h2' : 'h3'
  const mutation = useMutation({
    mutationFn: (action: 'accept' | 'decline' | 'cancel') =>
      send(`/trials/${v.id}/action`, { action }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
        queryClient.invalidateQueries({ queryKey: ['tutor-workspace'] }),
      ])
    },
  })
  return (
    <article data-role={role} className="record-card">
      <div className="record-header">
        <div>
          <Heading>
            {v.learnerName || t(role === 'tutor' ? 'student' : 'learner')} ·{' '}
            <SubjectNames values={v.subjects ?? [v.subject]} />
          </Heading>
          <p>{indiaDate(v.start, i18n.language)}</p>
        </div>
        <Badge
          tone={['confirmed', 'completed', 'reviewed'].includes(v.status) ? 'teal' : 'neutral'}
        >
          {t(`parent.trialStatus.${v.status}`)}
        </Badge>
      </div>
      <div className="record-content">
        {v.status === 'confirmed' && (
          <p>This trial completes automatically after its scheduled end time.</p>
        )}
        <small>
          Class {v.class} · {v.mode === 'home' ? 'Home Tuition' : 'Online'} ·{' '}
          {Math.round((Date.parse(v.end) - Date.parse(v.start)) / 60000)} minutes
        </small>
        {v.status === 'confirmed' && v.mode !== 'home' && (
          <LessonMeeting kind="trials" lesson={v} role={role} />
        )}
        {role === 'tutor' && v.status === 'requested' && (
          <div className="button-row">
            <Button busy={mutation.isPending} onClick={() => mutation.mutate('accept')}>
              {t('acceptTrial')}
            </Button>
            <Button
              variant="text"
              disabled={mutation.isPending}
              onClick={() => mutation.mutate('decline')}
            >
              {t('decline')}
            </Button>
          </div>
        )}
        {role === 'parent' && ['completed', 'reviewed'].includes(v.status) && (
          <LinkButton
            to={`/tuition?trial=${encodeURIComponent(v.id)}&trialTab=${encodeURIComponent(params.get('tab') ?? 'completed')}`}
            secondary
          >
            {t('bookTutor')}
          </LinkButton>
        )}
        {['requested', 'confirmed'].includes(v.status) && (
          <Button
            variant="text"
            busy={mutation.isPending}
            onClick={() => mutation.mutate('cancel')}
          >
            {t('cancelTrial')}
          </Button>
        )}
        <MutationError error={mutation.error} />
      </div>
    </article>
  )
}
