import { useEffect, useRef, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Bell, Mail, X } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { api, indiaDate, queryClient, send, type Schema, type User } from '../lib/api'
import { activityNotification } from '../lib/notifications'
import { Loading, LoadError, MutationError } from './ui'
import { TabBar, TabPanel } from './workspace-tabs'
import '../styles/notifications.css'

export function NotificationBell({
  user,
  status,
  statusError,
}: {
  user: User
  status?: Schema['NotificationStatus']
  statusError: boolean
}) {
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState('all')
  const trigger = useRef<HTMLButtonElement>(null)
  const [position, setPosition] = useState({ top: 80, right: 12, maxHeight: 620 })
  const place = () => {
    const box = trigger.current?.getBoundingClientRect()
    if (!box) return
    const top = Math.max(12, box.bottom + 8)
    const width = Math.min(408, window.innerWidth - 24)
    setPosition({
      top,
      right: Math.min(
        Math.max(12, window.innerWidth - box.right),
        Math.max(12, window.innerWidth - width - 12),
      ),
      maxHeight: Math.max(180, Math.min(620, window.innerHeight - top - 16)),
    })
  }
  useEffect(() => {
    if (!open) return
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open])
  return (
    <Dialog.Root
      modal={false}
      open={open}
      onOpenChange={(value) => {
        if (value) {
          place()
          void queryClient.invalidateQueries({ queryKey: ['notifications', 'status', user.id] })
        } else setFilter('all')
        setOpen(value)
      }}
    >
      <Dialog.Trigger asChild>
        <button
          ref={trigger}
          type="button"
          className="workspace-notification-bell"
          aria-label={
            statusError
              ? 'Notifications, unread count unavailable'
              : status
                ? `Notifications, ${status.unreadCount} unread`
                : 'Notifications'
          }
          title={statusError ? 'Notifications — unread count unavailable' : 'Notifications'}
        >
          <Bell size={21} aria-hidden="true" />
          {statusError ? (
            <span className="workspace-notification-count" aria-hidden="true">
              !
            </span>
          ) : (
            !!status?.unreadCount && (
              <span className="workspace-notification-count" aria-hidden="true">
                {status.unreadCount > 99 ? '99+' : status.unreadCount}
              </span>
            )
          )}
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Content
          className="notification-popover"
          style={position}
          aria-describedby={undefined}
        >
          <div className="notification-popover-heading">
            <div>
              <Dialog.Title>Notifications</Dialog.Title>
              <p>Updates from your learning space</p>
            </div>
            <Dialog.Close className="icon-button" aria-label="Close notifications">
              <X size={19} aria-hidden="true" />
            </Dialog.Close>
          </div>
          <TabBar
            id="notification-feed"
            label="Notification filter"
            value={filter}
            options={[
              { value: 'all', label: 'All' },
              { value: 'unread', label: 'Unread' },
            ]}
            onChange={setFilter}
          />
          <div className="notification-popover-body">
            {['all', 'unread'].map((value) => (
              <TabPanel key={value} id="notification-feed" value={value} active={filter === value}>
                <RecentNotifications
                  user={user}
                  unread={value === 'unread'}
                  onSelected={() => setOpen(false)}
                />
              </TabPanel>
            ))}
          </div>
          <div className="notification-popover-footer">
            <Link to="/notifications?folder=activity" onClick={() => setOpen(false)}>
              View all notifications
            </Link>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function RecentNotifications({
  user,
  unread,
  onSelected,
}: {
  user: User
  unread: boolean
  onSelected: () => void
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const inboxAllowed = ['parent', 'tutor', 'admin'].includes(user.role)
  const activity = useQuery({
    queryKey: ['notifications', 'recent', user.id, unread],
    queryFn: ({ signal }) =>
      api<Schema['Notification'][]>(`/notifications/recent${unread ? '?unread=1' : ''}`, {
        signal,
      }),
    refetchInterval: 15000,
    refetchOnWindowFocus: true,
    refetchOnMount: 'always',
  })
  const updates = useQuery({
    queryKey: ['inbox', 'messages', user.id, unread ? 'unread' : 'inbox', ''],
    enabled: inboxAllowed,
    queryFn: ({ signal }) =>
      api<Schema['InboxPage']>(`/inbox?folder=${unread ? 'unread' : 'inbox'}`, { signal }),
    refetchInterval: 15000,
    refetchOnWindowFocus: true,
    refetchOnMount: 'always',
  })
  const read = useMutation({
    mutationFn: ({ id }: { id: string; href: string }) =>
      send(`/notifications/${encodeURIComponent(id)}/read`, {}),
    onSuccess: async (_, item) => {
      await queryClient.invalidateQueries({ queryKey: ['notifications'] })
      onSelected()
      navigate(item.href)
    },
  })
  if (activity.isPending || (inboxAllowed && updates.isPending)) return <Loading />
  if (activity.isError || (inboxAllowed && updates.isError))
    return (
      <LoadError
        retry={() => {
          void activity.refetch()
          if (inboxAllowed) void updates.refetch()
        }}
      />
    )
  const items = [
    ...(activity.data ?? []).map((item) => ({
      ...activityNotification(item, user.role, t),
      id: item.id,
      kind: 'activity',
      subtitle: 'Activity',
      createdAt: item.createdAt,
      read: item.read,
    })),
    ...(inboxAllowed ? (updates.data?.items ?? []) : []).map((item) => ({
      id: item.id,
      kind: 'update',
      title: item.subject,
      subtitle: `${item.sender.name}${item.sender.sample ? ' · Sample account' : ''}`,
      createdAt: item.createdAt,
      read: !!item.readAt,
      href: `/notifications?folder=inbox&id=${encodeURIComponent(item.id)}`,
    })),
  ]
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || b.id.localeCompare(a.id))
    .slice(0, 12)
  return (
    <>
      <MutationError error={read.error} />
      {read.isPending && (
        <p className="notification-opening" role="status">
          Opening notification…
        </p>
      )}
      {!items.length ? (
        <div className="notification-empty">
          <Bell size={28} aria-hidden="true" />
          <h3>{unread ? 'You’re all caught up' : 'No notifications yet'}</h3>
          <p>{unread ? 'You have no unread notifications.' : 'Your updates will appear here.'}</p>
        </div>
      ) : (
        <ul className="notification-feed-list" aria-label="Recent notifications">
          {items.map((item) => (
            <li key={`${item.kind}:${item.id}`}>
              <Link
                className="notification-item"
                data-unread={!item.read}
                data-notification-id={item.id}
                to={item.href}
                aria-disabled={read.isPending || undefined}
                onClick={(event) => {
                  if (read.isPending) {
                    event.preventDefault()
                    return
                  }
                  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
                  if (item.kind === 'activity' && !item.read) {
                    event.preventDefault()
                    read.mutate({ id: item.id, href: item.href })
                  } else onSelected()
                }}
              >
                <span className="notification-item-icon">
                  {item.kind === 'update' ? (
                    <Mail size={19} aria-hidden="true" />
                  ) : (
                    <Bell size={19} aria-hidden="true" />
                  )}
                </span>
                <span className="notification-item-copy">
                  <strong>{item.title}</strong>
                  <span>{item.subtitle}</span>
                  <time dateTime={item.createdAt}>{indiaDate(item.createdAt, 'en')}</time>
                </span>
                <span className="notification-item-status">
                  {!item.read && (
                    <>
                      <span className="notification-unread-dot" aria-hidden="true" />
                      <span className="sr-only">Unread</span>
                    </>
                  )}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
