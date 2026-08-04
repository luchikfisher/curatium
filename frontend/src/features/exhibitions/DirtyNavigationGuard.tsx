import { useEffect, useRef } from 'react'
import type { DirtyNavigationController } from './useDirtyNavigation'

export function DirtyNavigationConfirmation({
  navigation,
}: {
  navigation: DirtyNavigationController
}) {
  const dialogRef = useRef<HTMLDivElement | null>(null)
  const stayButtonRef = useRef<HTMLButtonElement | null>(null)
  const discardButtonRef = useRef<HTMLButtonElement | null>(null)
  const returnFocusRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!navigation.blocked) return
    const activeElement = document.activeElement
    if (activeElement instanceof HTMLElement && !dialogRef.current?.contains(activeElement)) {
      returnFocusRef.current = activeElement
    }
    stayButtonRef.current?.focus()
  }, [navigation.blocked])

  if (!navigation.blocked) return null

  function stay() {
    const returnTarget = returnFocusRef.current
    navigation.stay()
    window.setTimeout(() => {
      if (returnTarget?.isConnected) returnTarget.focus({ preventScroll: true })
      else document.getElementById('main-content')?.focus({ preventScroll: true })
    }, 0)
  }

  function discard() {
    returnFocusRef.current = null
    navigation.discard()
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.preventDefault()
      stay()
      return
    }
    if (event.key !== 'Tab') return
    const first = stayButtonRef.current
    const last = discardButtonRef.current
    if (!first || !last) return
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  return (
    <div className="dirty-navigation-backdrop">
      <div
        ref={dialogRef}
        className="dirty-navigation-confirmation"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="dirty-navigation-heading"
        aria-describedby="dirty-navigation-description"
        onKeyDown={handleKeyDown}
      >
        <h2 id="dirty-navigation-heading">Discard unsaved changes?</h2>
        <p id="dirty-navigation-description">
          You have changes that have not been saved. Stay here to keep editing, or discard them and continue.
        </p>
        <div className="dirty-navigation-confirmation__actions">
          <button ref={stayButtonRef} className="button" type="button" onClick={stay}>Stay</button>
          <button ref={discardButtonRef} className="button button-danger" type="button" onClick={discard}>Discard changes</button>
        </div>
      </div>
    </div>
  )
}
