import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import '../styles/tutor-students.css'

export function WorkspaceRecordTable({
  label,
  countLabel,
  intro,
  columns,
  children,
  note,
}: {
  label: string
  countLabel: string
  intro: string
  columns: string[]
  children: ReactNode
  note?: ReactNode
}) {
  const helpID = useId()
  const region = useRef<HTMLDivElement>(null)
  const [overflowing, setOverflowing] = useState(false)
  useEffect(() => {
    const container = region.current!
    const measure = () => setOverflowing(container.scrollWidth > container.clientWidth + 1)
    const observer = new ResizeObserver(measure)
    observer.observe(container)
    observer.observe(container.querySelector('table')!)
    measure()
    return () => observer.disconnect()
  }, [])
  return (
    <section className="student-roster" aria-label={`${label} overview`}>
      <div className="student-roster-heading">
        <p>{countLabel}</p>
        <p>{intro}</p>
      </div>
      {overflowing && (
        <p id={helpID} className="student-table-help">
          Scroll across to see all details.
        </p>
      )}
      <div
        ref={region}
        className="student-table-scroll"
        role="region"
        aria-label={label}
        aria-describedby={overflowing ? helpID : undefined}
        tabIndex={overflowing ? 0 : undefined}
      >
        <table className="student-table">
          <caption className="sr-only">{label}</caption>
          <thead>
            <tr>
              {columns.map((column) => (
                <th scope="col" key={column}>
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>{children}</tbody>
        </table>
      </div>
      {note && <p className="student-distance-note">{note}</p>}
    </section>
  )
}
