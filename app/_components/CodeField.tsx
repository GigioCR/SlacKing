'use client'

// The 6-digit code from the authenticator app. Calls `onComplete` as soon as six digits are in,
// so there is nothing else to tap. Android offers codes from SMS or other apps for one-time-code.
export function CodeField({
  value,
  onChange,
  onComplete,
  disabled,
  autoFocus,
}: {
  value: string
  onChange: (value: string) => void
  onComplete: (code: string) => void
  disabled?: boolean
  autoFocus?: boolean
}) {
  return (
    <input
      className="input code-input"
      inputMode="numeric"
      autoComplete="one-time-code"
      pattern="[0-9]*"
      maxLength={6}
      placeholder="000000"
      aria-label="6-digit code"
      value={value}
      disabled={disabled}
      autoFocus={autoFocus}
      onChange={(e) => {
        const digits = e.target.value.replace(/\D/g, '').slice(0, 6)
        onChange(digits)
        if (digits.length === 6) onComplete(digits)
      }}
    />
  )
}
