import { APIError, send, type Schema } from './api'

export type UploadProgress = {
  stage: 'preparing' | 'uploading' | 'verifying' | 'saving'
  percent?: number
}

// Only portrait photos are resized. Documents and evidence retain their bytes.
export async function prepareProfilePhoto(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file)
  try {
    const scale = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Photo processing is unavailable')
    context.fillStyle = '#fff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (value) => (value ? resolve(value) : reject(new Error('Photo could not be prepared'))),
        'image/jpeg',
        0.85,
      ),
    )
    // Avoid recompressing an already smaller photo with no resizing benefit.
    if (scale === 1 && blob.size >= file.size) return file
    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', {
      type: 'image/jpeg',
      lastModified: file.lastModified,
    })
  } finally {
    bitmap.close()
  }
}

// Cloudinary receives the File directly. Only metadata crosses the Go API.
export async function uploadFile(
  path: string,
  file: File,
  key: string,
  direct: boolean,
  onProgress?: (progress: UploadProgress) => void,
) {
  onProgress?.({ stage: 'preparing' })
  if (!direct) {
    const content = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onerror = () => reject(new Error('File could not be read'))
      reader.onload = () => resolve(String(reader.result).split(',')[1])
      reader.readAsDataURL(file)
    })
    return send<Schema['PrivateFile']>(path, { name: file.name, content }, 'POST', {
      'Idempotency-Key': key,
    })
  }
  const intent = await send<Schema['DirectUpload']>(
    `${path}/upload-intent`,
    {
      name: file.name,
      contentType: file.type,
      size: file.size,
    },
    'POST',
    { 'Idempotency-Key': key },
  )
  if (intent.file.status === 'ready') return intent.file
  if (!intent.upload) throw new APIError(503, 'storage_unavailable', 'Upload is unavailable')
  // Recover a completed remote upload after a lost response or interrupted save.
  if (intent.resume)
    try {
      onProgress?.({ stage: 'verifying' })
      return await send<Schema['PrivateFile']>(`/files/${intent.file.id}/complete`, {})
    } catch (error) {
      if (!(error instanceof APIError) || error.code !== 'storage_unavailable') throw error
    }
  const body = new FormData()
  for (const [name, value] of Object.entries(intent.upload.fields)) body.append(name, value)
  body.append('file', file)
  onProgress?.({ stage: 'uploading', percent: 0 })
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', intent.upload!.url)
    xhr.withCredentials = false
    xhr.upload.onprogress = (event) =>
      onProgress?.({
        stage: 'uploading',
        percent: event.lengthComputable
          ? Math.min(100, Math.round((event.loaded / event.total) * 100))
          : undefined,
      })
    const failed = () =>
      reject(
        new APIError(503, 'storage_unavailable', 'Cloudinary upload failed. Retry the same file.'),
      )
    xhr.onerror = failed
    xhr.onabort = failed
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : failed())
    xhr.send(body)
  })
  // The browser response is never trusted as proof of upload. Go checks Cloudinary.
  onProgress?.({ stage: 'verifying' })
  return send<Schema['PrivateFile']>(`/files/${intent.file.id}/complete`, {})
}
