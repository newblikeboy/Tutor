import { cloneElement, isValidElement, useId } from 'react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import * as Dialog from '@radix-ui/react-dialog'
import { ArrowRight, AlertCircle, CheckCircle2, Inbox, Loader2, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import { errorKey } from '../lib/api'
export function Button({
  children,
  variant = 'primary',
  busy = false,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'text' | 'danger'
  busy?: boolean
}) {
  return (
    <button
      {...props}
      className={`btn ${variant} ${props.className ?? ''}`}
      disabled={props.disabled || busy}
      aria-busy={busy}
    >
      {busy && <Loader2 size={18} className="spin" />}
      {children}
    </button>
  )
}
export function LinkButton({
  to,
  children,
  secondary = false,
}: {
  to: string
  children: ReactNode
  secondary?: boolean
}) {
  return (
    <Link className={`btn ${secondary ? 'secondary' : 'primary'}`} to={to}>
      {children}
      <ArrowRight size={17} aria-hidden="true" />
    </Link>
  )
}
export function Badge({
  children,
  tone = 'teal',
}: {
  children: ReactNode
  tone?: 'teal' | 'amber' | 'neutral'
}) {
  return (
    <span className={`badge ${tone}`}>
      <span className="status-dot" />
      {children}
    </span>
  )
}
export function Status({ status }: { status: string }) {
  const { t } = useTranslation()
  return (
    <Badge
      tone={
        ['approved', 'confirmed', 'reviewed'].includes(status)
          ? 'teal'
          : ['suspended', 'declined', 'cancelled'].includes(status)
            ? 'amber'
            : 'neutral'
      }
    >
      {t(status === 'assessed' ? 'assessmentRecorded' : status)}
    </Badge>
  )
}
export function Field({
  label,
  children,
  hint,
  error,
}: {
  label: string
  children: ReactNode
  hint?: string
  error?: string
}) {
  const generated = useId()
  const id =
    isValidElement<Record<string, unknown>>(children) && typeof children.props.id === 'string'
      ? children.props.id
      : generated
  const described =
    [hint ? `${id}-hint` : '', error ? `${id}-error` : ''].filter(Boolean).join(' ') || undefined
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {isValidElement<Record<string, unknown>>(children)
        ? cloneElement(children, { id, 'aria-describedby': described })
        : children}
      {hint && (
        <span id={`${id}-hint`} className="hint">
          {hint}
        </span>
      )}
      {error && (
        <span id={`${id}-error`} className="field-error">
          {error}
        </span>
      )}
    </div>
  )
}
export function Alert({
  children,
  kind = 'info',
}: {
  children: ReactNode
  kind?: 'info' | 'error' | 'success'
}) {
  return (
    <div className={`alert ${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
      {kind === 'success' ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
      <div>{children}</div>
    </div>
  )
}
export function MutationError({ error }: { error: unknown }) {
  const { t } = useTranslation()
  return error ? <Alert kind="error">{t(errorKey(error))}</Alert> : null
}
export function Loading() {
  const { t } = useTranslation()
  return (
    <div className="loading-state" role="status">
      <span className="sr-only">{t('loading')}</span>
      <div className="skeleton wide" />
      <div className="skeleton" />
      <div className="skeleton block" />
    </div>
  )
}
export function Empty({
  title,
  body,
  children,
}: {
  title: string
  body?: string
  children?: ReactNode
}) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Inbox size={26} />
      </span>
      <h3>{title}</h3>
      {body && <p>{body}</p>}
      {children}
    </div>
  )
}
export function LoadError({ retry }: { retry: () => void }) {
  const { t } = useTranslation()
  return (
    <div className="panel">
      <Alert kind="error">
        <strong>{t('errorTitle')}</strong>
        <p>{t('errorBody')}</p>
      </Alert>
      <Button variant="secondary" onClick={retry}>
        {t('retry')}
      </Button>
    </div>
  )
}
export function Modal({
  trigger,
  title,
  description,
  children,
  drawer = false,
}: {
  trigger: ReactNode
  title: string
  description?: string
  children: ReactNode
  drawer?: boolean
}) {
  const { t } = useTranslation()
  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content
          className={`dialog-content ${drawer ? 'drawer' : ''}`}
          aria-describedby={description ? 'dialog-description' : undefined}
        >
          <Dialog.Title className="dialog-title">{title}</Dialog.Title>
          {description && (
            <Dialog.Description id="dialog-description">{description}</Dialog.Description>
          )}
          <Dialog.Close className="icon-button dialog-close" aria-label={t('close')}>
            <X />
          </Dialog.Close>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
export function PageHeading({
  eyebrow,
  title,
  body,
  action,
}: {
  eyebrow?: string
  title: string
  body?: string
  action?: ReactNode
}) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {body && <p className="intro">{body}</p>}
      </div>
      {action}
    </div>
  )
}
