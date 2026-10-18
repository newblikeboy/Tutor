import { useState } from 'react'

import { useTranslation } from 'react-i18next'
import { BookOpen, Check, CheckCircle2, ChevronRight, Compass, ShieldCheck } from 'lucide-react'

import { Alert, Badge, Button, Empty, Field, Loading, Modal, PageHeading } from '../components/ui'
import { TabBar, TabPanel } from '../components/workspace-tabs'
import { WorkspaceRecordTable } from '../components/workspace-record-table'
import '../styles/component-library.css'
function LearningPreview() {
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
    <div className="container section component-library">
      <PageHeading title={t('showcaseTitle')} body={t('showcaseBody')} />
      <TabBar
        id="component-examples"
        label={t('components')}
        value={tab}
        scrollable
        options={[
          { value: 'controls', label: t('controls') },
          { value: 'states', label: t('states') },
          { value: 'tables', label: 'Tables' },
        ]}
        onChange={setTab}
      />
      <TabPanel id="component-examples" value="controls" active={tab === 'controls'} preserve>
        <div className="panel component-examples">
          <h2>Controls and form fields</h2>
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
          <p id="example-input-instructions" className="hint">
            These fields demonstrate how instructions and validation are presented together.
          </p>
          <div className="form-grid">
            <Field
              label="Example name with an error"
              hint="Enter a full name."
              error="Add a name to continue."
            >
              <input aria-describedby="example-input-instructions" />
            </Field>
            <Field label="Example selection with an error" error="Choose an option to continue.">
              <select defaultValue="">
                <option value="">Choose an option</option>
                <option value="example">Illustrative option</option>
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
        </div>
      </TabPanel>
      <TabPanel id="component-examples" value="states" active={tab === 'states'}>
        <div className="panel component-examples">
          <h2>Feedback examples</h2>
          <p>Illustrative states only. No account action has been performed.</p>
          <Alert kind="success">{t('actionSuccess')}</Alert>
          <Alert kind="error">{t('actionError')}</Alert>
          <Loading />
          <Empty title={t('empty')} />
        </div>
      </TabPanel>
      <TabPanel id="component-examples" value="tables" active={tab === 'tables'} preserve>
        <WorkspaceRecordTable
          label="Example class records"
          countLabel="2 fictional records"
          intro="Illustrative rows showing the same table used in workspaces."
          columns={['Student', 'Subject', 'Class date', 'Status']}
        >
          <tr>
            <th scope="row">Example student A</th>
            <td>Mathematics</td>
            <td>17 October 2026</td>
            <td>
              <Badge tone="neutral">Scheduled example</Badge>
            </td>
          </tr>
          <tr>
            <th scope="row">Example student B with a longer display name</th>
            <td>Science</td>
            <td>18 October 2026</td>
            <td>
              <Badge tone="neutral">Scheduled example</Badge>
            </td>
          </tr>
        </WorkspaceRecordTable>
      </TabPanel>
      <div className="showcase-preview">
        <LearningPreview />
      </div>
    </div>
  )
}
