import { useCallback, useEffect, useRef } from 'react'
import { useBlocker, useNavigate } from 'react-router-dom'

interface RouterLocation {
  pathname: string
  search: string
  hash: string
  state: unknown
}

interface RetainedTransition {
  destination: string
  state: unknown
}

export interface DirtyNavigationController {
  blocked: boolean
  allowNextNavigation: (destination: string) => void
  discard: () => void
  stay: () => void
}

export function useDirtyNavigation(isDirty: boolean): DirtyNavigationController {
  const navigate = useNavigate()
  const allowedDestinationRef = useRef<string | null>(null)
  const retainedTransitionRef = useRef<RetainedTransition | null>(null)

  const focusDestination = useCallback(() => {
    window.setTimeout(() => {
      document.getElementById('main-content')?.focus({ preventScroll: true })
    }, 0)
  }, [])

  const locationDestination = useCallback((location: RouterLocation) => (
    `${location.pathname}${location.search}${location.hash}`
  ), [])

  const shouldBlock = useCallback(({ currentLocation, nextLocation }: {
    currentLocation: RouterLocation
    nextLocation: RouterLocation
  }) => {
    const nextDestination = locationDestination(nextLocation)
    if (allowedDestinationRef.current === nextDestination) {
      allowedDestinationRef.current = null
      return false
    }

    const changesRoute = locationDestination(currentLocation) !== nextDestination
    if (!changesRoute || !isDirty) return false

    if (retainedTransitionRef.current === null) {
      retainedTransitionRef.current = {
        destination: nextDestination,
        state: nextLocation.state,
      }
    }
    return true
  }, [isDirty, locationDestination])

  const blocker = useBlocker(shouldBlock)

  const proceedRetainedTransition = useCallback(() => {
    const retainedTransition = retainedTransitionRef.current
    if (!retainedTransition) return

    retainedTransitionRef.current = null
    if (
      blocker.state === 'blocked'
      && locationDestination(blocker.location) === retainedTransition.destination
    ) {
      blocker.proceed()
      focusDestination()
      return
    }

    allowedDestinationRef.current = retainedTransition.destination
    if (blocker.state === 'blocked') blocker.reset()
    navigate(retainedTransition.destination, { state: retainedTransition.state })
    focusDestination()
  }, [blocker, focusDestination, locationDestination, navigate])

  useEffect(() => {
    if (!isDirty) return
    const preventUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = true
    }
    window.addEventListener('beforeunload', preventUnload)
    return () => window.removeEventListener('beforeunload', preventUnload)
  }, [isDirty])

  useEffect(() => {
    if (!isDirty && retainedTransitionRef.current !== null) proceedRetainedTransition()
  }, [isDirty, proceedRetainedTransition])

  useEffect(() => () => {
    allowedDestinationRef.current = null
    retainedTransitionRef.current = null
  }, [])

  const allowNextNavigation = useCallback((destination: string) => {
    allowedDestinationRef.current = destination
    queueMicrotask(() => {
      if (allowedDestinationRef.current === destination) allowedDestinationRef.current = null
    })
  }, [])

  const stay = useCallback(() => {
    retainedTransitionRef.current = null
    if (blocker.state === 'blocked') blocker.reset()
  }, [blocker])

  const discard = useCallback(() => {
    proceedRetainedTransition()
  }, [proceedRetainedTransition])

  return {
    blocked: blocker.state === 'blocked',
    allowNextNavigation,
    discard,
    stay,
  }
}
