import { useEffect, useId, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown } from 'lucide-react'
import { teachingSubjects } from '../lib/subjects'
import '../styles/subject-select.css'

export function SubjectSelect({
  value,
  onChange,
  label,
  placeholder,
  options = teachingSubjects,
  hint,
  error,
}: {
  value: string[]
  onChange: (subjects: string[]) => void
  label?: string
  placeholder?: string
  options?: string[]
  hint?: string
  error?: string
}) {
  const { t } = useTranslation()
  const id = useId()
  const details = useRef<HTMLDetailsElement>(null)
  const summary = useRef<HTMLElement>(null)
  const describedBy =
    [hint ? `${id}-hint` : '', error ? `${id}-error` : ''].filter(Boolean).join(' ') || undefined
  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      if (
        details.current &&
        event.target instanceof Node &&
        !details.current.contains(event.target)
      ) {
        details.current.open = false
      }
    }
    // Handle Escape before a containing dialog's document-level dismissal.
    const closeOnEscape = (event: KeyboardEvent) => {
      if (
        event.key === 'Escape' &&
        details.current?.open &&
        event.target instanceof Node &&
        details.current.contains(event.target)
      ) {
        event.preventDefault()
        event.stopPropagation()
        details.current.open = false
        summary.current?.focus()
      }
    }
    document.addEventListener('pointerdown', closeOutside)
    window.addEventListener('keydown', closeOnEscape, true)
    return () => {
      document.removeEventListener('pointerdown', closeOutside)
      window.removeEventListener('keydown', closeOnEscape, true)
    }
  }, [])
  return (
    <div className="subject-select field">
      <span id={`${id}-label`} className="subject-select-label">
        {label ?? t('landing.finderSubjectLabel')}
      </span>
      <details
        ref={details}
        onKeyDown={(event) => {
          // Close after Tab moves focus, never during a label's pointer activation.
          // Pointer clicks outside and Escape are handled separately above.
          if (event.key === 'Tab')
            requestAnimationFrame(() => {
              if (details.current && !details.current.contains(document.activeElement))
                details.current.open = false
            })
        }}
      >
        <summary
          ref={summary}
          aria-labelledby={`${id}-label ${id}-value`}
          aria-describedby={describedBy}
          aria-invalid={!!error}
        >
          <span id={`${id}-value`}>
            {value.length ? value.join(', ') : (placeholder ?? t('landing.finderAnySubject'))}
          </span>
          <ChevronDown size={18} aria-hidden="true" />
        </summary>
        <div className="subject-select-options" role="group" aria-labelledby={`${id}-label`}>
          {options.map((subject) => (
            <label key={subject}>
              <input
                type="checkbox"
                checked={value.includes(subject)}
                onChange={(event) => {
                  onChange(
                    event.target.checked
                      ? [...value, subject]
                      : value.filter((item) => item !== subject),
                  )
                }}
              />
              <span>{subject}</span>
            </label>
          ))}
        </div>
      </details>
      {hint && (
        <span id={`${id}-hint`} className="hint">
          {hint}
        </span>
      )}
      {error && (
        <span id={`${id}-error`} className="field-error" role="alert">
          {error}
        </span>
      )}
    </div>
  )
}
