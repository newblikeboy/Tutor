import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { FormProvider, useForm, useFormContext, useWatch, type FieldPath } from 'react-hook-form'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Check, ChevronRight, Plus } from 'lucide-react'
import { api, APIError, queryClient, send, type Application, type Schema } from '../lib/api'
import { useAuth, useConfig, useTutorApplication } from '../lib/session'
import {
  applicationSteps,
  applicationDefaults,
  fieldStep,
  newArea,
  weekDays,
  type ApplicationProfile,
} from '../lib/application'
import {
  Alert,
  Button,
  Field,
  LinkButton,
  Loading,
  LoadError,
  MutationError,
  PageHeading,
  Status,
} from '../components/ui'
import { InterviewCard } from '../components/interview'
import { ApplicationScope, ApplicationSummary } from '../components/application-summary'
import { PrivateFiles } from './files'
import '../styles/application.css'
import { useClock } from '../lib/clock'
import { TabBar, TabPanel } from '../components/workspace-tabs'
import { useSearchParams } from 'react-router-dom'

const key = ['application', 'own']
const UploadActivity = createContext<(busy: boolean) => void>(() => {})
const labelKey = (path: string) => path.split('.').at(-1)!
function useCopy() {
  const { t } = useTranslation()
  return (key: string) => t(`applicationForm.${key}`)
}
type Path = FieldPath<ApplicationProfile>
function Input({
  name,
  label,
  type = 'text',
  optional = false,
  min,
  max,
  multiline = false,
}: {
  name: Path
  label?: string
  type?: string
  optional?: boolean
  min?: number
  max?: number
  multiline?: boolean
}) {
  const c = useCopy(),
    { register, getFieldState, formState } = useFormContext<ApplicationProfile>()
  const error = getFieldState(name, formState).error
  const shared = {
    ...register(name, { valueAsNumber: type === 'number' }),
    required: !optional,
    'aria-invalid': !!error,
  }
  return (
    <Field label={c(label ?? labelKey(name))} error={error ? c('required') : undefined}>
      {multiline ? (
        <textarea {...shared} minLength={min} maxLength={max ?? 1200} rows={4} />
      ) : (
        <input
          {...shared}
          type={type}
          min={type === 'number' ? min : undefined}
          max={type === 'number' ? max : undefined}
          minLength={type !== 'number' ? min : undefined}
          maxLength={type !== 'number' ? (max ?? 160) : undefined}
          autoComplete={
            name === 'about.fullName' ? 'name' : name === 'about.mobile' ? 'tel' : 'off'
          }
        />
      )}
    </Field>
  )
}
function Select({
  name,
  options,
  label,
}: {
  name: Path
  options: (string | { value: string; label: string })[]
  label?: string
}) {
  const c = useCopy(),
    { register, getFieldState, formState } = useFormContext<ApplicationProfile>()
  const error = getFieldState(name, formState).error
  return (
    <Field label={c(label ?? labelKey(name))} error={error ? c('required') : undefined}>
      <select {...register(name)} required aria-invalid={!!error}>
        <option value="">{c('select')}</option>
        {options.map((o) =>
          typeof o === 'string' ? (
            <option key={o} value={o}>
              {c(o)}
            </option>
          ) : (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ),
        )}
      </select>
    </Field>
  )
}
function Checks({ name, options }: { name: Path; options: string[] }) {
  const c = useCopy(),
    { register, getFieldState, formState } = useFormContext<ApplicationProfile>()
  const error = getFieldState(name, formState).error
  return (
    <fieldset className="af-checks" aria-invalid={!!error}>
      <legend>{c(labelKey(name))}</legend>
      <div>
        {options.map((value) => (
          <label key={value}>
            <input type="checkbox" value={value} {...register(name)} />
            {['CBSE', 'BSEB', 'ICSE'].includes(value) ? value : c(value)}
          </label>
        ))}
      </div>
      {error && <span className="field-error">{c('required')}</span>}
    </fieldset>
  )
}
function Slots({ name }: { name: 'availability.slots' | 'approach.assessmentSlots' }) {
  const c = useCopy(),
    { setValue, getFieldState, formState } = useFormContext<ApplicationProfile>(),
    slots = useWatch<ApplicationProfile, typeof name>({ name })
  const update = (i: number, field: 'day' | 'start' | 'end', value: string) =>
    setValue(
      name,
      slots.map((s, index) =>
        index === i ? { ...s, [field]: field === 'day' ? Number(value) : value } : s,
      ),
      { shouldDirty: true },
    )
  return (
    <fieldset className="af-slots">
      <legend>{c(labelKey(name))}</legend>
      {slots.map((s, i) => (
        <div className="af-slot" key={i}>
          <Field label={c('day')}>
            <select value={s.day} onChange={(e) => update(i, 'day', e.target.value)}>
              {weekDays.map((d, day) => (
                <option key={d} value={day}>
                  {c(d)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={c('start')}>
            <input
              type="time"
              required
              value={s.start}
              onChange={(e) => update(i, 'start', e.target.value)}
            />
          </Field>
          <Field
            label={c('end')}
            error={
              getFieldState(`${name}.${i}.end`, formState).error ||
              getFieldState(`${name}.${i}.start`, formState).error
                ? c('required')
                : undefined
            }
          >
            <input
              type="time"
              required
              value={s.end}
              onChange={(e) => update(i, 'end', e.target.value)}
            />
          </Field>
          <Button
            type="button"
            variant="text"
            aria-label={`${c('remove')} ${i + 1}`}
            onClick={() =>
              setValue(
                name,
                slots.filter((_, index) => i !== index),
                { shouldDirty: true },
              )
            }
          >
            {c('remove')}
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="secondary"
        disabled={slots.length >= 21}
        onClick={() =>
          setValue(name, [...slots, { day: 1, start: '16:00', end: '18:00' }], {
            shouldDirty: true,
          })
        }
      >
        <Plus size={16} />
        {c('addSlot')}
      </Button>
      {getFieldState(name, formState).error && <p className="field-error">{c('required')}</p>}
    </fieldset>
  )
}
function Attachment({
  name,
  label,
  video = false,
  ensureDraft,
}: {
  name:
    | 'education.resumeFileId'
    | 'education.educationFileIds'
    | 'approach.demoFileId'
    | 'approach.worksheetFileId'
  label: string
  video?: boolean
  ensureDraft: () => Promise<Application>
}) {
  const c = useCopy(),
    config = useConfig(),
    auth = useAuth(),
    { setValue, getValues } = useFormContext<ApplicationProfile>()
  const activity = useContext(UploadActivity)
  const selected = useWatch<ApplicationProfile, typeof name>({ name })
  const multiple = name === 'education.educationFileIds'
  const selectedIds = Array.isArray(selected) ? selected : selected ? [selected] : []
  const [pending, setPending] = useState<{ file: File; key: string; savedId?: string }[]>([])
  const overLimit =
    multiple &&
    selectedIds.length +
      pending.filter((item) => !item.savedId || !selectedIds.includes(item.savedId)).length >
      6
  const input = useRef<HTMLInputElement>(null)
  const enabled = video ? config.data?.videoUploadsEnabled : config.data?.uploadsEnabled
  const files = useQuery({
    queryKey: ['files', 'applications', auth.data!.user.id, 'selection'],
    queryFn: () => api<Schema['FilePage']>(`/applications/${auth.data!.user.id}/files`),
    enabled: selectedIds.length > 0,
  })
  const upload = useMutation({
    onMutate: () => activity(true),
    onSettled: () => activity(false),
    mutationFn: async () => {
      if (
        !pending.length ||
        pending.some(({ file }) => file.size === 0 || file.size > (video ? 25 : 3) * 1024 * 1024)
      )
        throw new APIError(422, 'application_file', 'File limit')
      if (overLimit) throw new Error(c('educationDocumentsHint'))
      await ensureDraft()
      for (const { file, key: uploadKey } of pending) {
        const content = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onerror = reject
          reader.onload = () => resolve(String(reader.result).split(',')[1])
          reader.readAsDataURL(file)
        })
        const saved = await send<Schema['PrivateFile']>(
          `/applications/${auth.data!.user.id}/files`,
          { name: file.name, content },
          'POST',
          { 'Idempotency-Key': uploadKey },
        )
        if (name === 'education.educationFileIds') {
          setPending((items) =>
            items.map((item) => (item.key === uploadKey ? { ...item, savedId: saved.id } : item)),
          )
          setValue(name, [...new Set([...(getValues(name) ?? []), saved.id])], {
            shouldDirty: true,
          })
        } else setValue(name, saved.id, { shouldDirty: true })
        await ensureDraft()
        setPending((items) => items.filter((item) => item.key !== uploadKey))
        await queryClient.invalidateQueries({
          queryKey: ['files', 'applications', auth.data!.user.id],
        })
      }
    },
    onSuccess: () => {
      if (input.current) input.current.value = ''
    },
  })
  return (
    <div className="af-attachment">
      <Field
        label={c(label)}
        hint={[multiple ? c('educationDocumentsHint') : '', c(video ? 'videoHint' : 'docHint')]
          .filter(Boolean)
          .join(' · ')}
      >
        <input
          ref={input}
          type="file"
          multiple={multiple}
          accept={video ? 'video/mp4,.mp4' : 'application/pdf,image/jpeg,image/png'}
          onChange={(e) => {
            setPending(
              Array.from(e.target.files ?? []).map((file) => ({ file, key: crypto.randomUUID() })),
            )
            upload.reset()
          }}
          disabled={!enabled || upload.isPending || (multiple && selectedIds.length >= 6)}
        />
      </Field>
      <Button
        type="button"
        variant="secondary"
        disabled={!enabled || !pending.length || overLimit}
        busy={upload.isPending}
        onClick={() => upload.mutate()}
      >
        {c('upload')}
      </Button>
      {!enabled && !config.isPending && <Alert>{c('uploadUnavailable')}</Alert>}
      {overLimit && <Alert kind="error">{c('educationDocumentsHint')}</Alert>}
      {selectedIds.length > 0 && (
        <ul className="af-attachment-list">
          {selectedIds.map((id) => (
            <li key={id}>
              <p role="status">
                {files.data?.items.find((f) => f.id === id)?.name} · {c('attachmentSaved')}
              </p>
              <Button
                type="button"
                variant="text"
                onClick={() => {
                  if (name === 'education.educationFileIds')
                    setValue(
                      name,
                      selectedIds.filter((value) => value !== id),
                      { shouldDirty: true },
                    )
                  else setValue(name, '', { shouldDirty: true })
                }}
              >
                {c('remove')}
              </Button>
            </li>
          ))}
        </ul>
      )}
      <MutationError error={upload.error} />
    </div>
  )
}
function StepFields({
  step,
  email,
  ensureDraft,
}: {
  step: number
  email: string
  ensureDraft: () => Promise<Application>
}) {
  const c = useCopy(),
    config = useConfig(),
    { register, setValue, getValues, getFieldState, formState, clearErrors } =
      useFormContext<ApplicationProfile>()
  const p = useWatch<ApplicationProfile>() as ApplicationProfile
  const localitiesError = getFieldState('availability.home.localities', formState).error
  const home = p.teachingAreas.some((a) => a.modes.includes('home')),
    online = p.teachingAreas.some((a) => a.modes.includes('online'))
  const options = p.teachingAreas.map((a, i) => ({
    value: a.id,
    label: `${i + 1}. ${a.subject ? c(a.subject) : c('area')} · ${a.minClass}–${a.maxClass}`,
  }))
  if (step === 0)
    return (
      <>
        <div className="form-grid">
          <Input name="about.fullName" min={2} max={80} />
          <Input name="about.displayName" optional max={80} />
          <Field label={c('email')}>
            <input value={email} readOnly type="email" />
          </Field>
          <Input name="about.mobile" type="tel" max={16} />
          <Input name="about.city" min={2} max={80} />
        </div>
        <Checks name="about.communicationLanguages" options={['Hindi', 'English']} />
      </>
    )
  if (step === 1)
    return (
      <>
        <div className="form-grid">
          <Input name="education.qualification" min={2} max={120} />
          <Input name="education.specialisation" min={2} max={120} />
          <Input name="education.institution" min={2} max={160} />
          <Input
            name="education.completionYear"
            type="number"
            min={1900}
            max={new Date().getFullYear()}
          />
          <Select name="education.pursuing" options={['yes', 'no']} />
        </div>
        {p.education.pursuing === 'yes' && (
          <div className="af-inset form-grid">
            <Input name="education.programme" min={2} max={120} />
            <Input name="education.currentInstitution" min={2} max={160} />
            <Input name="education.currentStage" min={2} max={80} />
            <Input name="education.expectedCompletion" type="month" />
          </div>
        )}
        <Input
          name="education.additional"
          label="additionalQualifications"
          optional
          multiline
          max={600}
        />
        <label className="af-check">
          <input type="checkbox" {...register('education.newToTutoring')} />
          {c('newToTutoring')}
        </label>
        {!p.education.newToTutoring && (
          <>
            <div className="form-grid">
              <Input name="education.experienceYears" type="number" min={0} max={60} />
              <Input name="education.experienceMonths" type="number" min={0} max={11} />
            </div>
            <Checks
              name="education.settings"
              options={['home', 'online', 'school', 'coaching', 'volunteering', 'other']}
            />
            <Input name="education.summary" multiline min={10} max={800} />
          </>
        )}
        <div className="form-grid">
          <Select
            name="education.occupation"
            options={[
              'independent_tutor',
              'student',
              'employed_teacher',
              'other_employment',
              'not_employed',
              'other',
            ]}
          />
          <Select
            name="education.outsideWork"
            options={['none', 'permission_required', 'restricted', 'unsure']}
          />
        </div>
        <Attachment name="education.resumeFileId" label="resume" ensureDraft={ensureDraft} />
        <Attachment
          name="education.educationFileIds"
          label="educationFileIds"
          ensureDraft={ensureDraft}
        />
      </>
    )
  if (step === 2)
    return (
      <>
        <p className="af-note">{c('requests')}</p>
        {p.teachingAreas.map((a, i) => (
          <fieldset key={a.id} className="af-area">
            <legend>
              {c('area')} {i + 1}
            </legend>
            <div className="form-grid">
              <Select
                name={`teachingAreas.${i}.subject`}
                options={['Mathematics', 'Science', 'English', 'Hindi', 'Social Science']}
              />
              <div className="form-grid">
                <Input name={`teachingAreas.${i}.minClass`} type="number" min={1} max={12} />
                <Input name={`teachingAreas.${i}.maxClass`} type="number" min={1} max={12} />
              </div>
            </div>
            <Checks name={`teachingAreas.${i}.boards`} options={['CBSE', 'BSEB', 'ICSE']} />
            <Checks name={`teachingAreas.${i}.languages`} options={['Hindi', 'English']} />
            <Checks name={`teachingAreas.${i}.modes`} options={['home', 'online']} />
            <Select name={`teachingAreas.${i}.priorExperience`} options={['yes', 'no']} />
            <Button
              type="button"
              variant="text"
              onClick={() => {
                setValue(
                  'teachingAreas',
                  p.teachingAreas.filter((_, n) => n !== i),
                  { shouldDirty: true },
                )
                setValue(
                  'fees.rates',
                  p.fees.rates.filter((r) => r.areaId !== a.id),
                  { shouldDirty: true },
                )
              }}
            >
              {c('remove')}
            </Button>
          </fieldset>
        ))}
        <Button
          type="button"
          variant="secondary"
          disabled={p.teachingAreas.length >= 8}
          onClick={() =>
            setValue('teachingAreas', [...p.teachingAreas, newArea()], { shouldDirty: true })
          }
        >
          <Plus size={16} />
          {c('addArea')}
        </Button>
        <Select name="firstAreaId" options={options} />
      </>
    )
  if (step === 3)
    return (
      <>
        <Slots name="availability.slots" />
        <div className="form-grid">
          <Input name="availability.earliestStart" type="date" />
          <Input name="availability.weeklyHours" type="number" min={1} max={60} />
          <Input name="availability.maxStudents" type="number" min={1} max={30} />
          <Select name="availability.period" options={['ongoing', 'until', 'unsure']} />
          {p.availability.period === 'until' && <Input name="availability.untilDate" type="date" />}
        </div>
        <fieldset className="af-checks">
          <legend>{c('durations')}</legend>
          <div>
            {[45, 60, 90].map((n) => (
              <label key={n}>
                <input
                  type="checkbox"
                  checked={p.availability.durations.includes(n)}
                  onChange={(e) =>
                    setValue(
                      'availability.durations',
                      e.target.checked
                        ? [...p.availability.durations, n]
                        : p.availability.durations.filter((d) => d !== n),
                      { shouldDirty: true },
                    )
                  }
                />
                {n}
              </label>
            ))}
          </div>
        </fieldset>
        <Input name="availability.interruptions" optional multiline max={600} />
        {home && (
          <fieldset className="af-area">
            <legend>{c('homeTitle')}</legend>
            <div className="form-grid">
              <Input name="about.locality" min={2} max={120} />
              <Input name="about.pin" min={6} max={6} />
            </div>
            <Field
              label={c('localities')}
              error={localitiesError ? c('localitiesError') : undefined}
            >
              <textarea
                required
                rows={3}
                aria-invalid={!!localitiesError}
                value={p.availability.home.localities.join('\n')}
                onChange={(e) => {
                  clearErrors('availability.home.localities')
                  setValue('availability.home.localities', e.target.value.split('\n'), {
                    shouldDirty: true,
                  })
                }}
              />
            </Field>
            <div className="form-grid">
              <Input name="availability.home.travelKm" type="number" min={1} max={100} />
              <Select
                name="availability.home.charges"
                options={['included', 'additional', 'discuss']}
              />
              <Input name="availability.home.bufferMinutes" type="number" min={5} max={180} />
            </div>
          </fieldset>
        )}
        {online && (
          <fieldset className="af-area">
            <legend>{c('onlineTitle')}</legend>
            <div className="form-grid">
              <Select
                name="availability.online.device"
                options={['laptop', 'desktop', 'tablet', 'phone', 'need_help']}
              />
              <Select name="availability.online.camera" options={['ready', 'need_help']} />
              <Select name="availability.online.microphone" options={['ready', 'need_help']} />
              <Select
                name="availability.online.internet"
                options={['reliable', 'sometimes_unstable', 'need_help']}
              />
              <Select name="availability.online.privateSpace" options={['yes', 'need_help']} />
              <Select name="availability.online.screenSharing" options={['yes', 'need_help']} />
              <Select
                name="availability.online.digitalWriting"
                options={['yes', 'no', 'need_help']}
              />
            </div>
          </fieldset>
        )}
      </>
    )
  if (step === 4)
    return (
      <>
        <Input name="approach.introduction" multiline min={40} max={1200} />
        <Input name="approach.scenario" multiline min={20} max={800} />
        <Input name="approach.understanding" multiline min={20} max={800} />
        <Select
          name="approach.demonstration"
          options={config.data?.videoUploadsEnabled ? ['live', 'recorded'] : ['live']}
        />
        {!config.data?.videoUploadsEnabled && <p className="af-note">{c('uploadsOff')}</p>}
        {p.approach.demonstration === 'recorded' && (
          <div className="af-inset">
            <Select name="approach.demoAreaId" options={options} />
            <Input name="approach.demoTopic" min={3} max={160} />
            <Attachment
              name="approach.demoFileId"
              label="introductionVideo"
              video
              ensureDraft={ensureDraft}
            />
          </div>
        )}
        <Attachment name="approach.worksheetFileId" label="worksheet" ensureDraft={ensureDraft} />
        <Slots name="approach.assessmentSlots" />
      </>
    )
  if (step === 5)
    return (
      <>
        <p className="af-note">{c('feePrivate')}</p>
        <Select name="fees.preference" options={['expected', 'guidance']} />
        {p.fees.preference === 'expected' && (
          <fieldset className="af-area">
            <legend>{c('payout')}</legend>
            {p.teachingAreas.flatMap((a) =>
              a.modes.map((mode) => {
                const index = p.fees.rates.findIndex((r) => r.areaId === a.id && r.mode === mode)
                const rate = p.fees.rates[index]
                return (
                  <Field
                    key={`${a.id}:${mode}`}
                    label={`${c(a.subject)} · ${a.minClass}–${a.maxClass} · ${c(mode)}`}
                  >
                    <input
                      type="number"
                      required
                      min={1}
                      max={100000}
                      step="0.01"
                      value={rate ? rate.amountPaise / 100 : ''}
                      onChange={(e) => {
                        const rates = [...getValues('fees.rates')]
                        const next = {
                          areaId: a.id,
                          mode,
                          amountPaise: Math.round(Number(e.target.value) * 100),
                        }
                        if (index >= 0) rates[index] = next
                        else rates.push(next)
                        setValue('fees.rates', rates, { shouldDirty: true })
                      }}
                    />
                  </Field>
                )
              }),
            )}
          </fieldset>
        )}
        <Input name="fees.comments" optional multiline max={500} />
      </>
    )
  return null
}
export default function Apply() {
  const c = useCopy(),
    { t } = useTranslation(),
    auth = useAuth()
  const query = useTutorApplication()
  return (
    <div className="container section af-page">
      <PageHeading title={c('title')} />
      {auth.data?.user.role === 'tutor' &&
        query.data?.application &&
        !['draft', 'improvement_required'].includes(query.data.application.status) && (
          <ol className="af-journey" aria-label={c('journey')}>
            {['applicationStage', 'reviewStage', 'interviewStage', 'approvalStage'].map(
              (label, i) => {
                const status = query.data.application?.status ?? 'draft'
                const current = ['draft', 'improvement_required'].includes(status)
                  ? 0
                  : ['submitted', 'under_review'].includes(status)
                    ? 1
                    : status === 'assessment_scheduled'
                      ? 2
                      : 3
                return (
                  <li key={label} aria-current={i === current ? 'step' : undefined}>
                    <span>{i + 1}</span>
                    {c(label)}
                  </li>
                )
              },
            )}
          </ol>
        )}
      {auth.isPending ? (
        <Loading />
      ) : !auth.data ? (
        <LinkButton to="/login?role=tutor&return=%2Fapply">{t('authRequired')}</LinkButton>
      ) : auth.data.user.role !== 'tutor' ? (
        <Alert>{t('permission')}</Alert>
      ) : query.isPending ? (
        <Loading />
      ) : query.isError ? (
        <LoadError retry={() => void query.refetch()} />
      ) : (
        <ApplicationForm
          key={
            query.data.application &&
            !['draft', 'improvement_required'].includes(query.data.application.status)
              ? query.data.application.updatedAt
              : 'draft'
          }
          initial={query.data.application}
          notice={query.data.noticeVersion}
          email={auth.data.user.email ?? ''}
          name={auth.data.user.name}
        />
      )}
    </div>
  )
}
function ApplicationForm({
  initial,
  notice,
  email,
  name,
}: {
  initial: Application | null
  notice: string
  email: string
  name: string
}) {
  const c = useCopy(),
    { t } = useTranslation()
  const [app, setApp] = useState(initial),
    [step, setStep] = useState(initial?.formStep ?? 0),
    [problemSteps, setProblemSteps] = useState<number[]>([])
  const [params, setParams] = useSearchParams()
  const applicationTab = ['application', 'documents'].includes(params.get('tab') ?? '')
    ? params.get('tab')!
    : 'status'
  const now = useClock()
  const [uploading, setUploading] = useState(false)
  const form = useForm<ApplicationProfile>({
    defaultValues: applicationDefaults(initial, name, notice),
  })
  const title = useRef<HTMLHeadingElement>(null),
    formElement = useRef<HTMLFormElement>(null),
    version = useRef(initial?.formVersion ?? 0)
  const dirty = form.formState.isDirty
  useEffect(() => {
    if (!dirty && !uploading) return
    const guard = (e: BeforeUnloadEvent) => {
      e.preventDefault()
    }
    window.addEventListener('beforeunload', guard)
    return () => window.removeEventListener('beforeunload', guard)
  }, [dirty, uploading])
  useEffect(() => {
    document.title = `${c(applicationSteps[step])} · ${c('title')}`
  }, [step, c])
  const save = useMutation({
    mutationFn: async ({ next, submit = false }: { next: number; submit?: boolean }) => {
      const profile = structuredClone(form.getValues())
      profile.declarations.noticeVersion = notice
      profile.fees.rates = profile.fees.rates.filter((r) =>
        profile.teachingAreas.some((a) => a.id === r.areaId && a.modes.includes(r.mode)),
      )
      return send<Application>(
        '/application',
        { version: version.current, step: next, submit, profile },
        'PUT',
      )
    },
    onSuccess: (saved) => {
      version.current = saved.formVersion
      setApp(saved)
      form.reset(saved.profile!)
      setProblemSteps([])
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      queryClient.setQueryData(key, { application: saved, noticeVersion: notice })
    },
    onError: (error) => {
      if (error instanceof APIError && Object.keys(error.fieldErrors).length) {
        const steps = Object.keys(error.fieldErrors).map(fieldStep)
        setProblemSteps([...new Set(steps)])
        setStep(Math.min(...steps))
        for (const field of Object.keys(error.fieldErrors))
          form.setError(field as Path, { type: 'server', message: c('required') })
        setTimeout(() => title.current?.focus(), 0)
      }
    },
  })
  const navigate = async (next: number, validate = false) => {
    if (uploading || save.isPending) return
    if (validate && !formElement.current?.reportValidity()) return
    if (validate) {
      const p = form.getValues(),
        missing: Path[] = []
      if (step === 0 && !p.about.communicationLanguages.length)
        missing.push('about.communicationLanguages')
      if (step === 1 && !p.education.newToTutoring && !p.education.settings.length)
        missing.push('education.settings')
      if (step === 2) {
        if (!p.teachingAreas.length) missing.push('teachingAreas')
        p.teachingAreas.forEach((a, i) => {
          for (const field of ['boards', 'languages', 'modes'] as const)
            if (!a[field].length) missing.push(`teachingAreas.${i}.${field}`)
          if (a.minClass > a.maxClass) missing.push(`teachingAreas.${i}.maxClass`)
        })
      }
      if (step === 3) {
        if (!p.availability.slots.length) missing.push('availability.slots')
        if (!p.availability.durations.length) missing.push('availability.durations')
        if (p.teachingAreas.some((a) => a.modes.includes('home'))) {
          const localities = p.availability.home.localities
            .map((name) => name.trim())
            .filter(Boolean)
          if (
            !localities.length ||
            localities.length > 12 ||
            localities.some((name) => [...name].length < 2 || [...name].length > 100)
          )
            missing.push('availability.home.localities')
        }
      }
      if (step === 4) {
        if (!p.approach.assessmentSlots.length) missing.push('approach.assessmentSlots')
        if (p.approach.demonstration === 'recorded' && !p.approach.demoFileId)
          missing.push('approach.demoFileId')
      }
      if (missing.length) {
        missing.forEach((name) => form.setError(name, { type: 'required' }))
        setProblemSteps([step])
        title.current?.focus()
        return
      }
    }
    try {
      await save.mutateAsync({ next })
      setStep(next)
      setTimeout(() => {
        title.current?.focus()
        title.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
      }, 0)
    } catch {
      /* mutation renders errors */
    }
  }
  if (app && !['draft', 'improvement_required'].includes(app.status))
    return (
      <div className="af-submitted">
        <TabBar
          id="application-status"
          label={c('title')}
          value={applicationTab}
          options={['status', 'application', 'documents'].map((value) => ({
            value,
            label: t(`experience.${value}`),
          }))}
          onChange={(value) => {
            const next = new URLSearchParams(params)
            next.set('tab', value)
            setParams(next)
          }}
        />
        <TabPanel id="application-status" value="status" active={applicationTab === 'status'}>
          <section className="panel">
            <Status status={app.status} />
            <h2>{c(app.status === 'submitted' ? 'submitted' : 'title')}</h2>
            {app.status === 'submitted' && <p>{c('submittedBody')}</p>}
            {app.reason && <p>{app.reason}</p>}
            {app.status === 'approved' && Date.parse(app.scope.expiresAt) > now && (
              <LinkButton to="/workspace">{t('viewWorkspace')}</LinkButton>
            )}
          </section>
          <InterviewCard application={app} />
          <ApplicationScope application={app} />
        </TabPanel>
        <TabPanel
          id="application-status"
          value="application"
          active={applicationTab === 'application'}
        >
          {app.profile && <ApplicationSummary profile={app.profile} email={email} />}
        </TabPanel>
        <TabPanel id="application-status" value="documents" active={applicationTab === 'documents'}>
          <PrivateFiles target="applications" id={app.id} canUpload={false} />
        </TabPanel>
      </div>
    )
  return (
    <FormProvider {...form}>
      <UploadActivity.Provider value={setUploading}>
        <div className="af-layout">
          <nav className="af-progress" aria-label={c('title')}>
            <p>{t('applicationForm.progress', { step: step + 1 })}</p>
            <div className="af-mobile-section">
              <Field label={t('experience.section')}>
                <select
                  value={step}
                  disabled={save.isPending || uploading}
                  onChange={(event) => void navigate(Number(event.target.value))}
                >
                  {applicationSteps.map((label, index) => (
                    <option key={label} value={index}>
                      {index + 1}. {c(label)}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <ol>
              {applicationSteps.map((s, i) => (
                <li key={s}>
                  <button
                    type="button"
                    aria-current={step === i ? 'step' : undefined}
                    aria-label={`${i + 1}. ${c(s)}`}
                    disabled={save.isPending || uploading}
                    onClick={() => void navigate(i)}
                  >
                    <span className="af-step-number">{i + 1}</span>
                    <span>{c(s)}</span>
                    {problemSteps.includes(i) && (
                      <span className="af-step-error" aria-label={c('check')}>
                        !
                      </span>
                    )}
                    {i === step && <ChevronRight size={16} aria-hidden="true" />}
                  </button>
                </li>
              ))}
            </ol>
            <span className="af-save-state" role="status">
              {!dirty && app ? <Check size={14} /> : null}
              {dirty ? c('unsaved') : app ? c('saved') : ''}
            </span>
          </nav>
          <section className="af-card">
            <header className="af-card-heading">
              <p>{t('applicationForm.progress', { step: step + 1 })}</p>
              <h2 ref={title} tabIndex={-1}>
                {c(applicationSteps[step])}
              </h2>
            </header>
            {app?.reason && <Alert>{app.reason}</Alert>}
            <form
              ref={formElement}
              noValidate
              onSubmit={(e) => {
                e.preventDefault()
                if (uploading || save.isPending) return
                if (step < 6) void navigate(step + 1, true)
                else if (formElement.current?.reportValidity()) {
                  form.clearErrors()
                  save.mutate({ next: 6, submit: true })
                }
              }}
            >
              <fieldset className="af-fields" disabled={save.isPending || uploading}>
                <StepFields
                  step={step}
                  email={email}
                  ensureDraft={() => save.mutateAsync({ next: step })}
                />
                {step === 6 && (
                  <>
                    <ApplicationSummary
                      profile={form.getValues()}
                      email={email}
                      onEdit={(n) => void navigate(n)}
                    />
                    <details className="af-notice" open>
                      <summary>{c('notices')}</summary>
                      <p>{c('noticeConduct')}</p>
                      <p>{c('noticeData')}</p>
                    </details>
                    {(['accuracy', 'conduct', 'dataUse', 'marketing'] as const).map((value) => (
                      <label className="af-check" key={value}>
                        <input
                          type="checkbox"
                          required={value !== 'marketing'}
                          {...form.register(`declarations.${value}`)}
                        />
                        {c(value)}
                      </label>
                    ))}
                  </>
                )}
              </fieldset>
              {problemSteps.length > 0 && (
                <Alert kind="error">
                  {c('check')}{' '}
                  <span>{problemSteps.map((n) => c(applicationSteps[n])).join(' · ')}</span>
                </Alert>
              )}
              <MutationError error={save.error} />
              <footer className="af-footer">
                {step > 0 && (
                  <Button
                    type="button"
                    variant="text"
                    disabled={save.isPending || uploading}
                    onClick={() => void navigate(step - 1)}
                  >
                    {c('back')}
                  </Button>
                )}
                <Button
                  type="button"
                  variant="secondary"
                  busy={save.isPending}
                  disabled={uploading}
                  onClick={() => void navigate(step)}
                >
                  {c('save')}
                </Button>
                <Button type="submit" busy={save.isPending} disabled={uploading}>
                  {c(step === 6 ? 'submit' : 'next')}
                </Button>
              </footer>
            </form>
          </section>
        </div>
      </UploadActivity.Provider>
    </FormProvider>
  )
}
