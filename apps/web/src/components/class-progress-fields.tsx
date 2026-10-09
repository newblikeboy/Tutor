import '../locales/progress'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Schema } from '../lib/api'
import { teachingSubjects } from '../lib/subjects'
import { Button, Field } from './ui'

export function classProgressFromForm(data: FormData): Schema['ClassProgressInput'] | undefined {
  if (!data.has('includeProgress')) return undefined
  const titles = data.getAll('topicTitle').map(String)
  const statuses = data.getAll('topicStatus').map(String)
  const evidence = data.getAll('topicEvidence').map(String)
  const practice = data.getAll('topicPractice').map(String)
  return {
    subject: String(data.get('progressSubject')),
    topics: titles.map((title, index) => ({
      title: title.trim(),
      status: statuses[index] as Schema['LearningTopic']['status'],
      evidence: evidence[index].trim(),
      practice: practice[index].trim(),
    })),
    homeworkStatus: String(
      data.get('homeworkStatus'),
    ) as Schema['ClassProgressInput']['homeworkStatus'],
    feedback: String(data.get('progressFeedback')).trim(),
    nextSteps: String(data.get('progressNextSteps')).trim(),
    ...(data.has('includeTest')
      ? {
          test: {
            title: String(data.get('testTitle')).trim(),
            score: Number(data.get('testScore')),
            maximum: Number(data.get('testMaximum')),
          },
        }
      : {}),
  }
}

export function ClassProgressFields({
  enrollment,
  previous,
  required = false,
}: {
  enrollment: Schema['Enrollment']
  previous?: Schema['ClassProgress']
  required?: boolean
}) {
  const { t } = useTranslation()
  const [enabled, setEnabled] = useState(required || !!previous)
  const [testEnabled, setTestEnabled] = useState(!!previous?.test)
  const [topics, setTopics] = useState(() =>
    (previous?.topics ?? [{ title: '', status: 'introduced', evidence: '', practice: '' }]).map(
      (topic) => ({ ...topic, key: crypto.randomUUID() }),
    ),
  )
  const subjects =
    enrollment.class <= 5
      ? ['All Subjects', ...teachingSubjects]
      : (enrollment.agreement.subjects ?? [enrollment.agreement.subject])
  return (
    <fieldset className="class-progress-fields">
      <legend>{t('childProgress.recordProgress')}</legend>
      {required ? (
        <input type="hidden" name="includeProgress" value="true" />
      ) : (
        <label className="tu-check">
          <input
            type="checkbox"
            name="includeProgress"
            checked={enabled}
            onChange={(event) => setEnabled(event.target.checked)}
          />
          {t('childProgress.addProgress')}
        </label>
      )}
      {enabled && (
        <div className="tu-stack">
          <p>{t('childProgress.progressHelp')}</p>
          <Field label={t('childProgress.subject')}>
            <select
              name="progressSubject"
              defaultValue={previous?.subject ?? (subjects.length === 1 ? subjects[0] : '')}
              required
            >
              <option value="">{t('childProgress.chooseSubject')}</option>
              {subjects.map((subject) => (
                <option key={subject}>{subject}</option>
              ))}
            </select>
          </Field>
          {topics.map((topic) => (
            <fieldset key={topic.key} className="tu-topic-form">
              <legend>{t('childProgress.topicTitle')}</legend>
              <Field label={t('childProgress.topicTitle')}>
                <input
                  name="topicTitle"
                  defaultValue={topic.title}
                  required
                  minLength={2}
                  maxLength={160}
                />
              </Field>
              <Field label={t('childProgress.topicStatus')}>
                <select name="topicStatus" defaultValue={topic.status}>
                  {['introduced', 'practising', 'independent', 'needs_review'].map((status) => (
                    <option key={status} value={status}>
                      {t(`childProgress.${status}`)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t('childProgress.evidence')}>
                <textarea
                  name="topicEvidence"
                  defaultValue={topic.evidence}
                  required
                  minLength={5}
                  maxLength={1200}
                />
              </Field>
              <Field label={t('childProgress.practice')}>
                <textarea
                  name="topicPractice"
                  defaultValue={topic.practice}
                  required
                  minLength={5}
                  maxLength={1200}
                />
              </Field>
              {topics.length > 1 && (
                <Button
                  type="button"
                  variant="text"
                  onClick={() => setTopics(topics.filter((item) => item.key !== topic.key))}
                >
                  {t('childProgress.removeTopic')}
                </Button>
              )}
            </fieldset>
          ))}
          {topics.length < 10 && (
            <Button
              type="button"
              variant="secondary"
              onClick={() =>
                setTopics([
                  ...topics,
                  {
                    key: crypto.randomUUID(),
                    title: '',
                    status: 'introduced',
                    evidence: '',
                    practice: '',
                  },
                ])
              }
            >
              {t('childProgress.addTopic')}
            </Button>
          )}
          <Field label={t('childProgress.status')}>
            <select name="homeworkStatus" defaultValue={previous?.homeworkStatus ?? 'not_checked'}>
              {['not_checked', 'assigned', 'completed', 'needs_help'].map((status) => (
                <option key={status} value={status}>
                  {t(`childProgress.${status === 'completed' ? 'homeworkComplete' : status}`)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('childProgress.feedbackLabel')}>
            <textarea
              name="progressFeedback"
              defaultValue={previous?.feedback}
              required
              minLength={5}
              maxLength={2000}
            />
          </Field>
          <Field label={t('childProgress.nextSteps')}>
            <textarea
              name="progressNextSteps"
              defaultValue={previous?.nextSteps}
              required
              minLength={5}
              maxLength={1200}
            />
          </Field>
          <label className="tu-check">
            <input
              type="checkbox"
              name="includeTest"
              checked={testEnabled}
              onChange={(event) => setTestEnabled(event.target.checked)}
            />
            {t('childProgress.testIncluded')}
          </label>
          {testEnabled && (
            <>
              <Field label={t('childProgress.testTitle')}>
                <input
                  name="testTitle"
                  defaultValue={previous?.test?.title}
                  required
                  minLength={2}
                  maxLength={160}
                />
              </Field>
              <Field label={t('childProgress.testScore')}>
                <input
                  type="number"
                  name="testScore"
                  defaultValue={previous?.test?.score}
                  required
                  min={0}
                  max={10000}
                  step={1}
                />
              </Field>
              <Field label={t('childProgress.testMaximum')}>
                <input
                  type="number"
                  name="testMaximum"
                  defaultValue={previous?.test?.maximum}
                  required
                  min={1}
                  max={10000}
                  step={1}
                />
              </Field>
            </>
          )}
        </div>
      )}
    </fieldset>
  )
}
