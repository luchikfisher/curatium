export type RouteOrientationId =
  | 'catalogue'
  | 'curator-list'
  | 'new-exhibition'
  | 'metadata'
  | 'artworks'
  | 'preview'
  | 'public-exhibition'
  | 'not-found'

export interface RouteOrientationMetadata {
  id: RouteOrientationId
  staticTitle: string
  loadingTitle?: string
  staticAnnouncement?: string
  focusOwner: 'layout' | 'gallery'
}

export interface RouteOrientationHandle {
  orientation: RouteOrientationMetadata
}

export const routeOrientationMetadata = {
  catalogue: {
    id: 'catalogue',
    staticTitle: 'Exhibitions | Curatium',
    staticAnnouncement: 'Exhibitions',
    focusOwner: 'layout',
  },
  curatorList: {
    id: 'curator-list',
    staticTitle: 'Curator exhibitions | Curatium',
    staticAnnouncement: 'Curator exhibitions',
    focusOwner: 'layout',
  },
  newExhibition: {
    id: 'new-exhibition',
    staticTitle: 'Create exhibition | Curatium',
    staticAnnouncement: 'Create exhibition',
    focusOwner: 'layout',
  },
  metadata: {
    id: 'metadata',
    staticTitle: 'Exhibition metadata | Curatium',
    loadingTitle: 'Loading exhibition metadata | Curatium',
    focusOwner: 'layout',
  },
  artworks: {
    id: 'artworks',
    staticTitle: 'Exhibition artworks | Curatium',
    loadingTitle: 'Loading exhibition artworks | Curatium',
    focusOwner: 'layout',
  },
  preview: {
    id: 'preview',
    staticTitle: 'Curator preview | Curatium',
    loadingTitle: 'Loading curator preview | Curatium',
    focusOwner: 'gallery',
  },
  publicExhibition: {
    id: 'public-exhibition',
    staticTitle: 'Exhibition | Curatium',
    loadingTitle: 'Loading exhibition | Curatium',
    focusOwner: 'gallery',
  },
  notFound: {
    id: 'not-found',
    staticTitle: 'Page not found | Curatium',
    staticAnnouncement: 'Page not found',
    focusOwner: 'layout',
  },
} satisfies Record<string, RouteOrientationMetadata>

export function readRouteOrientationMetadata(handle: unknown): RouteOrientationMetadata | null {
  if (!isRecord(handle) || !isRecord(handle.orientation)) return null
  const orientation = handle.orientation
  if (
    !isRouteOrientationId(orientation.id)
    || typeof orientation.staticTitle !== 'string'
    || (orientation.loadingTitle !== undefined && typeof orientation.loadingTitle !== 'string')
    || (orientation.staticAnnouncement !== undefined && typeof orientation.staticAnnouncement !== 'string')
    || (orientation.focusOwner !== 'layout' && orientation.focusOwner !== 'gallery')
  ) {
    return null
  }
  return orientation as unknown as RouteOrientationMetadata
}

function isRouteOrientationId(value: unknown): value is RouteOrientationId {
  return value === 'catalogue'
    || value === 'curator-list'
    || value === 'new-exhibition'
    || value === 'metadata'
    || value === 'artworks'
    || value === 'preview'
    || value === 'public-exhibition'
    || value === 'not-found'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
