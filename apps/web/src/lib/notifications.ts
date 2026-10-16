import type { TFunction } from 'i18next'
import type { Schema, User } from './api'

export function activityNotification(
  item: Schema['Notification'],
  role: User['role'],
  t: TFunction,
) {
  const target = encodeURIComponent(item.targetId)
  if (item.kind.startsWith('interview_'))
    return {
      title: 'Tutor interview updated',
      href:
        role === 'tutor'
          ? '/apply'
          : `/workspace?view=${role === 'mentor' ? 'interviews' : 'applications'}&application=${target}`,
      action: 'View interview',
    }
  if (item.kind === 'case_update')
    return {
      title: t('cases.case_update'),
      href: `/cases/${target}`,
      action: t('cases.openUpdate'),
    }
  if (item.kind === 'trial_requested')
    return {
      title: t('tuition.trial_requested'),
      href: `/workspace?view=sessions&queue=requested&trial=${target}`,
      action: 'Open trial request',
    }
  if (['booking_confirmed', 'booking_awaiting_tutor'].includes(item.kind))
    return {
      title:
        item.kind === 'booking_awaiting_tutor'
          ? 'New booking needs your acceptance'
          : t('tuition.booking_confirmed'),
      href: `/tuition/${target}`,
      action: 'Open booking',
    }
  if (item.kind === 'conversation_message')
    return {
      title: t('tuition.conversation_message'),
      href: `/tuition/${target}?tab=messages`,
      action: t('tuition.openConversation'),
    }
  // Retained records can contain historical kinds no longer emitted by the application.
  return { title: 'Learning update', href: '/notifications?folder=activity', action: 'View update' }
}
