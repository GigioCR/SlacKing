'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'

// One short message at a time, above the tab bar, optionally with an action such as Undo.

export interface ToastOptions {
  message: string
  action?: { label: string; onClick: () => void }
  /** How long it stays; actions get longer by default. */
  durationMs?: number
  tone?: 'default' | 'error'
}

interface ShownToast extends ToastOptions {
  id: number
}

const ToastContext = createContext<(toast: ToastOptions) => void>(() => {})

export function useToast(): (toast: ToastOptions) => void {
  return useContext(ToastContext)
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ShownToast | null>(null)
  const timer = useRef<number | null>(null)
  const nextId = useRef(1)

  const show = useCallback((options: ToastOptions) => {
    if (timer.current) window.clearTimeout(timer.current)
    const id = nextId.current++
    setToast({ ...options, id })
    timer.current = window.setTimeout(
      () => setToast((t) => (t?.id === id ? null : t)),
      options.durationMs ?? (options.action ? 5_000 : 3_000),
    )
  }, [])

  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current)
  }, [])

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="toast-region" role="status" aria-live="polite">
        {toast && (
          <div key={toast.id} className={toast.tone === 'error' ? 'toast error' : 'toast'}>
            <span>{toast.message}</span>
            {toast.action && (
              <button
                type="button"
                className="toast-action"
                onClick={() => {
                  toast.action?.onClick()
                  setToast(null)
                }}
              >
                {toast.action.label}
              </button>
            )}
          </div>
        )}
      </div>
    </ToastContext.Provider>
  )
}
