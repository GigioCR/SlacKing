import { createHash, timingSafeEqual } from 'node:crypto'

/**
 * Constant-time comparison. Refuses everything when the expected secret is not configured,
 * so a missing setting never leaves a door open.
 */
export function secretsMatch(expected: string | null, provided: string | null | undefined): boolean {
  if (!expected || !provided) return false
  const a = createHash('sha256').update(expected).digest()
  const b = createHash('sha256').update(provided).digest()
  return timingSafeEqual(a, b)
}
