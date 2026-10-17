import { useEffect, useState } from 'react'
export function useClock(deadline?: string) {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30000)
    const update = () => setNow(Date.now())
    window.addEventListener('focus', update)
    document.addEventListener('visibilitychange', update)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', update)
      document.removeEventListener('visibilitychange', update)
    }
  }, [])
  useEffect(() => {
    if (!deadline) return
    const end = Date.parse(deadline)
    if (!Number.isFinite(end) || now >= end) return
    const remaining = Math.max(0, end - Date.now())
    const timer = window.setTimeout(() => setNow(Date.now()), Math.min(remaining + 1, 2147483647))
    return () => window.clearTimeout(timer)
  }, [deadline, now])
  return now
}
