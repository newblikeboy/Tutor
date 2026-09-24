import { createContext, useContext, useState, type ReactNode } from 'react'
import '../styles/workspace-tabs.css'

const ActivePanel = createContext(true)
export const useActivePanel = () => useContext(ActivePanel)

export function TabBar({
  id,
  label,
  value,
  options,
  onChange,
}: {
  id: string
  label: string
  value: string
  options: { value: string; label: string }[]
  onChange: (value: string) => void
}) {
  return (
    <div className="workspace-tabs" role="tablist" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          id={`${id}-tab-${option.value}`}
          aria-controls={`${id}-panel-${option.value}`}
          aria-selected={value === option.value}
          tabIndex={value === option.value ? 0 : -1}
          onClick={() => onChange(option.value)}
          onKeyDown={(event) => {
            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
            event.preventDefault()
            const buttons = Array.from(
              event.currentTarget.parentElement!.querySelectorAll<HTMLButtonElement>(
                '[role="tab"]',
              ),
            )
            const index = buttons.indexOf(event.currentTarget)
            const next =
              event.key === 'Home'
                ? 0
                : event.key === 'End'
                  ? buttons.length - 1
                  : (index + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) %
                    buttons.length
            buttons[next].focus()
          }}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

export function TabPanel({
  id,
  value,
  active,
  preserve = false,
  children,
}: {
  id: string
  value: string
  active: boolean
  preserve?: boolean
  children: ReactNode
}) {
  const [visited, setVisited] = useState(active)
  // Retain forms after their first visit, including when reached with browser Back.
  if (active && !visited) setVisited(true)
  return (
    <section
      className="workspace-tab-panel"
      role="tabpanel"
      id={`${id}-panel-${value}`}
      aria-labelledby={`${id}-tab-${value}`}
      hidden={!active}
      tabIndex={0}
    >
      <ActivePanel.Provider value={active}>
        {active || (preserve && visited) ? children : null}
      </ActivePanel.Provider>
    </section>
  )
}
