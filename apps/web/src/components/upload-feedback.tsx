import '../locales/files'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FileText } from 'lucide-react'
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

export function LocalFilePreview({ file }: { file: File }) {
  const { t } = useTranslation()
  const [url, setURL] = useState('')
  useEffect(() => {
    if (file.type === 'application/pdf') return
    const reader = new FileReader()
    reader.onload = () => setURL(String(reader.result))
    reader.readAsDataURL(file)
    return () => {
      reader.abort()
    }
  }, [file])
  return (
    <figure className="upload-local-preview">
      {file.type === 'application/pdf' ? (
        <div className="upload-document-preview">
          <FileText size={32} aria-hidden="true" />
          <span>{t('files.pdfDocument')}</span>
        </div>
      ) : (
        url && <img src={url} alt={t('files.localPreviewAlt')} />
      )}
      <figcaption>
        {file.name} · {t('files.localPreview')}
      </figcaption>
    </figure>
  )
}
