import { useCallback, useLayoutEffect, useMemo, useState } from 'react'
import { useMatches } from 'react-router-dom'
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

interface RouteTitleRegistryState {
  identity: string
  session: symbol
  registrations: Map<string, RegisteredRouteTitle>
}

export function RouteOrientationProvider({ children }: { children: React.ReactNode }) {
  const matches = useMatches()
  const currentRoute = currentOrientationRoute(matches)
  const currentIdentity = routeIdentity(currentRoute)
  const [registryState, setRegistryState] = useState<RouteTitleRegistryState>(
    () => createRegistryState(currentIdentity),
  )
  let activeRegistryState = registryState
  if (registryState.identity !== currentIdentity) {
    activeRegistryState = createRegistryState(currentIdentity)
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
      if (existing?.title === candidate.title) return current
      const next = new Map(current.registrations)
      next.set(key, candidate)
      return { ...current, registrations: next }
    })
  }, [])

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
  }, [])

  const registry = useMemo(() => {
    return {
      update: (candidate: RouteTitleRegistration) => update({ ...candidate, session: activeSession }),
      remove: (owner: symbol) => remove(owner, activeSession),
    }
  }, [activeSession, remove, update])
  const title = registeredTitleForCurrentRoute(activeRegistryState, currentRoute)
    ?? currentRoute.metadata?.loadingTitle
    ?? currentRoute.metadata?.staticTitle
    ?? 'Curatium'

  useLayoutEffect(() => {
    document.title = title
  }, [title])

  return (
    <RouteTitleRegistryContext.Provider value={registry}>
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

function registeredTitleForCurrentRoute(
  registryState: RouteTitleRegistryState,
  currentRoute: CurrentRoute,
): string | null {
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
  return registration.title
}

function registrationKey(routeId: RouteOrientationId, exhibitionId: number | null): string {
  return `${routeId}:${exhibitionId ?? 'invalid'}`
}

function routeIdentity(currentRoute: CurrentRoute): string {
  return currentRoute.metadata
    ? registrationKey(currentRoute.metadata.id, currentRoute.exhibitionId)
    : 'unoriented-route'
}

function createRegistryState(identity: string): RouteTitleRegistryState {
  return {
    identity,
    session: Symbol(`route-title-session:${identity}`),
    registrations: new Map(),
  }
}

function parseExhibitionId(value: string | undefined): number | null {
  if (!value || !/^\d+$/.test(value)) return null
  const exhibitionId = Number(value)
  return Number.isSafeInteger(exhibitionId) && exhibitionId > 0 ? exhibitionId : null
}
