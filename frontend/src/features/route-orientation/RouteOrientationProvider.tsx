import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useMatches, useNavigationType } from 'react-router-dom'
import {
  readRouteOrientationMetadata,
  type RouteOrientationId,
  type RouteOrientationMetadata,
} from './routeOrientation'
import {
  RouteTitleRegistryContext,
  type RouteTitleRegistration,
} from './RouteTitleRegistry'

interface CurrentRoute {
  metadata: RouteOrientationMetadata | null
  exhibitionId: number | null
}

interface RegisteredRouteTitle extends RouteTitleRegistration {
  session: symbol
}

interface RegisteredRouteFocusTarget {
  owner: symbol
  session: symbol
  target: HTMLElement
}

interface RouteTitleRegistryState {
  identity: string
  session: symbol
  registrations: Map<string, RegisteredRouteTitle>
  focusRequested: boolean
  focusTarget: RegisteredRouteFocusTarget | null
  announcement: string
  announcementCompleted: boolean
}

interface RouteFocusIntent {
  session: symbol
  origin: Element | null
  completed: boolean
}

export function RouteOrientationProvider({ children }: { children: React.ReactNode }) {
  const matches = useMatches()
  const navigationType = useNavigationType()
  const currentRoute = currentOrientationRoute(matches)
  const currentIdentity = routeIdentity(currentRoute)
  const [registryState, setRegistryState] = useState<RouteTitleRegistryState>(
    () => createRegistryState(currentIdentity, false),
  )
  const focusIntentRef = useRef<RouteFocusIntent | null>(null)
  let activeRegistryState = registryState
  if (registryState.identity !== currentIdentity) {
    activeRegistryState = createRegistryState(
      currentIdentity,
      navigationType === 'PUSH' || navigationType === 'REPLACE',
    )
    setRegistryState(activeRegistryState)
  }
  const activeSession = activeRegistryState.session

  const update = useCallback((candidate: RegisteredRouteTitle) => {
    setRegistryState((current) => {
      if (
        current.session !== candidate.session
        || current.identity !== registrationKey(candidate.routeId, candidate.exhibitionId)
      ) {
        return current
      }
      const key = registrationKey(candidate.routeId, candidate.exhibitionId)
      const existing = current.registrations.get(key)
      if (existing && existing.owner !== candidate.owner) return current
      if (candidate.title === null) {
        if (!existing) return current
        const next = new Map(current.registrations)
        next.delete(key)
        return { ...current, registrations: next }
      }
      if (
        existing?.title === candidate.title
        && existing.announcement === candidate.announcement
      ) {
        return current
      }
      const next = new Map(current.registrations)
      next.set(key, candidate)
      return { ...current, registrations: next }
    })
  }, [setRegistryState])

  const remove = useCallback((owner: symbol, session: symbol) => {
    setRegistryState((current) => {
      if (current.session !== session) return current
      const entry = [...current.registrations.entries()].find(
        ([, candidate]) => candidate.owner === owner && candidate.session === session,
      )
      if (!entry) return current
      const next = new Map(current.registrations)
      next.delete(entry[0])
      return { ...current, registrations: next }
    })
  }, [setRegistryState])

  const registerFocusTarget = useCallback((candidate: RegisteredRouteFocusTarget) => {
    setRegistryState((current) => {
      if (current.session !== candidate.session) return current
      const existing = current.focusTarget
      if (
        existing
        && existing.owner !== candidate.owner
        && existing.target.isConnected
      ) {
        return current
      }
      if (existing?.owner === candidate.owner && existing.target === candidate.target) return current
      return { ...current, focusTarget: candidate }
    })
  }, [setRegistryState])

  const removeFocusTarget = useCallback((owner: symbol, session: symbol) => {
    setRegistryState((current) => {
      if (
        current.session !== session
        || current.focusTarget?.session !== session
        || current.focusTarget.owner !== owner
      ) {
        return current
      }
      return { ...current, focusTarget: null }
    })
  }, [setRegistryState])

  const registry = useMemo(() => {
    return {
      update: (candidate: RouteTitleRegistration) => update({ ...candidate, session: activeSession }),
      remove: (owner: symbol) => remove(owner, activeSession),
      registerFocusTarget: (owner: symbol, target: HTMLElement) => registerFocusTarget({
        owner,
        target,
        session: activeSession,
      }),
      removeFocusTarget: (owner: symbol) => removeFocusTarget(owner, activeSession),
    }
  }, [activeSession, registerFocusTarget, remove, removeFocusTarget, update])
  const currentRegistration = registeredOrientationForCurrentRoute(activeRegistryState, currentRoute)
  const title = currentRegistration?.title
    ?? currentRoute.metadata?.loadingTitle
    ?? currentRoute.metadata?.staticTitle
    ?? 'Curatium'
  const focusOwner = currentRoute.metadata?.focusOwner ?? null
  const focusRequested = activeRegistryState.focusRequested
  const registeredFocusTarget = activeRegistryState.focusTarget?.target ?? null
  const announcementCandidate = currentRegistration?.announcement
    ?? currentRoute.metadata?.staticAnnouncement
    ?? null
  const announcement = activeRegistryState.announcement
  const announcementCompleted = activeRegistryState.announcementCompleted

  useLayoutEffect(() => {
    document.title = title
  }, [title])

  useEffect(() => {
    if (announcementCompleted || !announcementCandidate) return
    const session = activeSession
    const timeout = window.setTimeout(() => {
      setRegistryState((current) => {
        if (current.session !== session || current.announcementCompleted) return current
        return {
          ...current,
          announcement: announcementCandidate,
          announcementCompleted: true,
        }
      })
    }, 0)
    return () => window.clearTimeout(timeout)
  }, [activeSession, announcementCandidate, announcementCompleted])

  useEffect(() => {
    let intent = focusIntentRef.current
    if (intent?.session !== activeSession) {
      const origin = document.activeElement
      intent = {
        session: activeSession,
        origin,
        completed: !focusRequested || !mayReplaceRouteOrigin(origin),
      }
      focusIntentRef.current = intent
    }
    if (intent.completed) return

    const target = focusOwner === 'gallery'
      ? registeredFocusTarget
      : layoutFocusTarget()
    const cancelWhenFocusMoves = (event: FocusEvent) => {
      if (focusIntentRef.current === intent && event.target !== intent.origin) {
        intent.completed = true
      }
    }
    document.addEventListener('focusin', cancelWhenFocusMoves)

    if (!target?.isConnected) {
      return () => document.removeEventListener('focusin', cancelWhenFocusMoves)
    }

    const timeout = window.setTimeout(() => {
      if (focusIntentRef.current !== intent || intent.completed) return
      const activeElement = document.activeElement
      if (activeElement === target) {
        intent.completed = true
        return
      }
      if (
        activeElement !== intent.origin
        && !(intent.origin && !intent.origin.isConnected && activeElement === document.body)
      ) {
        intent.completed = true
        return
      }
      if (target instanceof HTMLHeadingElement) target.tabIndex = -1
      intent.completed = true
      target.focus()
    }, 0)
    return () => {
      window.clearTimeout(timeout)
      document.removeEventListener('focusin', cancelWhenFocusMoves)
    }
  }, [activeSession, focusOwner, focusRequested, registeredFocusTarget])

  return (
    <RouteTitleRegistryContext.Provider value={registry}>
      <div className="route-announcement" aria-live="polite" aria-atomic="true">
        {announcement}
      </div>
      {children}
    </RouteTitleRegistryContext.Provider>
  )
}

function currentOrientationRoute(matches: ReturnType<typeof useMatches>): CurrentRoute {
  for (let index = matches.length - 1; index >= 0; index -= 1) {
    const match = matches[index]
    const metadata = readRouteOrientationMetadata(match.handle)
    if (metadata) {
      return {
        metadata,
        exhibitionId: parseExhibitionId(match.params.id),
      }
    }
  }
  return { metadata: null, exhibitionId: null }
}

function registeredOrientationForCurrentRoute(
  registryState: RouteTitleRegistryState,
  currentRoute: CurrentRoute,
): RegisteredRouteTitle | null {
  if (!currentRoute.metadata) return null
  const registration = registryState.registrations.get(registrationKey(
    currentRoute.metadata.id,
    currentRoute.exhibitionId,
  ))
  if (
    registration === undefined
    || registration.session !== registryState.session
    || registration.routeId !== currentRoute.metadata?.id
    || registration.exhibitionId !== currentRoute.exhibitionId
  ) {
    return null
  }
  return registration
}

function registrationKey(routeId: RouteOrientationId, exhibitionId: number | null): string {
  return `${routeId}:${exhibitionId ?? 'invalid'}`
}

function routeIdentity(currentRoute: CurrentRoute): string {
  return currentRoute.metadata
    ? registrationKey(currentRoute.metadata.id, currentRoute.exhibitionId)
    : 'unoriented-route'
}

function createRegistryState(identity: string, focusRequested: boolean): RouteTitleRegistryState {
  return {
    identity,
    session: Symbol(`route-title-session:${identity}`),
    registrations: new Map(),
    focusRequested,
    focusTarget: null,
    announcement: '',
    announcementCompleted: false,
  }
}

function mayReplaceRouteOrigin(origin: Element | null): boolean {
  if (!origin || origin === document.body || !origin.isConnected) return true
  const main = document.getElementById('main-content')
  return !main?.contains(origin)
}

function layoutFocusTarget(): HTMLElement | null {
  const main = document.getElementById('main-content')
  return main?.querySelector<HTMLElement>('h1') ?? main
}

function parseExhibitionId(value: string | undefined): number | null {
  if (!value || !/^\d+$/.test(value)) return null
  const exhibitionId = Number(value)
  return Number.isSafeInteger(exhibitionId) && exhibitionId > 0 ? exhibitionId : null
}
