import { useContext, useLayoutEffect, useRef, type RefObject } from 'react'
import { RouteTitleRegistryContext } from './RouteTitleRegistry'

export function useRouteFocusTarget(ref: RefObject<HTMLElement | null>, enabled = true) {
  const registry = useContext(RouteTitleRegistryContext)
  const ownerRef = useRef(Symbol('route-focus-target'))

  useLayoutEffect(() => {
    const target = ref.current
    if (!enabled || !registry || !target) return
    const owner = ownerRef.current
    registry.registerFocusTarget(owner, target)
    return () => registry.removeFocusTarget(owner)
  }, [enabled, ref, registry])
}
