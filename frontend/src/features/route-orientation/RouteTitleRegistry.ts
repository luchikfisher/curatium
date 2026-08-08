import { createContext } from 'react'
import type { RouteOrientationId } from './routeOrientation'

export interface RouteTitleRegistration {
  owner: symbol
  routeId: RouteOrientationId
  exhibitionId: number | null
  title: string | null
}

export interface RouteTitleRegistry {
  update: (registration: RouteTitleRegistration) => void
  remove: (owner: symbol) => void
}

export const RouteTitleRegistryContext = createContext<RouteTitleRegistry | null>(null)
