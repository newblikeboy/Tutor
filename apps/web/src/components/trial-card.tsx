import '../locales/experience'
import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { indiaDate, queryClient, send, type Trial } from '../lib/api'
import { LessonMeeting } from './lesson-meeting'
import { useClock } from '../lib/clock'
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
  const now = useClock()
  const [editing, setEditing] = useState(false)
  const correctionOpen = now <= Date.parse(v.completedAt ?? v.end) + 7 * 86400000
  const [notes, setNotes] = useState(v.notes)
  const [nextSteps, setNextSteps] = useState(v.nextSteps)
  const [review, setReview] = useState(v.review)
  const mutation = useMutation({
    mutationFn: (action: string) =>
      send(`/trials/${v.id}/action`, { action, notes, nextSteps, review, version: v.version ?? 0 }),
    onSuccess: async () => {
      setEditing(false)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
        queryClient.invalidateQueries({ queryKey: ['tutor-workspace'] }),
        queryClient.invalidateQueries({ queryKey: ['learner-progress'] }),
      ])
    },
  })
  return (
    <article
      data-role={role}
      className={`record-card ${v.status === 'reviewed' ? 'reviewed-record' : ''}`}
    >
      <div className="record-header">
        <div>
          <h3>
            {v.learnerName || t('learner')} · {(v.subjects ?? [v.subject]).join(', ')}
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
        <small>
          Class {v.class} · {v.mode === 'home' ? 'Home Tuition' : 'Online'} ·{' '}
          {Math.round((Date.parse(v.end) - Date.parse(v.start)) / 60000)} minutes
        </small>
        {v.status === 'confirmed' && v.mode !== 'home' && role !== 'mentor' && (
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
        {role === 'tutor' && ['completed', 'reviewed'].includes(v.status) && correctionOpen && (
          <Button variant="text" onClick={() => setEditing(!editing)}>
            Correct trial feedback
          </Button>
        )}
        {role === 'tutor' && (v.status === 'confirmed' || editing) && (
          <form
            className="record-form"
            onSubmit={(e) => {
              e.preventDefault()
              mutation.mutate(editing ? 'feedback' : 'complete')
            }}
          >
            {!editing && config.data?.development && <Alert>{t('simulation')}</Alert>}
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
            <Field label="Trial feedback">
              <textarea
                value={review}
                onChange={(event) => setReview(event.target.value)}
                required
                minLength={10}
                maxLength={2000}
              />
            </Field>
            <Button type="submit" busy={mutation.isPending}>
              {editing ? 'Save feedback correction' : t('completeLesson')}
            </Button>
          </form>
        )}
        {['completed', 'reviewed'].includes(v.status) && (
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
        {['completed', 'reviewed'].includes(v.status) && (
          <div>
            <h4>{t('parent.completed')}</h4>
            <p>{v.review}</p>
          </div>
        )}
        {role === 'parent' && ['completed', 'reviewed'].includes(v.status) && (
          <LinkButton to="/tuition" secondary>
            {t('bookTutor')}
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
