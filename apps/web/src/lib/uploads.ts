import { APIError, send, type Schema } from './api'

// Cloudinary receives the File directly. Only metadata crosses the Go API.
export async function uploadFile(path: string, file: File, key: string, direct: boolean) {
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
      return await send<Schema['PrivateFile']>(`/files/${intent.file.id}/complete`, {})
    } catch (error) {
      if (!(error instanceof APIError) || error.code !== 'storage_unavailable') throw error
    }
  const body = new FormData()
  for (const [name, value] of Object.entries(intent.upload.fields)) body.append(name, value)
  body.append('file', file)
  const response = await fetch(intent.upload.url, {
    method: 'POST',
    body,
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
  })
  if (!response.ok)
    throw new APIError(503, 'storage_unavailable', 'Cloudinary upload failed. Retry the same file.')
  // The browser response is never trusted as proof of upload. Go checks Cloudinary.
  return send<Schema['PrivateFile']>(`/files/${intent.file.id}/complete`, {})
}
