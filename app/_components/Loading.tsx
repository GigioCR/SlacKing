'use client'

import { useEffect, useState } from 'react'

// One loading state for every screen: the sloth stays until everything the screen needs has arrived.

const PHRASES = [
  'Loafing around',
  'Scratching the belly',
  'Stretching first',
  'Hanging in there',
  'Taking it slow',
  'Five more minutes',
  'Resting my eyes',
  'Lounging with purpose',
  'Contemplating a nap',
  'Chewing a leaf',
  'Yawning dramatically',
  'Moving at sloth speed',
  'Polishing the crown',
  'Slacking, royally',
]
const PHRASE_MS = 2400

function randomPhrase(not?: number): number {
  const next = Math.floor(Math.random() * (PHRASES.length - 1))
  return not === undefined || next < not ? next : next + 1
}

/** The sloth, lounging and scratching its belly, with a lazy phrase that changes every few seconds. */
export function Splash() {
  // Picked after mount so the server-rendered page and the browser agree.
  const [phrase, setPhrase] = useState<number | null>(null)

  useEffect(() => {
    setPhrase(randomPhrase())
    const timer = window.setInterval(() => setPhrase((p) => randomPhrase(p ?? undefined)), PHRASE_MS)
    return () => window.clearInterval(timer)
  }, [])

  return (
    <div className="splash" role="status" aria-label="Loading">
      <img className="splash-sloth" src="/sloth.svg" alt="" width={160} height={96} />
      <p className="splash-phrase muted" aria-hidden key={phrase ?? -1}>
        {phrase === null ? ' ' : `${PHRASES[phrase]}…`}
      </p>
    </div>
  )
}

/** A small spinner for buttons that are working. */
export function Spinner() {
  return <span className="spinner" aria-hidden />
}
