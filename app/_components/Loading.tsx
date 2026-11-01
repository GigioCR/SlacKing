// Loading states shaped like what is coming, so nothing jumps when it arrives.

/** While the app checks whether this browser is signed in: the sloth, lounging and scratching its belly. */
export function Splash() {
  return (
    <div className="splash" role="status" aria-label="Loading">
      <img className="splash-sloth" src="/sloth.svg" alt="" width={160} height={96} />
    </div>
  )
}

/** Placeholder rows for the inbox. */
export function InboxSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="inbox" role="status" aria-label="Loading notifications">
      <div className="skeleton skeleton-heading" />
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="event skeleton-row">
          <div className="skeleton skeleton-dot" />
          <div className="event-body">
            <div className="skeleton skeleton-line" style={{ width: `${55 + ((i * 17) % 30)}%` }} />
            <div className="skeleton skeleton-line" />
            <div className="skeleton skeleton-line short" />
          </div>
        </div>
      ))}
    </div>
  )
}

/** Placeholder for one notification's screen. */
export function DetailSkeleton() {
  return (
    <div className="card" role="status" aria-label="Loading notification">
      <div className="skeleton skeleton-chip" />
      <div className="skeleton skeleton-title" />
      <div className="skeleton skeleton-line short" />
      <div className="skeleton skeleton-line" />
      <div className="skeleton skeleton-line" />
      <div className="skeleton skeleton-line" style={{ width: '70%' }} />
    </div>
  )
}

/** A small spinner for buttons that are working. */
export function Spinner() {
  return <span className="spinner" aria-hidden />
}
