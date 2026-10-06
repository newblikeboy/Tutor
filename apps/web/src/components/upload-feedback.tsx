import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { UploadProgress } from '../lib/uploads'
import '../styles/upload-feedback.css'

export function UploadFeedback({ progress }: { progress: UploadProgress | null }) {
  const { t } = useTranslation()
  if (!progress) return null
  const label = t(`files.progress.${progress.stage}`)
  return (
    <div className="upload-feedback">
      <span role="status">
        {label}
        {progress.stage === 'uploading' && progress.percent !== undefined
          ? ` ${progress.percent}%`
          : ''}
      </span>
      <progress
        aria-label={label}
        max={100}
        value={progress.stage === 'uploading' ? progress.percent : undefined}
      />
    </div>
  )
}

export function LocalImagePreview({ file }: { file: File }) {
  const { t } = useTranslation()
  const [url, setURL] = useState('')
  useEffect(() => {
    const reader = new FileReader()
    reader.onload = () => setURL(String(reader.result))
    reader.readAsDataURL(file)
    return () => {
      reader.abort()
    }
  }, [file])
  return (
    <figure className="upload-local-preview">
      {url && <img src={url} alt={t('files.localPreviewAlt')} />}
      <figcaption>
        {file.name} · {t('files.localPreview')}
      </figcaption>
    </figure>
  )
}
