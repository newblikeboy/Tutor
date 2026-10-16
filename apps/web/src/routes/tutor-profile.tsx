import { useState, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { api, APIError, queryClient, send, type Schema } from '../lib/api'
import { useAuth, useConfig, useTutorApplication } from '../lib/session'
import { approvedTutorModes, approvedTutorSubjects } from '../lib/tutors'
import { prepareProfilePhoto, uploadFile, type UploadProgress } from '../lib/uploads'
import { ApplicationSummary } from '../components/application-summary'
import { FileVideo, PrivateFiles } from './files'
import { TabBar, TabPanel } from '../components/workspace-tabs'
import { UploadFeedback } from '../components/upload-feedback'
import { Alert, Button, Field, Loading, LoadError, MutationError } from '../components/ui'
import { TutorFees } from '../components/tutor-fees'
import { AccountDetails, AccountHelp, AccountSignIns, PasswordChange } from './account'
import { TutorProfileView } from './public-tutor'
import '../styles/tutor-profile.css'

export default function TutorProfile() {
  const [params, setParams] = useSearchParams()
  const options = [
    { value: 'profile', label: 'Public profile' },
    { value: 'account', label: 'Account & email' },
    { value: 'password', label: 'Password' },
    { value: 'signins', label: 'Sign-ins & Google' },
    { value: 'preview', label: 'Preview' },
  ]
  const section = options.some((item) => item.value === params.get('section'))
    ? params.get('section')!
    : 'profile'
  const q = useQuery({
    queryKey: ['tutor-profile'],
    queryFn: ({ signal }) => api<Schema['OwnTutorProfile']>('/tutor-profile', { signal }),
    refetchOnWindowFocus: true,
  })
  if (q.isPending) return <Loading />
  if (q.isError)
    return q.error instanceof APIError && q.error.status === 403 ? (
      <Alert>{q.error.message}</Alert>
    ) : (
      <LoadError retry={() => void q.refetch()} />
    )
  return (
    <div className="tutor-public-profile-page account-page">
      <header className="tutor-profile-heading">
        <div>
          <h1>My profile</h1>
          <p>Your public profile, personal details and account settings in one place.</p>
        </div>
      </header>
      <TabBar
        id="my-profile"
        scrollable
        label="My profile"
        value={section}
        options={options}
        onChange={(value) => {
          const next = new URLSearchParams(params)
          next.set('section', value)
          setParams(next)
        }}
      />
      <TabPanel id="my-profile" value="profile" active={section === 'profile'} preserve>
        <ProfileEditor key={q.data.tutor.id} data={q.data} />
      </TabPanel>
      <TabPanel id="my-profile" value="account" active={section === 'account'} preserve>
        <AccountDetails />
      </TabPanel>
      <TabPanel id="my-profile" value="password" active={section === 'password'} preserve>
        <PasswordChange />
      </TabPanel>
      <TabPanel id="my-profile" value="signins" active={section === 'signins'}>
        <AccountSignIns />
      </TabPanel>
      <TabPanel id="my-profile" value="preview" active={section === 'preview'}>
        <div className="profile-preview-note">
          <strong>What parents see</strong>
          <p>This preview shows your saved profile. Save your changes before previewing.</p>
        </div>
        <TutorProfileView tutor={q.data.tutor} preview />
      </TabPanel>
      <AccountHelp />
    </div>
  )
}

function ProfileEditor({ data }: { data: Schema['OwnTutorProfile'] }) {
  const [profile, setProfile] = useState(data.profile)
  const [extraFiles, setExtraFiles] = useState<Schema['PrivateFile'][]>([])
  const [saved, setSaved] = useState(false)
  const files = [...data.files, ...extraFiles].filter(
    (file, index, all) =>
      (!file.applicationPurpose ||
        ['about.photoFileId', 'approach.demoFileId'].includes(file.applicationPurpose)) &&
      all.findIndex((item) => item.id === file.id) === index,
  )
  const ready = (file: Schema['PrivateFile']) =>
    file.status === 'ready' || (file.status === 'clean' && !!file.scannedAt)
  const photos = files.filter(
    (file) => ['image/jpeg', 'image/png'].includes(file.contentType) && ready(file),
  )
  const videos = files.filter((file) => file.contentType === 'video/mp4' && ready(file))
  const selectedVideo = videos.find((file) => file.id === profile.introVideoFileId)
  const modes = approvedTutorModes(data.tutor.scope)
  const patch = (values: Partial<Schema['TutorPublicProfile']>) => {
    setProfile((current) => ({ ...current, ...values }))
    setSaved(false)
  }
  const save = useMutation({
    mutationFn: () =>
      send<Schema['OwnTutorProfile']>(
        '/tutor-profile',
        {
          version: profile.version,
          introduction: profile.introduction,
          photoFileId: profile.photoFileId,
          introVideoFileId: profile.introVideoFileId,
          publishVideo: profile.publishVideo,
        },
        'PUT',
      ),
    onSuccess: async (value) => {
      setProfile(value.profile)
      setSaved(true)
      queryClient.setQueryData(['tutor-profile'], value)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['tutor', data.tutor.id] }),
        queryClient.invalidateQueries({ queryKey: ['tutors'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
      ])
    },
  })
  return (
    <div>
      <p className="tutor-profile-editor-intro">
        Manage the introduction, photo and video parents see.
      </p>
      <div className="tutor-profile-editor-layout">
        <form
          className="tutor-profile-editor"
          aria-label="Public profile"
          onSubmit={(event) => {
            event.preventDefault()
            save.mutate()
          }}
        >
          <h2>Introduce yourself</h2>
          <Field
            label="Public introduction"
            hint="Explain how you teach and support students. 40–1200 characters."
          >
            <textarea
              required
              minLength={40}
              maxLength={1200}
              rows={6}
              value={profile.introduction}
              onChange={(event) => patch({ introduction: event.target.value })}
            />
          </Field>
          <Field label="Public photo">
            <select
              value={profile.photoFileId}
              onChange={(event) => patch({ photoFileId: event.target.value })}
            >
              <option value="">Use my initials</option>
              {photos.map((file) => (
                <option key={file.id} value={file.id}>
                  {file.name}
                </option>
              ))}
            </select>
          </Field>
          {profile.photoFileId && (
            <img
              className="profile-editor-photo"
              src={`/api/v1/files/${profile.photoFileId}/view?preview=1`}
              alt="Selected public portrait"
            />
          )}
          <ProfileUpload
            kind="photo"
            onSaved={(file) => {
              setExtraFiles((current) => [...current, file])
              patch({ photoFileId: file.id })
            }}
          />
          <div className="profile-video-publishing">
            <h2>Optional introduction video</h2>
            <p>
              Your assessment demonstration stays private unless you select it here and choose to
              publish it.
            </p>
            <Field label="Selected introduction video">
              <select
                value={profile.introVideoFileId}
                onChange={(event) =>
                  patch({ introVideoFileId: event.target.value, publishVideo: false })
                }
              >
                <option value="">No video</option>
                {videos.map((file) => (
                  <option key={file.id} value={file.id}>
                    {file.targetKind === 'application' ? 'Private application video · ' : ''}
                    {file.name}
                  </option>
                ))}
              </select>
            </Field>
            {selectedVideo && <FileVideo file={selectedVideo} />}
            <ProfileUpload
              kind="video"
              onSaved={(file) => {
                setExtraFiles((current) => [...current, file])
                patch({ introVideoFileId: file.id, publishVideo: false })
              }}
            />
            <label className="check-label">
              <input
                type="checkbox"
                disabled={!profile.introVideoFileId}
                checked={profile.publishVideo}
                onChange={(event) => patch({ publishVideo: event.target.checked })}
              />
              I want this selected video to be visible on my public profile.
            </label>
          </div>
          <MutationError error={save.error} />
          {save.error instanceof APIError && save.error.status === 409 && (
            <Button type="button" variant="secondary" onClick={() => window.location.reload()}>
              Reload profile
            </Button>
          )}
          {saved && (
            <Alert kind="success">Profile saved. Preview it to see the published version.</Alert>
          )}
          <Button busy={save.isPending}>Save profile</Button>
        </form>
        <aside className="tutor-profile-approved">
          <h2>Teaching details</h2>
          <p>
            <strong>{approvedTutorSubjects(data.tutor.scope).join(', ')}</strong>
          </p>
          <p>
            Classes {data.tutor.scope.minClass}–{data.tutor.scope.maxClass}
          </p>
          <p>{modes.map((mode) => (mode === 'home' ? 'Home Tuition' : 'Online')).join(' · ')}</p>
          <TutorFees plans={data.tutor.feePlans} />
          <p className="hint">
            Your assigned mentor manages teaching subjects, classes and fees. Profile edits do not
            change your saved booking agreements.
          </p>
        </aside>
      </div>
      <SubmittedRecord />
    </div>
  )
}

function ProfileUpload({
  kind,
  onSaved,
}: {
  kind: 'photo' | 'video'
  onSaved: (file: Schema['PrivateFile']) => void
}) {
  const config = useConfig()
  const [file, setFile] = useState<File | null>(null)
  const [key, setKey] = useState(() => crypto.randomUUID())
  const [progress, setProgress] = useState<UploadProgress | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const upload = useMutation({
    mutationFn: async () => {
      if (
        !file ||
        !['image/jpeg', 'image/png', 'video/mp4'].includes(file.type) ||
        file.size === 0 ||
        file.size > (kind === 'photo' ? 3 : 25) * 1024 * 1024
      )
        throw new APIError(422, 'profile_media', 'Choose a photo up to 3 MiB or MP4 up to 25 MiB.')
      const prepared = kind === 'photo' ? await prepareProfilePhoto(file) : file
      const result = await uploadFile(
        '/tutor-profile/files',
        prepared,
        key,
        config.data?.mediaProvider === 'cloudinary',
        setProgress,
      )
      if (!(result.status === 'ready' || (result.status === 'clean' && result.scannedAt)))
        throw new APIError(
          409,
          'profile_media',
          'The upload needs provider verification before it can be published. Retry after verification.',
        )
      return result
    },
    onSuccess: (value) => {
      onSaved(value)
      setFile(null)
      setKey(crypto.randomUUID())
      if (input.current) input.current.value = ''
    },
  })
  const enabled = kind === 'photo' ? config.data?.uploadsEnabled : config.data?.videoUploadsEnabled
  return (
    <div className="profile-media-upload">
      <Field
        label={kind === 'photo' ? 'Upload a new photo' : 'Upload a new introduction video'}
        hint={
          kind === 'photo'
            ? 'JPG or PNG · up to 3 MiB'
            : 'MP4 · up to 25 MiB. Published only after you choose to share it and save.'
        }
      >
        <input
          ref={input}
          type="file"
          accept={kind === 'photo' ? 'image/jpeg,image/png' : 'video/mp4'}
          disabled={!enabled || upload.isPending}
          onChange={(event) => {
            setFile(event.target.files?.[0] ?? null)
            setKey(crypto.randomUUID())
            upload.reset()
          }}
        />
      </Field>
      {upload.isPending && <UploadFeedback progress={progress} />}
      {upload.error && (
        <Alert kind="error">
          {upload.error instanceof APIError
            ? upload.error.message
            : 'Upload failed. Retry the same file.'}
        </Alert>
      )}
      {!enabled && <p className="hint">Uploads are currently unavailable.</p>}
      <Button
        type="button"
        variant="secondary"
        busy={upload.isPending}
        disabled={!file || !enabled}
        onClick={() => upload.mutate()}
      >
        Upload {kind === 'photo' ? 'photo' : 'video'}
      </Button>
    </div>
  )
}

function SubmittedRecord() {
  const [params, setParams] = useSearchParams()
  const record = params.get('record')
  const open = ['information', 'documents'].includes(record ?? '')
  const tab = record === 'documents' ? 'documents' : 'information'
  return (
    <details
      className="tutor-profile-record"
      open={open}
      onToggle={(event) => {
        if (event.currentTarget.open === open) return
        const next = new URLSearchParams(params)
        if (event.currentTarget.open) next.set('record', 'information')
        else next.delete('record')
        setParams(next, { replace: true })
      }}
    >
      <summary>Submitted information &amp; documents</summary>
      {open && (
        <>
          <h2>Your submitted record</h2>
          <p>
            This is the information saved during your application. Your public introduction and
            media are managed above.
          </p>
          <TabBar
            id="profile-record"
            scrollable
            label="Submitted record"
            value={tab}
            options={[
              { value: 'information', label: 'Submitted information' },
              { value: 'documents', label: 'Documents' },
            ]}
            onChange={(value) => {
              const next = new URLSearchParams(params)
              next.set('record', value)
              setParams(next)
            }}
          />
          <SubmittedRecordContent tab={tab} />
        </>
      )}
    </details>
  )
}

function SubmittedRecordContent({ tab }: { tab: string }) {
  const query = useTutorApplication()
  const auth = useAuth()
  if (query.isPending) return <Loading />
  if (query.isError) return <LoadError retry={() => void query.refetch()} />
  const application = query.data.application
  if (!application) return <Alert kind="error">Your submitted record is not available.</Alert>
  return (
    <>
      <TabPanel id="profile-record" value="information" active={tab === 'information'}>
        {application.profile ? (
          <ApplicationSummary profile={application.profile} email={auth.data?.user.email} />
        ) : (
          <p>No detailed submitted information was saved for this historical application.</p>
        )}
        {application.reason && (
          <section className="profile-record-feedback">
            <h3>Mentor feedback</h3>
            <p>{application.reason}</p>
          </section>
        )}
        {application.interviewAssessment?.comments && (
          <section className="profile-record-feedback">
            <h3>Interview feedback</h3>
            <p>{application.interviewAssessment.comments}</p>
          </section>
        )}
      </TabPanel>
      <TabPanel id="profile-record" value="documents" active={tab === 'documents'}>
        <PrivateFiles target="applications" id={application.id} canUpload={false} />
      </TabPanel>
    </>
  )
}
