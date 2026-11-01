/** "just now", "5 min ago", "3 h ago", then the date. */
export function timeAgo(iso: string, now = Date.now()): string {
  const at = new Date(iso).getTime()
  if (Number.isNaN(at)) return ''
  const minutes = Math.round((now - at) / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  return new Date(at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

/** "14:05" or "2:05 PM", as the phone is set. */
export function clockTime(iso: string): string {
  const at = new Date(iso)
  return Number.isNaN(at.getTime()) ? '' : at.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

/** The inbox's day headings: "Today", "Yesterday", then "Thursday, Oct 30". */
export function dayLabel(iso: string, now = new Date()): string {
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return ''
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const days = Math.round((startOfDay(now) - startOfDay(at)) / 86_400_000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  return at.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })
}

/** Full local date and time, for the detail screen. */
export function fullTime(iso: string): string {
  const at = new Date(iso)
  return Number.isNaN(at.getTime())
    ? ''
    : at.toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}
