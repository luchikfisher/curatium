import { useContext, useLayoutEffect, useRef } from 'react'
import { RouteTitleRegistryContext } from './RouteTitleRegistry'
import type { RouteOrientationId } from './routeOrientation'

export function useRouteDocumentTitle({
  routeId,
  exhibitionId,
  title,
  announcement = null,
}: {
  routeId: RouteOrientationId
  exhibitionId: number | null
  title: string | null
  announcement?: string | null
}) {
  const registry = useContext(RouteTitleRegistryContext)
  const ownerRef = useRef(Symbol('route-title-registration'))

  useLayoutEffect(() => {
    registry?.update({
      owner: ownerRef.current,
      routeId,
      exhibitionId,
      title,
      announcement,
    })
  }, [announcement, exhibitionId, registry, routeId, title])

  useLayoutEffect(() => () => {
    registry?.remove(ownerRef.current)
  }, [registry])
}
