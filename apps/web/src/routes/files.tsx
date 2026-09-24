import { useRef, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { FileText, Upload, Download } from 'lucide-react'
import { api, APIError, send, queryClient, indiaDate, type Schema } from '../lib/api'
import { useConfig } from '../lib/session'
import {
  Alert,
  Badge,
  Button,
  Field,
  Empty,
  Loading,
  LoadError,
  MutationError,
} from '../components/ui'
import '../styles/tuition.css'
import { useActivePanel } from '../components/workspace-tabs'
export function PrivateFiles({
  target,
  id,
  canUpload = true,
}: {
  target: 'enrollments' | 'applications'
  id: string
  canUpload?: boolean
}) {
  const active = useActivePanel()
  const { t, i18n } = useTranslation(),
    config = useConfig(),
    [cursor, setCursor] = useState(''),
    [file, setFile] = useState<File | null>(null),
    [key, setKey] = useState(() => crypto.randomUUID()),
    input = useRef<HTMLInputElement>(null)
  const path = `/${target}/${id}/files`,
    q = useQuery({
      queryKey: ['files', target, id, cursor],
      enabled: active,
      queryFn: ({ signal }) =>
        api<Schema['FilePage']>(`${path}?cursor=${encodeURIComponent(cursor)}`, { signal }),
    })
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['files', target, id] }),
      queryClient.invalidateQueries({ queryKey: ['tuition', id] }),
      queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
    ])
  const upload = useMutation({
    mutationFn: async () => {
      if (!file || file.size > 3 * 1024 * 1024 || file.size === 0)
        throw new APIError(422, 'file_type', 'Invalid file')
      const content = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onerror = () => reject(new Error('File could not be read'))
        reader.onload = () => resolve(String(reader.result).split(',')[1])
        reader.readAsDataURL(file)
      })
      return send<Schema['PrivateFile']>(path, { name: file.name, content }, 'POST', {
        'Idempotency-Key': key,
      })
    },
    onSuccess: async () => {
      setFile(null)
      setKey(crypto.randomUUID())
      if (input.current) input.current.value = ''
      await refresh()
    },
  })
  const download = useMutation({
    mutationFn: async (f: Schema['PrivateFile']) => {
      const response = await fetch(`/api/v1/files/${f.id}/download`, { credentials: 'same-origin' })
      if (!response.ok) {
        const error: Schema['Error'] = await response.json()
        throw new APIError(response.status, error.code, error.message)
      }
      const url = URL.createObjectURL(await response.blob()),
        a = document.createElement('a')
      a.href = url
      a.download = f.name
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    },
  })
  const retry = useMutation({
    mutationFn: (id: string) => send(`/files/${id}/scan`, {}),
    onSuccess: refresh,
  })
  return (
    <section className="tu-panel tu-stack">
      <div className="tu-panel-title">
        <FileText size={26} aria-hidden="true" />
        <div>
          <h2>{t('files.title')}</h2>
          <p>{t(target === 'applications' ? 'files.applicationIntro' : 'files.intro')}</p>
        </div>
      </div>
      {config.isError ? (
        <LoadError retry={() => void config.refetch()} />
      ) : config.isPending ? (
        <Loading />
      ) : !config.data.uploadsEnabled &&
        !(target === 'applications' && config.data.videoUploadsEnabled) ? (
        <Alert>{t('files.disabled')}</Alert>
      ) : (
        <>
          {!config.data.scannerConfigured && <Alert>{t('files.scanner')}</Alert>}
          {canUpload && config.data.uploadsEnabled && (
            <form
              className="tu-stack"
              onSubmit={(e) => {
                e.preventDefault()
                upload.mutate()
              }}
            >
              <Field label={t('files.choose')} hint={t('files.hint')}>
                <input
                  ref={input}
                  type="file"
                  accept="image/png,image/jpeg,application/pdf"
                  required
                  disabled={upload.isPending}
                  onChange={(e) => {
                    setFile(e.target.files?.[0] ?? null)
                    setKey(crypto.randomUUID())
                    upload.reset()
                  }}
                />
              </Field>
              <MutationError error={upload.error} />
              {upload.isSuccess && <Alert kind="success">{t('files.saved')}</Alert>}
              <Button busy={upload.isPending} disabled={!file}>
                <Upload size={17} aria-hidden="true" />
                {t('files.upload')}
              </Button>
            </form>
          )}
        </>
      )}
      <MutationError error={download.error ?? retry.error} />
      {q.isPending ? (
        <Loading />
      ) : q.isError ? (
        <LoadError retry={() => void q.refetch()} />
      ) : q.data.items.length === 0 ? (
        <Empty title={t('files.empty')} body={t('files.emptyBody')} />
      ) : (
        <div className="tu-session-list">
          {q.data.items.map((f) => (
            <article className="tu-policy" key={f.id}>
              <div className="tu-card-top">
                <h3 className="file-name">{f.name}</h3>
                <Badge tone={f.status === 'clean' ? 'teal' : 'neutral'}>
                  {t(`files.${f.status}`)}
                </Badge>
              </div>
              <p>
                {f.uploaderName} · {Math.ceil(f.size / 1024)} KiB ·{' '}
                {indiaDate(f.createdAt, i18n.language)}
              </p>
              {f.status === 'clean' && f.contentType === 'video/mp4' && (
                <video
                  controls
                  preload="metadata"
                  src={`/api/v1/files/${f.id}/play`}
                  aria-label={f.name}
                  style={{ width: '100%', maxHeight: 400, background: '#132f31', borderRadius: 12 }}
                />
              )}
              <div className="tu-actions">
                {f.status === 'clean' && (
                  <Button
                    variant="secondary"
                    busy={download.isPending}
                    onClick={() => download.mutate(f)}
                  >
                    <Download size={17} aria-hidden="true" />
                    {t('files.download')}
                  </Button>
                )}
                {f.status === 'quarantined' && config.data?.scannerConfigured && (
                  <Button variant="text" busy={retry.isPending} onClick={() => retry.mutate(f.id)}>
                    {t('files.retry')}
                  </Button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
      <div className="tu-actions">
        <Button variant="text" busy={q.isFetching} onClick={() => void q.refetch()}>
          {t('files.refresh')}
        </Button>
        {cursor && (
          <Button variant="text" onClick={() => setCursor('')}>
            {t('tuition.firstPage')}
          </Button>
        )}
        {q.data?.nextCursor && (
          <Button variant="secondary" onClick={() => setCursor(q.data!.nextCursor)}>
            {t('tuition.nextPage')}
          </Button>
        )}
      </div>
    </section>
  )
}
