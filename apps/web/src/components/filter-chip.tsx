import { X } from 'lucide-react'
import type { ReactNode } from 'react'

export function FilterChip({
  children,
  label,
  onRemove,
}: {
  children: ReactNode
  label: string
  onRemove: () => void
}) {
  return (
    <button type="button" className="filter-chip" aria-label={label} onClick={onRemove}>
      {children}
      <X size={14} aria-hidden="true" />
    </button>
  )
}
