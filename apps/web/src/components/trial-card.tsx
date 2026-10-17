import { SubjectNames } from './subject-name'
import '../styles/trial-feedback.css'
import { useId, useState } from 'react'
import { Pencil } from 'lucide-react'
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
  headingLevel = 3,
}: {
  trial: Trial
  role: 'parent' | 'tutor' | 'mentor'
  headingLevel?: 2 | 3
}) {
  const { t, i18n } = useTranslation()
  const Heading = headingLevel === 2 ? 'h2' : 'h3'
  const ContentHeading = headingLevel === 2 ? 'h3' : 'h4'
  const config = useConfig()
  const now = useClock()
  const [editing, setEditing] = useState(false)
  const feedbackID = useId()
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
  const feedbackForm = (
    <form
      className="record-form"
      onSubmit={(e) => {
        e.preventDefault()
        mutation.mutate(editing ? 'feedback' : 'complete')
      }}
    >
      {!editing && config.data?.development && <Alert>{t('simulation')}</Alert>}
      <Field label={editing ? 'What the student worked on' : t('lessonNotes')}>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          autoFocus={editing}
          required
          minLength={10}
          maxLength={2000}
        />
      </Field>
      <Field label={editing ? 'Practice & next steps' : t('nextSteps')}>
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
      <div className="button-row">
        <Button type="submit" busy={mutation.isPending}>
          {editing ? 'Save Feedback' : t('completeLesson')}
        </Button>
        {editing && (
          <Button
            type="button"
            variant="secondary"
            disabled={mutation.isPending}
            onClick={() => {
              setNotes(v.notes)
              setNextSteps(v.nextSteps)
              setReview(v.review)
              mutation.reset()
              setEditing(false)
              requestAnimationFrame(() => document.getElementById(`${feedbackID}-edit`)?.focus())
            }}
          >
            Cancel
          </Button>
        )}
      </div>
    </form>
  )
  return (
    <article
      data-role={role}
      className={`record-card ${v.status === 'reviewed' ? 'reviewed-record' : ''}`}
    >
      <div className="record-header">
        <div>
          <Heading>
            {v.learnerName || t(role === 'tutor' ? 'student' : 'learner')} ·{' '}
            <SubjectNames values={v.subjects ?? [v.subject]} />
          </Heading>
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
        {role === 'tutor' && v.status === 'confirmed' && feedbackForm}
        {['parent', 'tutor'].includes(role) && ['completed', 'reviewed'].includes(v.status) && (
          <section className="trial-feedback" aria-labelledby={`${feedbackID}-heading`}>
            <div className="trial-feedback-header">
              <div>
                <ContentHeading id={`${feedbackID}-heading`}>Trial feedback</ContentHeading>
                <p>
                  {role === 'parent'
                    ? "Your tutor's observations and recommended next steps."
                    : 'Your observations and next teaching steps.'}
                </p>
              </div>
              {role === 'tutor' && correctionOpen && (
                <Button
                  id={`${feedbackID}-edit`}
                  variant="secondary"
                  disabled={editing || mutation.isPending}
                  aria-expanded={editing}
                  aria-controls={feedbackID}
                  onClick={() => setEditing(true)}
                >
                  <Pencil size={16} aria-hidden="true" />
                  Edit Feedback
                </Button>
              )}
            </div>
            <div id={feedbackID}>
              {editing ? (
                feedbackForm
              ) : (
                <dl className="trial-feedback-grid">
                  <div className="trial-feedback-summary">
                    <dt>Feedback</dt>
                    <dd>{v.review?.trim() ? v.review : 'No feedback recorded.'}</dd>
                  </div>
                  <div>
                    <dt>What the student worked on</dt>
                    <dd>{v.notes?.trim() ? v.notes : 'No observations recorded.'}</dd>
                  </div>
                  <div>
                    <dt>Practice & next steps</dt>
                    <dd>{v.nextSteps?.trim() ? v.nextSteps : 'No next steps recorded.'}</dd>
                  </div>
                </dl>
              )}
            </div>
          </section>
        )}
        {role === 'mentor' && ['completed', 'reviewed'].includes(v.status) && (
          <>
            <div>
              <ContentHeading>{t('lesson')}</ContentHeading>
              <p>{v.notes}</p>
            </div>
            <div>
              <ContentHeading>{t('practiceNext')}</ContentHeading>
              <p>{v.nextSteps}</p>
            </div>
          </>
        )}
        {role === 'mentor' && ['completed', 'reviewed'].includes(v.status) && (
          <div>
            <ContentHeading>{t('parent.completed')}</ContentHeading>
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
