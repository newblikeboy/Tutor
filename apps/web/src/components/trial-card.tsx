import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { indiaDate, queryClient, send, type Trial } from '../lib/api'
import { useConfig } from '../lib/session'
import { Alert, Badge, Button, Field, LinkButton, MutationError, Status } from './ui'
export function TrialCard({
  trial: v,
  role,
}: {
  trial: Trial
  role: 'parent' | 'tutor' | 'mentor'
}) {
  const { t, i18n } = useTranslation()
  const config = useConfig()
  const [notes, setNotes] = useState('')
  const [nextSteps, setNextSteps] = useState('')
  const [review, setReview] = useState('')
  const mutation = useMutation({
    mutationFn: (action: string) =>
      send(`/trials/${v.id}/action`, { action, notes, nextSteps, review }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
  })
  return (
    <article
      data-role={role}
      className={`record-card ${v.status === 'reviewed' ? 'reviewed-record' : ''}`}
    >
      <div className="record-header">
        <div>
          <h3>
            {v.learnerName || t('learner')} · {t('math')}
          </h3>
          <p>{indiaDate(v.start, i18n.language)}</p>
        </div>
        <>
          {role === 'parent' ? (
            <Badge tone={['confirmed', 'reviewed'].includes(v.status) ? 'teal' : 'neutral'}>
              {t(`parent.trialStatus.${v.status}`)}
            </Badge>
          ) : (
            <Status status={v.status} />
          )}
        </>
      </div>
      <div className="record-content">
        {role !== 'parent' && <small>{t('freeTrialBody')}</small>}
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
        {role === 'tutor' && v.status === 'confirmed' && (
          <form
            className="record-form"
            onSubmit={(e) => {
              e.preventDefault()
              mutation.mutate('complete')
            }}
          >
            {config.data?.development && <Alert>{t('simulation')}</Alert>}
            <Field label={t('lessonNotes')}>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                required
                minLength={10}
                maxLength={2000}
              />
            </Field>
            <Field label={t('nextSteps')}>
              <textarea
                value={nextSteps}
                onChange={(e) => setNextSteps(e.target.value)}
                required
                minLength={10}
                maxLength={1200}
              />
            </Field>
            <Button type="submit" busy={mutation.isPending}>
              {t('completeLesson')}
            </Button>
          </form>
        )}
        {((role === 'mentor' && ['completed', 'reviewed'].includes(v.status)) ||
          (role === 'parent' && v.status === 'reviewed')) && (
          <>
            <div>
              <h4>{t(role === 'parent' ? 'experience.lesson' : 'lesson')}</h4>
              <p>{v.notes}</p>
            </div>
            <div>
              <h4>{t(role === 'parent' ? 'experience.practice' : 'practiceNext')}</h4>
              <p>{v.nextSteps}</p>
            </div>
          </>
        )}
        {role === 'mentor' && v.status === 'completed' && (
          <form
            className="record-form"
            onSubmit={(e) => {
              e.preventDefault()
              mutation.mutate('review')
            }}
          >
            <Field label={t('reviewNotes')}>
              <textarea
                value={review}
                onChange={(e) => setReview(e.target.value)}
                required
                minLength={10}
                maxLength={2000}
              />
            </Field>
            <Button type="submit" busy={mutation.isPending}>
              {t('publishReview')}
            </Button>
          </form>
        )}
        {v.status === 'reviewed' && role !== 'tutor' && (
          <div>
            <h4>{t(role === 'parent' ? 'parent.completed' : 'reviewNotes')}</h4>
            <p>{v.review}</p>
          </div>
        )}
        {role === 'parent' && v.status === 'reviewed' && (
          <LinkButton to="/tuition" secondary>
            {t('parent.classes')}
          </LinkButton>
        )}
        {['requested', 'confirmed'].includes(v.status) && role !== 'mentor' && (
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
