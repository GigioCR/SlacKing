// Every error sets its name: route handlers map errors to HTTP statuses by name
// (app/api/_lib/http.ts), which keeps working across separately bundled copies of these classes.

export class InvalidInputError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InvalidInputError'
  }
}

export class EventNotFoundError extends Error {
  constructor(id: string) {
    super(`Notification ${id} was not found`)
    this.name = 'EventNotFoundError'
  }
}

/** Something the server needs is not set up, e.g. the VAPID keys or the encryption key. */
export class NotConfiguredError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'NotConfiguredError'
  }
}

/** A wrong, expired or already used authenticator code. */
export class WrongCodeError extends Error {
  constructor(message = 'That code is not right. Wait for a new one and try again.') {
    super(message)
    this.name = 'WrongCodeError'
  }
}

/** Too many wrong codes in a row: sign-in is paused for a while. */
export class SignInLockedError extends Error {
  constructor(readonly retryAfterMs: number) {
    const minutes = Math.max(1, Math.ceil(retryAfterMs / 60_000))
    super(`Too many wrong codes. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`)
    this.name = 'SignInLockedError'
  }
}

/** Sign-in was attempted before an authenticator app was linked. */
export class NotEnrolledError extends Error {
  constructor() {
    super('No authenticator app is linked yet. Link one first.')
    this.name = 'NotEnrolledError'
  }
}
