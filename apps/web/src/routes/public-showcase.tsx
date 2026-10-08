import { useState } from 'react'

import { useTranslation } from 'react-i18next'
import { BookOpen, Check, CheckCircle2, ChevronRight, Compass, ShieldCheck } from 'lucide-react'

import { Alert, Badge, Button, Empty, Field, Loading, Modal, PageHeading } from '../components/ui'
export function LearningPreview() {
  const { t } = useTranslation()
  return (
    <div className="learning-preview">
      <div className="preview-label">
        <span className="short-line" />
        {t('preview')}
      </div>
      <div className="plan-paper">
        <div className="plan-top">
          <div className="plan-icon">
            <BookOpen size={24} />
          </div>
          <Badge>{t('planSubject')}</Badge>
        </div>
        <h2>{t('plan')}</h2>
        <div className="lesson-focus">
          <span className="eyebrow">01 / {t('currentFocus')}</span>
          <h3>{t('focus')}</h3>
          <p>{t('focusBody')}</p>
          <div className="fraction-art" aria-hidden="true">
            <div className="fraction-square">
              <i />
              <i />
              <i />
              <i />
            </div>
            <span>½</span>
            <span className="equals">=</span>
            <div className="fraction-bar">
              <i />
              <i />
              <i />
              <i />
            </div>
            <span>²⁄₄</span>
          </div>
        </div>
        <div className="topic-steps">
          <span>
            <Check size={14} />
            {t('introduced')}
          </span>
          <span className="active">{t('practising')}</span>
          <span>{t('independent')}</span>
        </div>
        <div className="mentor-note">
          <span className="mentor-icon">
            <Compass size={21} />
          </span>
          <div>
            <strong>{t('nextReview')}</strong>
            <p>{t('nextReviewBody')}</p>
          </div>
        </div>
      </div>
      <div className="scope-note">
        <ShieldCheck size={28} />
        <div>
          <strong>{t('approval')}</strong>
          <p>{t('approvalBody')}</p>
        </div>
      </div>
    </div>
  )
}
export function Showcase() {
  const { t } = useTranslation()
  const [tab, setTab] = useState('controls')
  return (
    <div className="container section">
      <PageHeading title={t('showcaseTitle')} body={t('showcaseBody')} />
      <div className="tabs" role="tablist" aria-label={t('components')}>
        {['controls', 'states'].map((key) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            tabIndex={tab === key ? 0 : -1}
            onClick={() => setTab(key)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                setTab(tab === 'controls' ? 'states' : 'controls')
                ;(
                  e.currentTarget.parentElement?.querySelector(
                    `[aria-selected="false"]`,
                  ) as HTMLElement
                )?.focus()
              }
            }}
          >
            {t(key)}
          </button>
        ))}
      </div>
      <div role="tabpanel" className="panel">
        {tab === 'controls' ? (
          <>
            <div className="button-row">
              <Button>
                {t('save')}
                <ChevronRight size={16} />
              </Button>
              <Button variant="secondary">{t('back')}</Button>
              <Button disabled>{t('unavailable')}</Button>
              <Button busy>{t('saving')}</Button>
            </div>
            <div className="form-grid">
              <Field label={t('name')}>
                <input placeholder={t('name')} />
              </Field>
              <Field label={t('authPassword')} hint={t('authPasswordHint')}>
                <input type="password" autoComplete="new-password" />
              </Field>
              <Field label={t('startTime')}>
                <input type="datetime-local" />
              </Field>
              <Field label={t('subject')}>
                <select>
                  <option>{t('math')}</option>
                </select>
              </Field>
            </div>
            <Modal
              title={t('dialogTitle')}
              description={t('dialogBody')}
              trigger={<Button variant="secondary">{t('dialog')}</Button>}
            >
              <Field label={t('name')}>
                <input />
              </Field>
            </Modal>
            <div className="badge-row">
              <Badge>
                <CheckCircle2 size={14} />
                {t('scoped')}
              </Badge>
              <Badge tone="amber">{t('wait')}</Badge>
              <Badge tone="neutral">{t('draft')}</Badge>
            </div>
          </>
        ) : (
          <>
            <Alert kind="success">{t('actionSuccess')}</Alert>
            <Alert kind="error">{t('actionError')}</Alert>
            <Loading />
            <Empty title={t('empty')} />
          </>
        )}
      </div>
      <div className="showcase-preview">
        <LearningPreview />
      </div>
    </div>
  )
}
