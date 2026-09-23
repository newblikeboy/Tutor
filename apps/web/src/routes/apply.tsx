import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ShieldCheck } from 'lucide-react'
import { useAuth, useDashboard } from '../lib/session'
import { queryClient, send } from '../lib/api'
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
const schema = z.object({
  name: z.string().trim().min(2).max(80),
  education: z.string().trim().min(3).max(500),
  approach: z.string().trim().min(10).max(1200),
  language: z.enum(['Hindi', 'English']),
  experience: z.number().int().min(0).max(60),
})
export default function Apply() {
  const { t } = useTranslation()
  const auth = useAuth()
  return (
    <div className="container section">
      <PageHeading eyebrow={t('teach')} title={t('applyTitle')} body={t('applyBody')} />
      {auth.isPending ? (
        <Loading />
      ) : !auth.data ? (
        <div className="panel">
          <p>{t('applicationWarning')}</p>
          <LinkButton to="/login?return=%2Fapply">{t('authRequired')}</LinkButton>
        </div>
      ) : auth.data.user.role !== 'tutor' ? (
        <Alert>{t('permission')}</Alert>
      ) : (
        <ApplicationForm />
      )}
    </div>
  )
}
function ApplicationForm() {
  const { t } = useTranslation()
  const dashboard = useDashboard()
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', education: '', approach: '', language: 'Hindi', experience: 0 },
  })
  const mutation = useMutation({
    mutationFn: (values: z.infer<typeof schema>) =>
      send('/application', { ...values, submit: true }, 'PUT'),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
  })
  const app = dashboard.data?.applications[0]
  if (dashboard.isPending) return <Loading />
  if (dashboard.isError) return <LoadError retry={() => void dashboard.refetch()} />
  if (app && !['draft', 'improvement_required'].includes(app.status))
    return (
      <div className="application-status">
        <Status status={app.status} />
        <h2>{app.name}</h2>
        <p>{t(app.status === 'approved' ? 'scopeHelp' : 'profilePrivate')}</p>
        <p>{t('pipeline')}</p>
        <div className="button-row">
          <LinkButton to="/workspace">{t('viewWorkspace')}</LinkButton>
        </div>
      </div>
    )
  return (
    <div className="application-layout">
      <div className="panel">
        <form onSubmit={form.handleSubmit((values) => mutation.mutate(values))}>
          {Object.keys(form.formState.errors).length > 0 && (
            <Alert kind="error">{t('invalidFields')}</Alert>
          )}
          <Field label={t('name')} error={form.formState.errors.name ? t('required') : undefined}>
            <input
              {...form.register('name')}
              maxLength={80}
              aria-invalid={Boolean(form.formState.errors.name)}
              autoComplete="name"
            />
          </Field>
          <Field
            label={t('education')}
            error={form.formState.errors.education ? t('required') : undefined}
          >
            <textarea
              {...form.register('education')}
              maxLength={500}
              aria-invalid={Boolean(form.formState.errors.education)}
            />
          </Field>
          <div className="form-grid">
            <Field label={t('preferredLanguage')}>
              <select {...form.register('language')}>
                <option value="Hindi">{t('hindi')}</option>
                <option value="English">{t('english')}</option>
              </select>
            </Field>
            <Field
              label={t('experience')}
              error={form.formState.errors.experience ? t('failureValidation') : undefined}
            >
              <input
                type="number"
                min={0}
                max={60}
                {...form.register('experience', { valueAsNumber: true })}
              />
            </Field>
          </div>
          <Field
            label={t('teaching')}
            error={form.formState.errors.approach ? t('required') : undefined}
          >
            <textarea
              {...form.register('approach')}
              maxLength={1200}
              aria-invalid={Boolean(form.formState.errors.approach)}
            />
          </Field>
          <MutationError error={mutation.error} />
          <Button type="submit" busy={mutation.isPending}>
            {t('submitApplication')}
          </Button>
        </form>
      </div>
      <aside className="wizard-aside">
        <ShieldCheck size={30} />
        <h3>{t('approval')}</h3>
        <p>{t('applicationWarning')}</p>
        <p>
          {t('math')} · {t('classes')} 6–10 · {t('online')}
        </p>
        <p>{t('scopeHelp')}</p>
      </aside>
    </div>
  )
}
