import { useTranslation } from 'react-i18next'
import { applicationSteps, weekDays, type ApplicationProfile } from '../lib/application'
import { Button } from './ui'
import { indiaDate, type Application } from '../lib/api'
import '../styles/application.css'
export function ApplicationSummary({
  profile: p,
  onEdit,
  email,
}: {
  profile: ApplicationProfile
  onEdit?: (step: number) => void
  email?: string
}) {
  const { t } = useTranslation(),
    c = (key: string) => t(`applicationForm.${key}`, { defaultValue: key })
  const value = (key: string, v: unknown): string => {
    if (typeof v === 'boolean') return c(v ? 'yes' : 'no')
    if (key.endsWith('FileId')) return v ? c('attached') : ''
    if (key === 'educationFileIds')
      return Array.isArray(v) && v.length ? `${v.length} · ${c('attached')}` : ''
    if (key === 'firstAreaId' || key === 'demoAreaId' || key === 'areaId') {
      const a = p.teachingAreas.find((a) => a.id === v)
      return a ? `${c(a.subject)} · ${a.minClass}–${a.maxClass}` : ''
    }
    if (key === 'amountPaise') return `₹${Number(v) / 100} / 60 min`
    if (key === 'day') return c(weekDays[Number(v)])
    if (Array.isArray(v)) return v.map((x) => c(String(x))).join(', ')
    return v === '' || v == null ? '' : c(String(v))
  }
  const rows = (o: object) =>
    Object.entries(o)
      .filter(
        ([k, v]) =>
          !['id', 'schemaVersion', 'noticeVersion', 'sessionMinutes', 'timezone'].includes(k) &&
          (typeof v !== 'object' ||
            v === null ||
            (Array.isArray(v) && !v.some((x) => typeof x === 'object'))),
      )
      .map(([k, v]) => {
        const rendered = value(k, v)
        return rendered ? (
          <div key={k}>
            <dt>
              {c(
                k === 'additional'
                  ? 'additionalQualifications'
                  : k === 'resumeFileId'
                    ? 'resume'
                    : k === 'demoFileId'
                      ? 'demo'
                      : k === 'worksheetFileId'
                        ? 'worksheet'
                        : k,
              )}
            </dt>
            <dd>{rendered}</dd>
          </div>
        ) : null
      })
  const groups = [
    <dl className="af-summary-grid">{rows(p.about)}</dl>,
    <dl className="af-summary-grid">{rows(p.education)}</dl>,
    <>
      {p.teachingAreas.map((a, i) => (
        <div className="af-summary-area" key={a.id}>
          <h4>
            {c('area')} {i + 1}
            {a.id === p.firstAreaId ? ` · ${c('firstAreaId')}` : ''}
          </h4>
          <dl className="af-summary-grid">{rows(a)}</dl>
        </div>
      ))}
    </>,
    <>
      <dl className="af-summary-grid">{rows(p.availability)}</dl>
      <h4>{c('slots')}</h4>
      {p.availability.slots.map((s, i) => (
        <p key={i}>
          {c(weekDays[s.day])} · {s.start}–{s.end} IST
        </p>
      ))}
      {p.teachingAreas.some((a) => a.modes.includes('home')) && (
        <>
          <h4>{c('homeTitle')}</h4>
          <dl className="af-summary-grid">{rows(p.availability.home)}</dl>
        </>
      )}
      {p.teachingAreas.some((a) => a.modes.includes('online')) && (
        <>
          <h4>{c('onlineTitle')}</h4>
          <dl className="af-summary-grid">{rows(p.availability.online)}</dl>
        </>
      )}
    </>,
    <>
      <dl className="af-summary-grid">
        {rows(
          onEdit
            ? {
                introduction: p.approach.introduction,
                scenario: p.approach.scenario,
                understanding: p.approach.understanding,
              }
            : p.approach,
        )}
      </dl>
      <h4>{c('assessmentSlots')}</h4>
      {p.approach.assessmentSlots.map((s, i) => (
        <p key={i}>
          {c(weekDays[s.day])} · {s.start}–{s.end} IST
        </p>
      ))}
    </>,
  ]
  return (
    <div className="af-summary">
      {groups.map((content, i) => (
        <section key={i}>
          <div className="af-summary-heading">
            <h3>{c(i === 2 ? 'requestedAreas' : applicationSteps[i])}</h3>
            {onEdit && (
              <Button
                type="button"
                variant="text"
                onClick={() => onEdit(i)}
                aria-label={`${c('edit')} ${c(applicationSteps[i])}`}
              >
                {c('edit')}
              </Button>
            )}
          </div>
          {content}
          {i === 0 && email && (
            <dl className="af-summary-grid">
              <div>
                <dt>{c('email')}</dt>
                <dd>{email}</dd>
              </div>
            </dl>
          )}
        </section>
      ))}
      {!onEdit && (
        <section>
          <h3>{c('review')}</h3>
          <dl className="af-summary-grid">{rows(p.declarations)}</dl>
        </section>
      )}
    </div>
  )
}
export function ApplicationScope({ application }: { application: Application }) {
  const { t, i18n } = useTranslation(),
    s = application.scope
  if (!s.subject || !['approved', 'suspended', 'terminated'].includes(application.status))
    return null
  return (
    <section className="panel af-approved-scope">
      <h3>{t('applicationForm.approvedScope')}</h3>
      <p>
        {t(`applicationForm.${s.subject}`)} · {t('classes')} {s.minClass}–{s.maxClass} ·{' '}
        {t(`applicationForm.${s.mode}`)}
      </p>
      <p>
        {t('staffOps.reviewDate')}: {indiaDate(s.expiresAt, i18n.language)}
      </p>
    </section>
  )
}
