import { useTranslation } from 'react-i18next'
import type { Schema } from '../lib/api'
import '../styles/tutor-fees.css'

export function feeLabel(plan: Pick<Schema['FeePlan'], 'mode' | 'period'>) {
  return plan.mode === 'online' ? 'onlineHour' : plan.period === 'week' ? 'homeWeek' : 'homeMonth'
}

export function TutorFees({ plans = [] }: { plans?: Schema['FeePlan'][] }) {
  const { t, i18n } = useTranslation()
  if (!plans.length) return <p className="tutor-fee-pending">{t('tutorFees.pending')}</p>
  const money = (amount: number) =>
    new Intl.NumberFormat(i18n.language === 'hi' ? 'hi-IN' : 'en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 2,
    }).format(amount / 100)
  return (
    <dl className="tutor-fees" aria-label={t('tutorFees.title')}>
      {plans.map((plan) => (
        <div key={`${plan.mode}:${plan.period}`}>
          <dt>{t(`tutorFees.${feeLabel(plan)}`)}</dt>
          <dd>
            <strong>{money(plan.amountPaise)}</strong> <span>{t(`tutorFees.${plan.period}`)}</span>
            {plan.mode === 'home' && (
              <small>
                {t('tutorFees.includes', { count: plan.classes, minutes: plan.minutes })}
              </small>
            )}
          </dd>
        </div>
      ))}
    </dl>
  )
}
