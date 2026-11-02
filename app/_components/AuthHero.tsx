/** The app's face above the sign-in and linking cards, where there is no tab bar yet. */
export function AuthHero() {
  return (
    <div className="auth-hero">
      <img src="/sloth.svg" alt="" width={170} height={102} />
      <p className="muted">Know when Claude is done, or needs you.</p>
    </div>
  )
}
