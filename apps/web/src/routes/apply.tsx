import '../locales/application'
import '../locales/experience'
import '../locales/files'
import { prepareProfilePhoto, uploadFile, type UploadProgress } from '../lib/uploads'
import { LocalFilePreview, UploadFeedback } from '../components/upload-feedback'
import { teachingSubjects } from '../lib/subjects'
import { SubjectSelect } from '../components/subject-select'
import { createContext, useContext, useEffect, useRef, useState } from 'react'
import {
  FormProvider,
  useController,
  useForm,
  useFormContext,
  useWatch,
  type FieldPath,
} from 'react-hook-form'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Check, FileText, Plus } from 'lucide-react'
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
import { TutorFees } from '../components/tutor-fees'
import { ApplicationScope, ApplicationSummary } from '../components/application-summary'
import { CurrentLocationButton, type StoredLocation } from '../components/location-search'
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
  return (key: string, options?: Record<string, string | number>) =>
    t(`applicationForm.${key}`, options)
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
  hint,
}: {
  name: Path
  label?: string
  type?: string
  optional?: boolean
  min?: number
  max?: number
  multiline?: boolean
  hint?: string
}) {
  const c = useCopy(),
    { getFieldState, formState } = useFormContext<ApplicationProfile>()
  const { field } = useController<ApplicationProfile>({ name })
  const error = getFieldState(name, formState).error
  const shared = {
    ...field,
    value: type === 'number' && min && min > 0 && !field.value ? '' : String(field.value ?? ''),
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      field.onChange(type === 'number' ? Number(event.target.value) : event.target.value),
    required: !optional,
    'aria-invalid': !!error,
  }
  return (
    <Field
      label={c(label ?? labelKey(name))}
      hint={
        hint ? c(hint) : multiline && min ? c('answerHint', { min, max: max ?? 1200 }) : undefined
      }
      error={error ? c('required') : undefined}
    >
      {multiline ? (
        <textarea {...shared} minLength={min} maxLength={max ?? 1200} rows={optional ? 2 : 3} />
      ) : (
        <input
          {...shared}
          type={type}
          min={type === 'number' ? min : undefined}
          max={type === 'number' ? max : undefined}
          minLength={type !== 'number' ? min : undefined}
          maxLength={type !== 'number' ? (max ?? 160) : undefined}
          inputMode={type === 'number' || name === 'about.pin' ? 'numeric' : undefined}
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
  ensureDraft,
}: {
  name: 'about.photoFileId' | 'education.resumeFileId' | 'education.educationFileIds'
  label: string
  ensureDraft: (force?: boolean) => Promise<Application>
}) {
  const c = useCopy(),
    config = useConfig(),
    auth = useAuth(),
    { setValue, getValues } = useFormContext<ApplicationProfile>()
  const activity = useContext(UploadActivity)
  const { t } = useTranslation()
  const selected = useWatch<ApplicationProfile, typeof name>({ name })
  const multiple = name === 'education.educationFileIds'
  const photo = name === 'about.photoFileId'
  const acceptedTypes = photo
    ? ['image/jpeg', 'image/png']
    : ['image/jpeg', 'image/png', 'application/pdf']
  const selectedIds = Array.isArray(selected) ? selected : selected ? [selected] : []
  const [pending, setPending] = useState<
    { file: File; key: string; savedId?: string; prepared?: File }[]
  >([])
  const [progress, setProgress] = useState<UploadProgress | null>(null)
  const overLimit =
    multiple &&
    selectedIds.length +
      pending.filter((item) => !item.savedId || !selectedIds.includes(item.savedId)).length >
      6
  const input = useRef<HTMLInputElement>(null)
  const enabled = config.data?.uploadsEnabled
  const files = useQuery({
    queryKey: ['files', 'applications', auth.data!.user.id, 'selection'],
    queryFn: () => api<Schema['FilePage']>(`/applications/${auth.data!.user.id}/files`),
    enabled: selectedIds.length > 0,
  })
  const remove = useMutation({
    onMutate: () => activity(true),
    onSettled: () => activity(false),
    mutationFn: async (id: string) => {
      if (name === 'education.educationFileIds') {
        setValue(
          name,
          selectedIds.filter((value) => value !== id),
          { shouldDirty: true },
        )
      } else setValue(name, '', { shouldDirty: true })
      await ensureDraft(true)
      await send(`/files/${id}`, {}, 'DELETE')
      await queryClient.invalidateQueries({
        queryKey: ['files', 'applications', auth.data!.user.id],
      })
    },
  })
  const upload = useMutation({
    onMutate: () => {
      activity(true)
      setProgress({ stage: 'preparing' })
    },
    onSettled: () => activity(false),
    mutationFn: async () => {
      if (
        !pending.length ||
        pending.some(
          ({ file }) =>
            !acceptedTypes.includes(file.type) || file.size === 0 || file.size > 3 * 1024 * 1024,
        )
      )
        throw new APIError(422, photo ? 'application_photo' : 'file_type', 'Invalid file')
      if (overLimit) throw new Error(c('educationDocumentsHint'))
      await ensureDraft()
      for (const item of pending) {
        const { file, key: uploadKey } = item
        let prepared = file
        if (photo) {
          setProgress({ stage: 'preparing' })
          prepared = item.prepared ?? (await prepareProfilePhoto(file))
          // Reuse identical bytes and the same idempotency key after a failed response.
          setPending((items) =>
            items.map((entry) => (entry.key === uploadKey ? { ...entry, prepared } : entry)),
          )
        }
        const saved = await uploadFile(
          `/applications/${auth.data!.user.id}/files`,
          prepared,
          uploadKey,
          config.data?.mediaProvider === 'cloudinary',
          setProgress,
        )
        queryClient.setQueryData<Schema['FilePage']>(
          ['files', 'applications', auth.data!.user.id, 'selection'],
          (current) =>
            current && {
              ...current,
              items: [saved, ...current.items.filter((entry) => entry.id !== saved.id)],
            },
        )
        if (name === 'education.educationFileIds') {
          setPending((items) =>
            items.map((item) => (item.key === uploadKey ? { ...item, savedId: saved.id } : item)),
          )
          setValue(name, [...new Set([...(getValues(name) ?? []), saved.id])], {
            shouldDirty: true,
          })
        } else setValue(name, saved.id, { shouldDirty: true })
        setProgress({ stage: 'saving' })
        await ensureDraft(true)
        setPending((items) => items.filter((item) => item.key !== uploadKey))
      }
      void queryClient.invalidateQueries({
        queryKey: ['files', 'applications', auth.data!.user.id],
        refetchType: 'none',
      })
    },
    onSuccess: () => {
      if (input.current) input.current.value = ''
    },
  })
  return (
    <div className="af-attachment">
      <Field
        label={c(label)}
        hint={[multiple ? c('educationDocumentsHint') : '', c(photo ? 'photoHint' : 'docHint')]
          .filter(Boolean)
          .join(' · ')}
      >
        <input
          ref={input}
          type="file"
          multiple={multiple}
          accept={acceptedTypes.join(',')}
          onChange={(e) => {
            setPending(
              Array.from(e.target.files ?? []).map((file) => ({ file, key: crypto.randomUUID() })),
            )
            upload.reset()
          }}
          disabled={!enabled || upload.isPending || (multiple && selectedIds.length >= 6)}
        />
      </Field>
      {pending
        .filter(
          ({ file }) =>
            acceptedTypes.includes(file.type) && file.size > 0 && file.size <= 3 * 1024 * 1024,
        )
        .map(({ file, key }) => (
          <LocalFilePreview key={key} file={file} />
        ))}
      {upload.isPending && <UploadFeedback progress={progress} />}
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
        <ul className={`af-attachment-list ${photo ? 'photo' : 'documents'}`}>
          {selectedIds.map((id) => {
            const file = files.data?.items.find((item) => item.id === id)
            const ready = file && (file.status === 'ready' || file.status === 'clean')
            return (
              <li key={id}>
                {photo ? (
                  <div className="af-photo-preview">
                    <img
                      src={`/api/v1/files/${id}/view?preview=1`}
                      alt={c('photoPreviewAlt')}
                      decoding="async"
                    />
                  </div>
                ) : null}
                {!photo &&
                  ready &&
                  (file.contentType.startsWith('image/') ? (
                    <img
                      className="af-document-preview"
                      src={`/api/v1/files/${id}/view?preview=1`}
                      alt={file.name}
                      decoding="async"
                      loading="lazy"
                    />
                  ) : file.contentType === 'application/pdf' ? (
                    <div className="upload-document-preview">
                      <FileText size={32} aria-hidden="true" />
                      <span>{t('files.pdfDocument')}</span>
                    </div>
                  ) : null)}
                <p role="status">
                  <strong>{file?.name ?? c('attachmentLoading')}</strong>
                  <span>{c('attachmentSaved')}</span>
                </p>
                <div className="af-attachment-actions">
                  {ready && (
                    <a
                      className="btn secondary"
                      href={`/api/v1/files/${id}/view`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {t('files.view')}
                    </a>
                  )}
                  <Button
                    type="button"
                    variant="text"
                    busy={remove.isPending}
                    disabled={remove.isPending || upload.isPending}
                    onClick={() => remove.mutate(id)}
                  >
                    {c('remove')}
                  </Button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
      <MutationError error={upload.error} />
      <MutationError error={remove.error} />
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
  ensureDraft: (force?: boolean) => Promise<Application>
}) {
  const c = useCopy(),
    { register, setValue, getFieldState, formState, clearErrors } =
      useFormContext<ApplicationProfile>()
  const p = useWatch<ApplicationProfile>() as ApplicationProfile
  const [changingLocation, setChangingLocation] = useState(false)
  const specialisations = [
    ...new Set(
      p.education.specialisation
        .split(',')
        .map((subject) => subject.trim())
        .filter(Boolean),
    ),
  ]
  const locationError =
    getFieldState('about.location', formState).error ||
    getFieldState('about.city', formState).error ||
    getFieldState('about.locality', formState).error
  const home = p.teachingAreas.some((a) => a.modes.includes('home')),
    online = p.teachingAreas.some((a) => a.modes.includes('online'))
  const saveDetectedLocation = (location: StoredLocation) => {
    clearErrors(['about.location', 'about.city', 'about.locality', 'about.pin'])
    setValue('about.location', location, { shouldDirty: true })
    setValue('about.city', location.city, { shouldDirty: true })
    setValue('about.locality', location.locality || location.address, { shouldDirty: true })
    setValue('about.pin', location.postalCode, { shouldDirty: true })
    setChangingLocation(false)
  }
  if (step === 0)
    return (
      <>
        <div className="form-grid">
          <Input name="about.fullName" min={2} max={80} />
          <Input name="about.displayName" optional max={80} />
          <Field label={c('email')} hint={c('emailHint')}>
            <input value={email} readOnly type="email" />
          </Field>
          <Input name="about.mobile" type="tel" max={16} />
          <Input name="about.whatsapp" type="tel" optional min={10} max={16} hint="whatsappHint" />
        </div>
        <fieldset className="af-home-location">
          <legend>{c('homeLocation')}</legend>
          <p className="hint">{c('homeLocationHint')}</p>
          {p.about.location && !changingLocation ? (
            <Button type="button" variant="secondary" onClick={() => setChangingLocation(true)}>
              {c('changeLocation')}
            </Button>
          ) : (
            <CurrentLocationButton onLocationChange={saveDetectedLocation}>
              {c(p.about.location ? 'useCurrentLocationAgain' : 'useCurrentLocation')}
            </CurrentLocationButton>
          )}
          {locationError && (
            <p className="field-error" role="alert">
              {c('locationRequired')}
            </p>
          )}
          <div className="location-detail-grid">
            <div className="af-home-address">
              <Field label={c('homeAddress')}>
                <textarea value={p.about.location?.address ?? ''} readOnly rows={2} />
              </Field>
            </div>
            <Field label={c('state')}>
              <input value={p.about.location?.state ?? ''} placeholder={c('state')} readOnly />
            </Field>
            <Field label={c('district')}>
              <input
                value={p.about.location?.district ?? ''}
                placeholder={c('district')}
                readOnly
              />
            </Field>
            <Field label={c('city')}>
              <input
                value={p.about.city || p.about.location?.city || ''}
                placeholder={c('city')}
                readOnly
              />
            </Field>
            <Field label={c('location')}>
              <input
                value={p.about.locality || p.about.location?.locality || ''}
                placeholder={c('location')}
                readOnly
              />
            </Field>
            <Field label={c('pin')}>
              <input
                value={p.about.pin || p.about.location?.postalCode || ''}
                placeholder={c('pin')}
                readOnly
              />
            </Field>
          </div>
        </fieldset>
        <Checks name="about.communicationLanguages" options={['Hindi', 'English']} />
        <Attachment name="about.photoFileId" label="photoFileId" ensureDraft={ensureDraft} />
      </>
    )
  if (step === 1)
    return (
      <>
        <h3 className="af-group-title">{c('qualificationsTitle')}</h3>
        <div className="form-grid">
          <Input name="education.qualification" min={2} max={120} hint="qualificationHint" />
          <SubjectSelect
            label={c('specialisation')}
            placeholder={c('chooseSubjects')}
            hint={c('specialisationHint')}
            value={specialisations}
            // Keep authored subjects from older applications selectable until removed.
            options={[...new Set([...teachingSubjects, ...specialisations])]}
            onChange={(subjects) => {
              setValue('education.specialisation', subjects.join(', '), { shouldDirty: true })
              clearErrors('education.specialisation')
            }}
            error={
              getFieldState('education.specialisation', formState).error
                ? c('specialisationRequired')
                : undefined
            }
          />
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
        <h3 className="af-group-title">{c('experienceTitle')}</h3>
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
        <h3 className="af-group-title">{c('documentsTitle')}</h3>
        <div className="af-document-grid">
          <Attachment name="education.resumeFileId" label="resume" ensureDraft={ensureDraft} />
          <Attachment
            name="education.educationFileIds"
            label="educationFileIds"
            ensureDraft={ensureDraft}
          />
        </div>
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
              <Select name={`teachingAreas.${i}.subject`} options={teachingSubjects} />
              <div className="form-grid">
                <Input name={`teachingAreas.${i}.minClass`} type="number" min={1} max={12} />
                <Input name={`teachingAreas.${i}.maxClass`} type="number" min={1} max={12} />
              </div>
            </div>
            <div className="af-teaching-options">
              <Checks name={`teachingAreas.${i}.boards`} options={['CBSE', 'BSEB', 'ICSE']} />
              <Checks name={`teachingAreas.${i}.languages`} options={['Hindi', 'English']} />
              <Checks name={`teachingAreas.${i}.modes`} options={['home', 'online']} />
            </div>
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
      </>
    )
  if (step === 3)
    return (
      <>
        <Slots name="availability.slots" />
        <div className="form-grid">
          <Input name="availability.earliestStart" type="date" />
        </div>
        <fieldset
          className="af-checks"
          aria-invalid={!!getFieldState('availability.durations', formState).error}
        >
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
          {getFieldState('availability.durations', formState).error && (
            <p className="field-error">{c('required')}</p>
          )}
        </fieldset>
        {home && (
          <fieldset className="af-area">
            <legend>{c('homeTitle')}</legend>
            <div className="coverage-slider">
              <div>
                <label htmlFor="home-service-radius">{c('travelKm')}</label>
                <strong>{c('radiusValue', { count: p.availability.home.travelKm || 1 })}</strong>
              </div>
              <input
                id="home-service-radius"
                type="range"
                min={1}
                max={25}
                step={1}
                value={p.availability.home.travelKm || 1}
                onChange={(event) =>
                  setValue('availability.home.travelKm', Number(event.target.value), {
                    shouldDirty: true,
                  })
                }
              />
              <div className="coverage-slider-scale" aria-hidden="true">
                <span>1 km</span>
                <span>25 km</span>
              </div>
            </div>
            <p className="af-note">{c('travelFeesHint')}</p>
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
        <div className="form-grid">
          <Input name="approach.scenario" multiline min={20} max={800} />
          <Input name="approach.understanding" multiline min={20} max={800} />
        </div>
        <Slots name="approach.assessmentSlots" />
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
  const brand = useConfig().data?.appName ?? t('brand')
  const [app, setApp] = useState(initial),
    [step, setStep] = useState(Math.min(initial?.formStep ?? 0, 5)),
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
    const previousTitle = document.title
    document.title = `${c(applicationSteps[step])} · ${c('title')} · ${brand}`
    return () => {
      document.title = previousTitle
    }
  }, [step, c, brand])
  const save = useMutation({
    mutationFn: async ({ next, submit = false }: { next: number; submit?: boolean }) => {
      const profile = structuredClone(form.getValues())
      profile.declarations.noticeVersion = notice
      profile.fees = { preference: 'staff', sessionMinutes: 60, rates: [], comments: '' }
      profile.availability.home.localities = []
      profile.availability.home.serviceLocations = []
      profile.availability.home.charges = ''
      profile.availability.home.bufferMinutes = 0
      // The form no longer offers a recorded-demo choice. Keep legacy attachments,
      // while using the existing interview flow so old incomplete drafts can submit.
      profile.approach.demonstration = 'live'
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
      if (step === 0 && !p.about.location) missing.push('about.location')
      if (step === 0 && !p.about.communicationLanguages.length)
        missing.push('about.communicationLanguages')
      if (step === 1 && !p.education.newToTutoring && !p.education.settings.length)
        missing.push('education.settings')
      if (step === 1 && !p.education.specialisation.trim()) missing.push('education.specialisation')
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
          if (!p.about.location) missing.push('about.location')
          if (p.availability.home.travelKm < 1 || p.availability.home.travelKm > 25)
            missing.push('availability.home.travelKm')
        }
      }
      if (step === 4) {
        if (!p.approach.assessmentSlots.length) missing.push('approach.assessmentSlots')
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
      if (next !== step)
        setTimeout(() => {
          title.current?.focus()
          title.current?.scrollIntoView({
            block: 'start',
            behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
              ? 'instant'
              : 'smooth',
          })
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
          {app.fees && (
            <section className="panel">
              <h2>{t('tutorFees.title')}</h2>
              <TutorFees plans={app.fees.plans} />
            </section>
          )}
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
            <div className="af-progress-meta">
              <span>{t('applicationForm.progress', { step: step + 1 })}</span>
              <span className="af-save-state" role="status">
                {!dirty && app ? <Check size={14} aria-hidden="true" /> : null}
                {dirty ? c('unsaved') : app ? c('saved') : ''}
              </span>
            </div>
            <progress
              className="af-progress-bar"
              max={applicationSteps.length}
              value={step + 1}
              aria-label={c('stepProgress')}
              aria-valuetext={t('applicationForm.progress', { step: step + 1 })}
            />
            <div className="af-step-tabs" role="tablist" aria-label={c('title')}>
              {applicationSteps.map((s, i) => (
                <button
                  key={s}
                  type="button"
                  role="tab"
                  id={`application-step-${i}`}
                  aria-controls={`application-panel-${i}`}
                  aria-selected={step === i}
                  tabIndex={step === i ? 0 : -1}
                  aria-label={`${i + 1}. ${c(s)}`}
                  disabled={save.isPending || uploading}
                  onClick={() => void navigate(i)}
                  onKeyDown={(event) => {
                    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
                    event.preventDefault()
                    const next =
                      event.key === 'Home'
                        ? 0
                        : event.key === 'End'
                          ? 5
                          : (i + (event.key === 'ArrowRight' ? 1 : -1) + 6) % 6
                    document.getElementById(`application-step-${next}`)?.focus()
                  }}
                >
                  <span className="af-step-number">{i + 1}</span>
                  <span className="af-step-label">{c(s)}</span>
                  {problemSteps.includes(i) && (
                    <span className="af-step-error" aria-label={c('check')}>
                      !
                    </span>
                  )}
                </button>
              ))}
            </div>
          </nav>
          {applicationSteps.map(
            (s, i) =>
              i !== step && (
                <div
                  key={s}
                  role="tabpanel"
                  id={`application-panel-${i}`}
                  aria-labelledby={`application-step-${i}`}
                  hidden
                />
              ),
          )}
          <section
            className="af-card"
            role="tabpanel"
            id={`application-panel-${step}`}
            aria-labelledby={`application-step-${step}`}
          >
            <header className="af-card-heading">
              <h2 ref={title} tabIndex={-1}>
                {c(applicationSteps[step])}
              </h2>
              {step < 5 && <p className="af-required-note">{c('requiredHint')}</p>}
            </header>
            {app?.reason && <Alert>{app.reason}</Alert>}
            <form
              ref={formElement}
              noValidate
              onSubmit={(e) => {
                e.preventDefault()
                if (uploading || save.isPending) return
                if (step < 5) void navigate(step + 1, true)
                else if (formElement.current?.reportValidity()) {
                  form.clearErrors()
                  save.mutate({ next: 5, submit: true })
                }
              }}
            >
              <fieldset className="af-fields" disabled={save.isPending || uploading}>
                <StepFields
                  step={step}
                  email={email}
                  ensureDraft={(force = false) =>
                    !force && app && !form.formState.isDirty
                      ? Promise.resolve(app)
                      : save.mutateAsync({ next: step })
                  }
                />
                {step === 5 && (
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
                  {c(step === 5 ? 'submit' : 'next')}
                </Button>
              </footer>
            </form>
          </section>
        </div>
      </UploadActivity.Provider>
    </FormProvider>
  )
}
