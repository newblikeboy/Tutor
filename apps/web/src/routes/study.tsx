import { SubjectName } from '../components/subject-name'
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  ClipboardList,
  Download,
  FileText,
  LockKeyhole,
  Sparkles,
  Trophy,
  Plus,
  Trash2,
} from 'lucide-react'
import { api, APIError, send, queryClient, indiaDate, type Schema } from '../lib/api'
import { useAuth, useDashboard } from '../lib/session'
import { useClock } from '../lib/clock'
import { uploadFile } from '../lib/uploads'
import { loadCheckout } from '../lib/checkout'
import { SubjectField } from '../components/subject-field'
import { Alert, Badge, Button, Empty, Field, Loading, LoadError } from '../components/ui'
import { WorkspaceRecordTable } from '../components/workspace-record-table'
import '../styles/study.css'

type Material = Schema['StudyMaterial']
type MaterialInput = Schema['StudyMaterialInput']
type Attempt = Schema['StudyAttempt']
const kinds = [
  {
    value: 'unit_test',
    label: 'Unit tests',
    icon: FileText,
    description: 'Practise one chapter at a time.',
  },
  {
    value: 'mid_term',
    label: 'Mid-term papers',
    icon: BookOpen,
    description: 'Prepare for mid-term exams.',
  },
  {
    value: 'monthly_test',
    label: 'Monthly tests',
    icon: FileText,
    description: 'Build a monthly revision routine.',
  },
  {
    value: 'quiz',
    label: 'Quizzes',
    icon: ClipboardList,
    description: 'Answer in the app and see your score.',
  },
  { value: 'notes', label: 'Notes', icon: BookOpen, description: 'Download notes for revision.' },
]
const kindLabel = (kind: string) => kinds.find((item) => item.value === kind)?.label ?? kind
const refresh = () =>
  Promise.all([
    queryClient.invalidateQueries({ queryKey: ['study'] }),
    queryClient.invalidateQueries({ queryKey: ['billing'] }),
  ])
function StudyError({ error }: { error: unknown }) {
  return error ? (
    <Alert kind="error">
      {error instanceof APIError
        ? error.message
        : 'The action could not be completed. Please try again.'}
    </Alert>
  ) : null
}
function Pager({
  next,
  back,
  onChange,
}: {
  next: string
  back: boolean
  onChange: (cursor: string) => void
}) {
  return next || back ? (
    <div className="study-actions">
      {back && (
        <Button variant="secondary" onClick={() => onChange('')}>
          First page
        </Button>
      )}
      {next && (
        <Button variant="secondary" onClick={() => onChange(next)}>
          Next page <ArrowRight size={16} aria-hidden="true" />
        </Button>
      )}
    </div>
  ) : null
}
export default function Study() {
  const auth = useAuth()
  if (!auth.data) return <Loading />
  if (auth.data.user.role === 'admin') return <AdminLibrary />
  if (auth.data.user.role === 'parent') return <ParentLibrary />
  return <Alert kind="error">This section is available to parents and administrators.</Alert>
}

function ParentLibrary() {
  const dashboard = useDashboard()
  const [params, setParams] = useSearchParams()
  if (dashboard.isPending) return <Loading />
  if (dashboard.isError) return <LoadError retry={() => void dashboard.refetch()} />
  const students = dashboard.data.learners
  const student = params.has('learner')
    ? students.find((l) => l.id === params.get('learner'))
    : students[0]
  return (
    <div
      className={`study-page study-parent${params.has('material') ? ' study-page-material' : ''}`}
    >
      <header className="study-heading">
        <div>
          <p className="eyebrow">A little practice, every day</p>
          <h1>Papers, quizzes &amp; notes</h1>
          <p>Study resources for your student, all in one place.</p>
        </div>
        <BookOpen size={32} aria-hidden="true" />
      </header>
      {!students.length ? (
        <Empty
          title="Add your student to get started"
          body="Each student has their own subscription and quiz scores."
        >
          <Link className="btn primary" to="/match?profile=1">
            Add student
          </Link>
        </Empty>
      ) : (
        <>
          <div className="study-toolbar">
            <Field label="Student">
              <select
                value={student?.id ?? ''}
                onChange={(event) => setParams({ learner: event.target.value })}
              >
                {!student && <option value="">Choose a student</option>}
                {students.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name} · Class {l.class}
                  </option>
                ))}
              </select>
            </Field>
            {student && (
              <span>
                Class {student.class} · {student.board}
              </span>
            )}
          </div>
          {student ? (
            <StudentLibrary key={student.id} learner={student.id} />
          ) : (
            <Alert kind="error">Choose a student from your account.</Alert>
          )}
        </>
      )}
    </div>
  )
}

function StudentLibrary({ learner }: { learner: string }) {
  const [params, setParams] = useSearchParams()
  const kind = params.get('kind') ?? '',
    cursor = params.get('cursor') ?? '',
    attemptCursor = params.get('attemptCursor') ?? ''
  const results = params.get('section') === 'results'
  const material = params.get('material')
  const q = useQuery({
    queryKey: ['study', learner, kind, cursor, attemptCursor],
    queryFn: ({ signal }) =>
      api<Schema['StudyLibrary']>(
        `/study?${new URLSearchParams({ learner, kind, cursor, attemptCursor })}`,
        { signal },
      ),
    refetchInterval: (query) => (query.state.data?.pendingPayment ? 5000 : 30000),
    refetchOnWindowFocus: true,
    placeholderData: (previous) => previous,
  })
  const now = useClock(q.data?.subscription.expiresAt)
  function change(name: string, value: string) {
    const next = new URLSearchParams(params)
    next.set('learner', learner)
    if (value) next.set(name, value)
    else next.delete(name)
    if (name === 'kind') next.delete('cursor')
    setParams(next)
  }
  if (q.isPending) return <Loading />
  if (q.isError) return <LoadError retry={() => void q.refetch()} />
  const d = q.data,
    active = d.active && Date.parse(d.subscription.expiresAt) > now
  if (material && active)
    return <MaterialDetail id={material} learner={learner} back={() => change('material', '')} />
  const history = q.isPlaceholderData ? (
    <Loading />
  ) : (
    <QuizResults
      student={d.student.name}
      attempts={d.attempts.items}
      next={d.attempts.nextCursor}
      back={!!attemptCursor}
      onPage={(v) => change('attemptCursor', v)}
    />
  )
  if (!active)
    return (
      <>
        <SubscriptionOffer data={d} learner={learner} />
        {(d.attempts.items.length > 0 || attemptCursor) && (
          <section className="study-past-results" aria-label="Saved quiz results">
            {history}
          </section>
        )}
      </>
    )
  return (
    <>
      <section className="study-member-strip" aria-label="Student subscription">
        <div className="study-member-summary">
          <span className="study-member-icon">
            <Check size={22} aria-hidden="true" />
          </span>
          <div>
            <Badge tone="teal">
              {d.subscription.simulated ? 'Test subscription active' : 'Subscription active'}
            </Badge>
            <h2>Your study space</h2>
          </div>
        </div>
        <div className="study-member-expiry">
          <span>Access until</span>
          <strong>{indiaDate(d.subscription.expiresAt, 'en')}</strong>
          <span>Manual renewal after expiry</span>
        </div>
      </section>
      <nav className="study-menu" aria-label="Study section">
        <button
          type="button"
          aria-current={!results ? 'page' : undefined}
          onClick={() => change('section', '')}
        >
          <BookOpen size={18} aria-hidden="true" />
          Study library
        </button>
        <button
          type="button"
          aria-current={results ? 'page' : undefined}
          onClick={() => change('section', 'results')}
        >
          <Trophy size={18} aria-hidden="true" />
          Quiz results
        </button>
      </nav>
      {results ? (
        history
      ) : (
        <>
          <div className="study-categories" role="group" aria-label="Resource type">
            <button type="button" aria-pressed={!kind} onClick={() => change('kind', '')}>
              <BookOpen size={19} aria-hidden="true" />
              All resources
            </button>
            {kinds.map((k) => (
              <button
                key={k.value}
                type="button"
                aria-pressed={kind === k.value}
                onClick={() => change('kind', k.value)}
              >
                <k.icon size={19} aria-hidden="true" />
                {k.label}
              </button>
            ))}
          </div>
          <div className="study-section-heading">
            <div>
              <h2>{kind ? kindLabel(kind) : 'Study library'}</h2>
              <p>
                Published resources for Class {d.student.class} · {d.student.board}
              </p>
            </div>
          </div>
          {q.isPlaceholderData ? (
            <Loading />
          ) : d.materials.items.length ? (
            <div className="study-grid">
              {d.materials.items.map((m) => (
                <article
                  className={`study-card${m.kind === 'quiz' ? ' study-card-quiz' : ''}`}
                  key={m.id}
                >
                  <div className="study-card-type">
                    <span>
                      {m.kind === 'quiz' ? (
                        <ClipboardList size={21} aria-hidden="true" />
                      ) : (
                        <FileText size={21} aria-hidden="true" />
                      )}
                    </span>
                    {kindLabel(m.kind)}
                  </div>
                  <h3>{m.title}</h3>
                  <p>
                    <SubjectName value={m.subject} /> · Class {m.class}
                  </p>
                  {m.description && <p>{m.description}</p>}
                  <Button
                    variant={m.kind === 'quiz' ? 'primary' : 'secondary'}
                    onClick={() => change('material', m.id)}
                  >
                    {m.kind === 'quiz' ? 'Start quiz' : 'Open resource'}
                    <ArrowRight size={16} aria-hidden="true" />
                  </Button>
                </article>
              ))}
            </div>
          ) : (
            <Empty
              title="No resources published yet"
              body="Published resources for this class, board and resource type will appear here."
            />
          )}
          <Pager
            next={d.materials.nextCursor}
            back={!!cursor}
            onChange={(v) => change('cursor', v)}
          />
        </>
      )}
    </>
  )
}

function SubscriptionOffer({ data, learner }: { data: Schema['StudyLibrary']; learner: string }) {
  const expired = Date.parse(data.subscription.expiresAt) > 0
  return (
    <section className="study-offer" aria-label="Student subscription">
      <div className="study-offer-intro">
        <div className="study-offer-label">
          <span className="study-lock-icon">
            <LockKeyhole size={22} aria-hidden="true" />
          </span>
          <Badge tone={expired ? 'amber' : 'neutral'}>
            {expired ? 'Subscription expired' : 'Student study plan'}
          </Badge>
        </div>
        <h2>{expired ? 'Pick up where you left off.' : 'One plan. More ways to learn.'}</h2>
        <p>Papers to prepare. Quizzes to practise. Notes to revise.</p>
        <ul className="study-inclusions">
          {kinds.map((k) => (
            <li key={k.value}>
              <span>
                <k.icon size={21} aria-hidden="true" />
              </span>
              <div>
                <h3>{k.label}</h3>
                <p>{k.description}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
      <div className="study-offer-purchase">
        <p className="eyebrow">{expired ? 'Renew study access' : 'All five resource types'}</p>
        <p className="study-plan-price">
          <strong>₹99</strong>
          <span>per student / month</span>
        </p>
        <p className="study-plan-student">
          For <strong>{data.student.name}</strong>
        </p>
        <ul className="study-plan-terms">
          <li>
            <Check size={16} aria-hidden="true" />
            One month of access
          </li>
          <li>
            <Check size={16} aria-hidden="true" />
            Separate access for each student
          </li>
          <li>
            <Check size={16} aria-hidden="true" />
            No automatic renewal
          </li>
        </ul>
        <StudyCheckout learner={learner} pending={data.pendingPayment} renewing={expired} />
        <p className="study-plan-gate">
          <LockKeyhole size={14} aria-hidden="true" />
          Resources unlock after payment is verified.
        </p>
        {expired && (
          <p className="study-previous-expiry">
            Previous access ended {indiaDate(data.subscription.expiresAt, 'en')}.
          </p>
        )}
        <p className="study-plan-availability">
          Access published resources for this student's class and board.
        </p>
      </div>
    </section>
  )
}

function QuizResults({
  student,
  attempts,
  next,
  back,
  onPage,
}: {
  student: string
  attempts: Attempt[]
  next: string
  back: boolean
  onPage: (cursor: string) => void
}) {
  return (
    <>
      <div className="study-section-heading">
        <div>
          <h2>Quiz results</h2>
          <p>Saved for {student}, including past subscriptions.</p>
        </div>
      </div>
      {attempts.length ? (
        <div className="study-results">
          {attempts.map((attempt) => (
            <article key={attempt.id}>
              <div>
                <h3>{attempt.title}</h3>
                <p>{indiaDate(attempt.createdAt, 'en')}</p>
              </div>
              <strong>
                {attempt.score} / {attempt.total}
                <span> correct</span>
              </strong>
            </article>
          ))}
        </div>
      ) : (
        <Empty title="No quiz results yet" body="Complete a quiz to see your scores here." />
      )}
      <Pager next={next} back={back} onChange={onPage} />
    </>
  )
}

function StudyCheckout({
  learner,
  pending,
  renewing = false,
}: {
  learner: string
  renewing?: boolean
  pending: Schema['PaymentIntent'] | null
}) {
  const [key] = useState(() => crypto.randomUUID())
  const [testIntent, setTestIntent] = useState<Schema['PaymentIntent'] | null>(null)
  const [message, setMessage] = useState('')
  const verify = useMutation({
    mutationFn: (input: { id: string; paymentId: string; signature: string }) =>
      send(`/billing/${input.id}/verify`, {
        paymentId: input.paymentId,
        signature: input.signature,
      }),
    onSuccess: async () => {
      setMessage('Payment verified. Your library is ready.')
      await refresh()
    },
    onError: () =>
      setMessage(
        'Payment confirmation is pending. Access will appear after server verification. Please check again before paying.',
      ),
  })
  const capture = useMutation({
    mutationFn: () => send(`/billing/${testIntent!.id}/simulate`, { confirmed: true }),
    onSuccess: async () => {
      setTestIntent(null)
      await refresh()
    },
  })
  const start = useMutation({
    mutationFn: async () => {
      setMessage('')
      const result = await send<Schema['Checkout']>(
        `/learners/${learner}/study-payment`,
        {},
        'POST',
        { 'Idempotency-Key': key },
      )
      await refresh()
      if (result.intent.state === 'captured') {
        return
      }
      if (result.intent.state !== 'created') {
        setMessage('This payment needs confirmation. Contact payment support before paying again.')
        return
      }
      if (result.intent.provider === 'simulation') {
        setTestIntent(result.intent)
        return
      }
      await loadCheckout()
      const widget = new window.Razorpay!({
        key: result.keyId,
        order_id: result.intent.orderId,
        amount: result.intent.amountPaise,
        currency: result.intent.currency,
        name: 'GoCoaching',
        description: 'Student study subscription · one month',
        theme: { color: '#15353B' },
        handler: (payment) =>
          verify.mutate({
            id: result.intent.id,
            paymentId: payment.razorpay_payment_id,
            signature: payment.razorpay_signature,
          }),
        modal: { ondismiss: () => setMessage('Checkout closed. You can resume this payment.') },
      })
      widget.on('payment.failed', () =>
        setMessage('Payment was unsuccessful. You can retry the same checkout.'),
      )
      widget.open()
    },
  })
  return (
    <div className="study-checkout">
      <Button busy={start.isPending || verify.isPending} onClick={() => start.mutate()}>
        {pending ? 'Resume subscription payment' : renewing ? 'Renew for ₹99' : 'Subscribe for ₹99'}
      </Button>
      {testIntent && (
        <div className="study-test-checkout">
          <Badge tone="amber">Test checkout</Badge>
          <p>Simulate ₹99 for one student. No money will be charged.</p>
          <Button busy={capture.isPending} onClick={() => capture.mutate()}>
            Confirm test subscription
          </Button>
          <Button variant="text" disabled={capture.isPending} onClick={() => setTestIntent(null)}>
            Cancel
          </Button>
        </div>
      )}
      {message && <Alert>{message}</Alert>}
      <StudyError error={start.error ?? capture.error} />
    </div>
  )
}

function MaterialDetail({ id, learner, back }: { id: string; learner: string; back: () => void }) {
  const q = useQuery({
    queryKey: ['study', 'material', id, learner],
    queryFn: ({ signal }) =>
      api<Material>(`/study/materials/${id}?learner=${encodeURIComponent(learner)}`, { signal }),
    staleTime: 0,
    gcTime: 0,
  })
  return (
    <section className="study-detail">
      <Button variant="text" onClick={back}>
        <ArrowLeft size={17} aria-hidden="true" /> Back to library
      </Button>
      {q.isPending ? (
        <Loading />
      ) : q.isError ? (
        <>
          <StudyError error={q.error} />
          <Button variant="secondary" onClick={() => void q.refetch()}>
            Try again
          </Button>
        </>
      ) : (
        <>
          <header>
            <Badge>{kindLabel(q.data.kind)}</Badge>
            <h2>{q.data.title}</h2>
            <p>
              <SubjectName value={q.data.subject} /> · Class {q.data.class}
            </p>
            {q.data.description && <p>{q.data.description}</p>}
          </header>
          {q.data.kind === 'quiz' ? (
            <Quiz key={`${id}-${q.data.version}`} material={q.data} learner={learner} back={back} />
          ) : (
            <DownloadMaterial file={q.data.fileId!} learner={learner} />
          )}
        </>
      )}
    </section>
  )
}
function DownloadMaterial({ file, learner }: { file: string; learner: string }) {
  const download = useMutation({
    mutationFn: async () => {
      // Fetch follows the authorised short-lived redirect without navigating the
      // workspace to a raw JSON error when a subscription has just expired.
      const response = await fetch(
        `/api/v1/files/${encodeURIComponent(file)}/download?${new URLSearchParams({ learner })}`,
        {
          credentials: 'same-origin',
          cache: 'no-store',
        },
      )
      if (!response.ok) {
        if (response.headers.get('content-type')?.includes('application/json')) {
          const error = (await response.json()) as Schema['Error']
          throw new APIError(response.status, error.code, error.message)
        }
        throw new Error('Download unavailable')
      }
      const url = URL.createObjectURL(await response.blob())
      const link = document.createElement('a')
      link.href = url
      link.download = 'study-resource.pdf'
      link.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 10000)
    },
  })
  return (
    <div className="study-download">
      <FileText size={36} aria-hidden="true" />
      <p>PDF resource · Save a copy for your student.</p>
      <Button busy={download.isPending} onClick={() => download.mutate()}>
        <Download size={18} aria-hidden="true" />
        Download PDF
      </Button>
      <StudyError error={download.error} />
    </div>
  )
}
function Quiz({
  material,
  learner,
  back,
}: {
  material: Material
  learner: string
  back: () => void
}) {
  const questions = material.questions ?? []
  const [answers, setAnswers] = useState<number[]>(() => questions.map(() => -1))
  const [current, setCurrent] = useState(0)
  const [reviewing, setReviewing] = useState(false)
  const [result, setResult] = useState<Attempt | null>(null)
  const request = useRef({ body: '', key: '' })
  const heading = useRef<HTMLHeadingElement>(null)
  const answered = answers.filter((answer) => answer >= 0).length
  const complete = answered === questions.length
  const question = questions[current]
  useEffect(() => {
    heading.current?.focus()
  }, [current, reviewing, result])
  const submit = useMutation({
    mutationFn: () => {
      const body = { learnerId: learner, version: material.version, answers }
      const fingerprint = JSON.stringify(body)
      if (request.current.body !== fingerprint)
        request.current = { body: fingerprint, key: crypto.randomUUID() }
      return send<Attempt>(`/study/materials/${material.id}/attempts`, body, 'POST', {
        'Idempotency-Key': request.current.key,
      })
    },
    onSuccess: async (value) => {
      setResult(value)
      await refresh()
    },
  })
  function go(index: number) {
    setCurrent(index)
    setReviewing(false)
  }
  if (result)
    return (
      <div className="study-quiz-result">
        <span className="quiz-result-icon">
          <Trophy size={32} aria-hidden="true" />
        </span>
        <p className="eyebrow">Practice complete</p>
        <h3 ref={heading} tabIndex={-1}>
          Quiz completed
        </h3>
        <div
          className="quiz-score"
          style={{ '--score': `${(100 * result.score) / result.total}%` } as CSSProperties}
        >
          <strong>
            {result.score} / {result.total}
          </strong>
          <span>correct answers</span>
        </div>
        <p role="status">Your score has been saved in Quiz results.</p>
        <p>Every attempt is a chance to learn. Keep practising at your own pace.</p>
        <Button type="button" onClick={back}>
          <ArrowLeft size={17} aria-hidden="true" /> Back to library
        </Button>
      </div>
    )
  return (
    <div className="quiz-experience">
      <aside className="quiz-companion" aria-label="Quiz progress">
        <span className="quiz-companion-icon">
          <Sparkles size={24} aria-hidden="true" />
        </span>
        <h3>One step at a time</h3>
        <p>Take your time, think it through and give it your best.</p>
        <div className="quiz-progress-label">
          <strong>
            {answered} of {questions.length}
          </strong>
          <span>answered</span>
        </div>
        <progress value={answered} max={questions.length} aria-label="Questions answered" />
        <nav className="quiz-question-nav" aria-label="Choose a question">
          {questions.map((_, index) => (
            <button
              type="button"
              key={index}
              disabled={submit.isPending}
              aria-label={`Question ${index + 1}, ${answers[index] >= 0 ? 'answered' : 'not answered'}`}
              aria-current={!reviewing && current === index ? 'step' : undefined}
              className={answers[index] >= 0 ? 'is-answered' : ''}
              onClick={() => go(index)}
            >
              {index + 1}
              {answers[index] >= 0 && <Check size={12} aria-hidden="true" />}
            </button>
          ))}
        </nav>
        <p className="quiz-scoring">One point for each correct answer. No timer, no rush.</p>
      </aside>
      <form
        className="study-quiz"
        onSubmit={(event) => {
          event.preventDefault()
          if (reviewing && complete) submit.mutate()
        }}
      >
        <div className="quiz-question-top">
          <span className="eyebrow">
            {reviewing ? 'Before you finish' : `Question ${current + 1} of ${questions.length}`}
          </span>
          <Badge tone="neutral">{reviewing ? 'Review' : 'Single choice'}</Badge>
        </div>
        {reviewing ? (
          <section className="quiz-review" aria-labelledby="quiz-review-title">
            <h3 id="quiz-review-title" ref={heading} tabIndex={-1}>
              Ready to finish?
            </h3>
            <p>Check your choices below. You can change any answer before submitting.</p>
            <ol>
              {questions.map((q, index) => (
                <li key={index}>
                  <div>
                    <strong>{q.prompt}</strong>
                    <p>{answers[index] >= 0 ? q.options[answers[index]] : 'Not answered yet'}</p>
                  </div>
                  <Button
                    variant="text"
                    type="button"
                    disabled={submit.isPending}
                    aria-label={`Edit answer ${index + 1}`}
                    onClick={() => go(index)}
                  >
                    Edit
                  </Button>
                </li>
              ))}
            </ol>
          </section>
        ) : (
          <fieldset disabled={submit.isPending} aria-labelledby="quiz-question-title">
            <legend className="sr-only">
              {current + 1}. {question.prompt}
            </legend>
            <h3 id="quiz-question-title" ref={heading} tabIndex={-1}>
              {question.prompt}
            </h3>
            <p className="quiz-hint">Choose one answer.</p>
            {question.options.map((option, index) => (
              <label className="study-answer" key={`${current}-${index}`}>
                <input
                  type="radio"
                  name={`question-${current}`}
                  value={index}
                  checked={answers[current] === index}
                  onChange={() =>
                    setAnswers((previous) =>
                      previous.map((value, i) => (i === current ? index : value)),
                    )
                  }
                />
                <span className="quiz-option-letter" aria-hidden="true">
                  {String.fromCharCode(65 + index)}
                </span>
                <span>{option}</span>
                {answers[current] === index && (
                  <Check size={19} className="quiz-option-check" aria-hidden="true" />
                )}
              </label>
            ))}
          </fieldset>
        )}
        <StudyError error={submit.error} />
        <div className="quiz-footer">
          <Button
            type="button"
            variant="text"
            disabled={submit.isPending || (!reviewing && current === 0)}
            onClick={() => (reviewing ? setReviewing(false) : go(current - 1))}
          >
            <ArrowLeft size={16} aria-hidden="true" />
            {reviewing ? 'Back to question' : 'Previous'}
          </Button>
          {reviewing ? (
            <Button key="submit" type="submit" busy={submit.isPending} disabled={!complete}>
              <Check size={17} aria-hidden="true" />
              Submit quiz
            </Button>
          ) : current < questions.length - 1 ? (
            <Button key="next" type="button" onClick={() => go(current + 1)}>
              Next question
              <ArrowRight size={16} aria-hidden="true" />
            </Button>
          ) : (
            <Button
              key="review"
              type="button"
              onClick={(event) => {
                event.preventDefault()
                setReviewing(true)
              }}
            >
              Review answers
              <ArrowRight size={16} aria-hidden="true" />
            </Button>
          )}
        </div>
      </form>
    </div>
  )
}

function AdminLibrary() {
  const [params, setParams] = useSearchParams()
  const id = params.get('material'),
    status = params.get('status') ?? '',
    cursor = params.get('cursor') ?? ''
  const q = useQuery({
    queryKey: ['study', 'admin', status, cursor],
    queryFn: ({ signal }) =>
      api<Schema['StudyMaterialPage']>(
        `/admin/study-materials?${new URLSearchParams({ status, cursor })}`,
        { signal },
      ),
  })
  function change(name: string, value: string) {
    const next = new URLSearchParams(params)
    if (value) next.set(name, value)
    else next.delete(name)
    if (name === 'status') next.delete('cursor')
    setParams(next)
  }
  return (
    <div className="study-page">
      <header className="study-heading">
        <div>
          <p className="eyebrow">Learning resources</p>
          <h1>Papers, quizzes &amp; notes</h1>
          <p>Create resources for the ₹99 monthly student plan.</p>
        </div>
        {!id && (
          <Button onClick={() => change('material', 'new')}>
            <Plus size={18} aria-hidden="true" />
            Create resource
          </Button>
        )}
      </header>
      {id ? (
        <AdminEditor
          key={id}
          id={id}
          back={() => change('material', '')}
          created={(newId) => change('material', newId)}
        />
      ) : (
        <>
          <div className="study-toolbar">
            <Field label="Publication status">
              <select value={status} onChange={(event) => change('status', event.target.value)}>
                <option value="">All statuses</option>
                <option value="draft">Draft</option>
                <option value="published">Published</option>
                <option value="archived">Archived</option>
              </select>
            </Field>
          </div>
          {q.isPending ? (
            <Loading />
          ) : q.isError ? (
            <LoadError retry={() => void q.refetch()} />
          ) : q.data.items.length ? (
            <>
              <WorkspaceRecordTable
                label="Study resources"
                countLabel={`${q.data.items.length} resources on this page`}
                intro="Only published resources are visible to eligible parents."
                columns={['Resource', 'Class & board', 'Type', 'Status', 'Manage']}
              >
                {q.data.items.map((m) => (
                  <tr key={m.id}>
                    <th scope="row">
                      <strong>{m.title}</strong>
                      <span>
                        <SubjectName value={m.subject} />
                      </span>
                    </th>
                    <td>
                      Class {m.class}
                      <span>{m.board === 'All' ? 'All boards' : m.board}</span>
                    </td>
                    <td>{kindLabel(m.kind)}</td>
                    <td>
                      <Badge tone={m.status === 'published' ? 'teal' : 'neutral'}>{m.status}</Badge>
                    </td>
                    <td>
                      <Button variant="text" onClick={() => change('material', m.id)}>
                        Edit<span className="sr-only"> {m.title}</span>
                      </Button>
                    </td>
                  </tr>
                ))}
              </WorkspaceRecordTable>
              <Pager
                next={q.data.nextCursor}
                back={!!cursor}
                onChange={(v) => change('cursor', v)}
              />
            </>
          ) : (
            <Empty title="No resources yet" body="Create your first paper, quiz or set of notes." />
          )}
        </>
      )}
    </div>
  )
}
const initial: MaterialInput = {
  title: '',
  description: '',
  kind: 'unit_test',
  class: 1,
  board: 'All',
  subject: '',
  status: 'draft',
  fileId: '',
  questions: [],
  expectedVersion: 0,
}
function AdminEditor({
  id,
  back,
  created,
}: {
  id: string
  back: () => void
  created: (id: string) => void
}) {
  const q = useQuery({
    queryKey: ['study', 'admin', 'material', id],
    enabled: id !== 'new',
    queryFn: ({ signal }) => api<Material>(`/admin/study-materials/${id}`, { signal }),
    staleTime: 0,
  })
  if (id !== 'new' && q.isPending) return <Loading />
  if (id !== 'new' && q.isError) return <LoadError retry={() => void q.refetch()} />
  const material = q.data
  return (
    <>
      <Button variant="text" onClick={back}>
        <ArrowLeft size={17} aria-hidden="true" />
        Back to resources
      </Button>
      <AdminForm
        key={`${id}-${material?.version ?? 0}`}
        id={id}
        initialValue={
          material
            ? {
                title: material.title,
                description: material.description,
                kind: material.kind,
                class: material.class,
                board: material.board as MaterialInput['board'],
                subject: material.subject,
                status: material.status,
                fileId: material.fileId ?? '',
                questions: material.questions ?? [],
                expectedVersion: material.version,
              }
            : initial
        }
        saved={async (value) => {
          queryClient.setQueryData(['study', 'admin', 'material', value.id], value)
          await refresh()
          if (id === 'new') created(value.id)
        }}
      />
    </>
  )
}
function AdminForm({
  id,
  initialValue,
  saved,
}: {
  id: string
  initialValue: MaterialInput
  saved: (material: Material) => Promise<void>
}) {
  const [value, setValue] = useState(initialValue)
  const [file, setFile] = useState<File | null>(null)
  const [uploadKey, setUploadKey] = useState(() => crypto.randomUUID())
  const [notice, setNotice] = useState('')
  const [progress, setProgress] = useState('')
  const save = useMutation({
    mutationFn: (status: MaterialInput['status']) =>
      send<Material>(
        id === 'new' ? '/admin/study-materials' : `/admin/study-materials/${id}`,
        { ...value, status },
        id === 'new' ? 'POST' : 'PUT',
      ),
    onSuccess: async (m) => {
      setNotice(
        m.status === 'published'
          ? 'Resource published.'
          : m.status === 'archived'
            ? 'Resource archived. Parent access has been removed.'
            : 'Draft saved.',
      )
      await saved(m)
    },
  })
  const upload = useMutation({
    mutationFn: async () => {
      if (!file || file.type !== 'application/pdf' || file.size > 3 * 1024 * 1024)
        throw new APIError(422, 'file_type', 'Choose a PDF up to 3 MiB.')
      return uploadFile(`/admin/study-materials/${id}/files`, file, uploadKey, true, (p) =>
        setProgress(
          p.stage === 'uploading'
            ? `Uploading${p.percent === undefined ? '' : ` ${p.percent}%`}`
            : p.stage === 'verifying'
              ? 'Verifying PDF…'
              : 'Preparing upload…',
        ),
      )
    },
    onSuccess: (f) => {
      setValue((v) => ({ ...v, fileId: f.id }))
      setFile(null)
      setProgress('PDF verified. Save or publish to use this file.')
      setUploadKey(crypto.randomUUID())
    },
    onError: () => setProgress(''),
  })
  const busy = save.isPending || upload.isPending
  function question(index: number, update: Partial<Schema['StudyQuestion']>) {
    setValue((v) => ({
      ...v,
      questions: v.questions.map((q, i) => (i === index ? { ...q, ...update } : q)),
    }))
  }
  return (
    <form
      className="study-editor"
      onSubmit={(event) => {
        event.preventDefault()
        save.mutate('draft')
      }}
    >
      <div className="study-editor-heading">
        <h2>{id === 'new' ? 'Create resource' : 'Edit resource'}</h2>
        <Badge tone="neutral">{initialValue.status}</Badge>
      </div>
      {notice && <Alert kind="success">{notice}</Alert>}
      <fieldset disabled={busy} className="study-fields">
        <legend className="sr-only">Resource details</legend>
        <Field label="Title">
          <input
            required
            maxLength={160}
            minLength={3}
            value={value.title}
            onChange={(e) => setValue({ ...value, title: e.target.value })}
          />
        </Field>
        <div className="study-field-grid">
          <Field label="Resource type">
            <select
              value={value.kind}
              onChange={(e) =>
                setValue({
                  ...value,
                  kind: e.target.value as MaterialInput['kind'],
                  questions: [],
                  fileId: '',
                })
              }
            >
              {kinds.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </select>
          </Field>
          <SubjectField
            value={value.subject}
            includeAll={value.class <= 5}
            onChange={(subject) => setValue({ ...value, subject })}
          />
          <Field label="Class">
            <select
              value={value.class}
              onChange={(e) => setValue({ ...value, class: Number(e.target.value) })}
            >
              {Array.from({ length: 12 }, (_, i) => (
                <option key={i} value={i + 1}>
                  Class {i + 1}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Board">
            <select
              value={value.board}
              onChange={(e) =>
                setValue({ ...value, board: e.target.value as MaterialInput['board'] })
              }
            >
              {['All', 'CBSE', 'BSEB', 'ICSE'].map((b) => (
                <option key={b} value={b}>
                  {b === 'All' ? 'All boards' : b}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Description">
          <textarea
            rows={3}
            maxLength={1200}
            value={value.description}
            onChange={(e) => setValue({ ...value, description: e.target.value })}
          />
        </Field>
      </fieldset>
      {value.kind === 'quiz' ? (
        <section className="study-question-editor" aria-label="Quiz questions">
          <div className="study-section-heading">
            <h3>Questions</h3>
            <span>{value.questions.length} / 50</span>
          </div>
          {value.questions.map((q, index) => (
            <fieldset key={index} disabled={busy}>
              <legend>Question {index + 1}</legend>
              <Field label="Question">
                <textarea
                  required
                  rows={2}
                  minLength={3}
                  maxLength={1000}
                  value={q.prompt}
                  onChange={(e) => question(index, { prompt: e.target.value })}
                />
              </Field>
              <div className="study-field-grid">
                {q.options.map((option, j) => (
                  <Field key={j} label={`Option ${j + 1}`}>
                    <input
                      required
                      maxLength={300}
                      value={option}
                      onChange={(e) =>
                        question(index, {
                          options: q.options.map((old, k) => (k === j ? e.target.value : old)),
                        })
                      }
                    />
                  </Field>
                ))}
              </div>
              <Field label="Correct answer">
                <select
                  value={q.correctOption ?? 0}
                  onChange={(e) => question(index, { correctOption: Number(e.target.value) })}
                >
                  {q.options.map((_, j) => (
                    <option key={j} value={j}>
                      Option {j + 1}
                    </option>
                  ))}
                </select>
              </Field>
              <Button
                type="button"
                variant="text"
                onClick={() =>
                  setValue((v) => ({ ...v, questions: v.questions.filter((_, i) => i !== index) }))
                }
              >
                <Trash2 size={16} aria-hidden="true" />
                Remove question {index + 1}
              </Button>
            </fieldset>
          ))}
          <Button
            type="button"
            variant="secondary"
            disabled={busy || value.questions.length >= 50}
            onClick={() =>
              setValue((v) => ({
                ...v,
                questions: [
                  ...v.questions,
                  { prompt: '', options: ['', '', '', ''], correctOption: 0 },
                ],
              }))
            }
          >
            <Plus size={16} aria-hidden="true" />
            Add question
          </Button>
        </section>
      ) : (
        <section className="study-pdf" aria-label="Resource PDF">
          <h3>Resource PDF</h3>
          {id === 'new' ? (
            <p>Save a draft first, then upload a PDF.</p>
          ) : (
            <>
              {value.fileId && (
                <p>
                  <Check size={16} aria-hidden="true" />
                  PDF attached{' '}
                  <a href={`/api/v1/files/${value.fileId}/view`} target="_blank" rel="noreferrer">
                    Preview PDF
                  </a>
                </p>
              )}
              <Field
                label={value.fileId ? 'Replacement PDF' : 'PDF file'}
                hint="PDF only · Up to 3 MiB"
              >
                <input
                  type="file"
                  accept="application/pdf,.pdf"
                  disabled={busy}
                  onChange={(e) => {
                    setFile(e.target.files?.[0] ?? null)
                    setUploadKey(crypto.randomUUID())
                    setProgress('')
                  }}
                />
              </Field>
              <Button
                type="button"
                variant="secondary"
                busy={upload.isPending}
                disabled={!file || save.isPending}
                onClick={() => upload.mutate()}
              >
                Upload PDF
              </Button>
              {progress && <p role="status">{progress}</p>}
            </>
          )}
        </section>
      )}
      <StudyError error={save.error ?? upload.error} />
      <div className="study-editor-actions">
        <Button type="submit" variant="secondary" busy={save.isPending} disabled={upload.isPending}>
          Save draft
        </Button>
        <Button
          type="button"
          busy={save.isPending}
          disabled={upload.isPending || file !== null}
          onClick={(event) => {
            if (event.currentTarget.form?.reportValidity()) save.mutate('published')
          }}
        >
          Publish resource
        </Button>
        {id !== 'new' && initialValue.status !== 'archived' && (
          <Button
            type="button"
            variant="text"
            disabled={busy}
            onClick={() => save.mutate('archived')}
          >
            Archive resource
          </Button>
        )}
      </div>
    </form>
  )
}
