import { Check } from 'lucide-react'
import '../styles/booking-progress.css'

export function BookingProgress({ status }: { status: string }) {
  const phases: Record<string, number | undefined> = {
    pending_agreement: 0,
    awaiting_payment: 1,
    pending_tutor_acceptance: 2,
  }
  const index = phases[status]
  if (index === undefined) return null
  return (
    <nav className="booking-progress" aria-label="Booking progress">
      <ol>
        {['Booking details', 'Payment', 'Tutor acceptance', 'Classes'].map((label, position) => (
          <li
            key={label}
            aria-current={position === index ? 'step' : undefined}
            data-complete={position < index}
          >
            <span className="booking-step-marker" aria-hidden="true">
              {position < index ? <Check size={14} /> : position + 1}
            </span>
            <span>
              {label}
              <span className="sr-only">
                {position < index
                  ? ' — completed'
                  : position === index
                    ? ' — current step'
                    : ' — upcoming'}
              </span>
            </span>
          </li>
        ))}
      </ol>
    </nav>
  )
}
