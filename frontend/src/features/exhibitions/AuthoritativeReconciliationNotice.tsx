import { useEffect, useRef } from 'react'

export type AuthoritativeReconciliationPhase = 'idle' | 'loading' | 'reconciled' | 'failed'

export function AuthoritativeReconciliationNotice({
  phase,
  onRetry,
  initialFocusOriginRef,
}: {
  phase: AuthoritativeReconciliationPhase
  onRetry: () => void
  initialFocusOriginRef: React.RefObject<HTMLElement | null>
}) {
  const retryRequested = useRef(false)
  const handledInitialFocusOrigin = useRef<HTMLElement | null>(null)
  const statusRef = useRef<HTMLParagraphElement | null>(null)
  const retryButtonRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    if (retryRequested.current) {
      if (phase === 'loading' || phase === 'reconciled') {
        statusRef.current?.focus({ preventScroll: true })
        if (phase === 'reconciled') retryRequested.current = false
      } else if (phase === 'failed') {
        retryButtonRef.current?.focus({ preventScroll: true })
      }
      return
    }

    if (phase === 'loading') {
      handledInitialFocusOrigin.current = null
      return
    }
    const initialFocusOrigin = initialFocusOriginRef.current
    if (
      (phase !== 'reconciled' && phase !== 'failed')
      || initialFocusOrigin === null
      || handledInitialFocusOrigin.current === initialFocusOrigin
    ) {
      return
    }

    handledInitialFocusOrigin.current = initialFocusOrigin
    const activeElement = document.activeElement
    const focusMovedElsewhere = activeElement !== document.body && activeElement !== initialFocusOrigin
    if (focusMovedElsewhere) return

    const originBecameUnavailable = !initialFocusOrigin.isConnected
      || initialFocusOrigin.matches(':disabled')
      || initialFocusOrigin.getAttribute('aria-disabled') === 'true'
      || activeElement === document.body
    if (!originBecameUnavailable) return

    if (phase === 'reconciled') {
      statusRef.current?.focus({ preventScroll: true })
    } else {
      retryButtonRef.current?.focus({ preventScroll: true })
    }
  }, [initialFocusOriginRef, phase])

  function retry() {
    retryRequested.current = true
    onRetry()
  }

  if (phase === 'idle') return null

  if (phase === 'loading') {
    return (
      <p ref={statusRef} className="form-alert" role="status" tabIndex={-1}>
        Your attempted change was not saved because this exhibition is now published. Loading the committed published version…
      </p>
    )
  }

  if (phase === 'reconciled') {
    return (
      <p ref={statusRef} className="form-alert" role="status" tabIndex={-1}>
        Your attempted change was not saved because this exhibition is now published. The committed published version is shown below.
      </p>
    )
  }

  return (
    <div className="form-alert authoritative-reconciliation" role="alert">
      <p>
        Your attempted change was not saved. Curatium could not reload the published version, so the displayed information may be stale or unsaved.
      </p>
      <button ref={retryButtonRef} className="button button-secondary" type="button" onClick={retry}>
        Retry loading committed version
      </button>
    </div>
  )
}
