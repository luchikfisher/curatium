import { act, cleanup, render, waitFor } from '@testing-library/react'
import { useContext, useLayoutEffect, useRef } from 'react'
import {
  createMemoryRouter,
  Outlet,
  RouterProvider,
  useParams,
} from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import { RouteOrientationProvider } from './RouteOrientationProvider'
import {
  RouteTitleRegistryContext,
  type RouteTitleRegistry,
} from './RouteTitleRegistry'
import {
  routeOrientationMetadata,
  type RouteOrientationId,
} from './routeOrientation'

interface CapturedOwner {
  owner: symbol
  registry: RouteTitleRegistry
}

afterEach(cleanup)

describe('route title registry lifecycle', () => {
  it('rejects a late registration from an old visit and protects the fresh owner', async () => {
    const metadataOwners: CapturedOwner[] = []
    const router = createTestRouter({
      onMetadataOwner: (owner) => metadataOwners.push(owner),
    })

    render(<RouterProvider router={router} />)
    await waitFor(() => expect(document.title).toBe('Metadata owner 1 | Curatium'))
    const firstVisit = metadataOwners[0]

    await act(async () => router.navigate('/artworks/1'))
    await waitFor(() => expect(document.title).toBe('Artworks owner 1 | Curatium'))

    act(() => {
      firstVisit.registry.update({
        owner: firstVisit.owner,
        routeId: 'metadata',
        exhibitionId: 1,
        title: 'Late metadata owner | Curatium',
        announcement: null,
      })
    })
    expect(document.title).toBe('Artworks owner 1 | Curatium')

    await act(async () => router.navigate('/metadata/1'))
    await waitFor(() => expect(document.title).toBe('Metadata owner 1 | Curatium'))
    const secondVisit = metadataOwners[1]
    expect(secondVisit.owner).not.toBe(firstVisit.owner)

    act(() => {
      firstVisit.registry.update({
        owner: firstVisit.owner,
        routeId: 'metadata',
        exhibitionId: 1,
        title: 'Older session title | Curatium',
        announcement: null,
      })
      firstVisit.registry.remove(firstVisit.owner)
    })
    expect(document.title).toBe('Metadata owner 1 | Curatium')

    act(() => {
      secondVisit.registry.update({
        owner: secondVisit.owner,
        routeId: 'metadata',
        exhibitionId: 1,
        title: 'Authoritative rename | Curatium',
        announcement: null,
      })
    })
    expect(document.title).toBe('Authoritative rename | Curatium')
  })

  it('rejects a registration for a different exhibition identity', async () => {
    const metadataOwners: CapturedOwner[] = []
    const router = createTestRouter({
      onMetadataOwner: (owner) => metadataOwners.push(owner),
    })

    render(<RouterProvider router={router} />)
    await waitFor(() => expect(document.title).toBe('Metadata owner 1 | Curatium'))
    const currentOwner = metadataOwners[0]

    act(() => {
      currentOwner.registry.update({
        owner: Symbol('wrong-exhibition-owner'),
        routeId: 'metadata',
        exhibitionId: 2,
        title: 'Injected exhibition title | Curatium',
        announcement: null,
      })
    })

    await act(async () => router.navigate('/metadata/2'))
    await waitFor(() => expect(document.title).toBe('Metadata owner 2 | Curatium'))
  })

  it('keeps the active session through query and location-state replacements', async () => {
    const metadataOwners: CapturedOwner[] = []
    const router = createTestRouter({
      onMetadataOwner: (owner) => metadataOwners.push(owner),
    })

    render(<RouterProvider router={router} />)
    await waitFor(() => expect(document.title).toBe('Metadata owner 1 | Curatium'))
    const activeOwner = metadataOwners[0]

    await act(async () => router.navigate('/metadata/1?q=landscape&page=2'))
    await act(async () => router.navigate('/metadata/1?q=landscape&page=2', {
      replace: true,
      state: { acknowledgementConsumed: true },
    }))

    expect(metadataOwners).toHaveLength(1)
    act(() => {
      activeOwner.registry.update({
        owner: activeOwner.owner,
        routeId: 'metadata',
        exhibitionId: 1,
        title: 'Same-session update | Curatium',
        announcement: null,
      })
    })
    expect(document.title).toBe('Same-session update | Curatium')
  })
})

function createTestRouter({
  onMetadataOwner,
}: {
  onMetadataOwner: (owner: CapturedOwner) => void
}) {
  return createMemoryRouter([
    {
      path: '/',
      element: (
        <RouteOrientationProvider>
          <Outlet />
        </RouteOrientationProvider>
      ),
      children: [
        {
          path: 'metadata/:id',
          handle: { orientation: routeOrientationMetadata.metadata },
          element: (
            <RegistryOwner
              key="metadata-owner"
              routeId="metadata"
              titlePrefix="Metadata owner"
              onOwner={onMetadataOwner}
            />
          ),
        },
        {
          path: 'artworks/:id',
          handle: { orientation: routeOrientationMetadata.artworks },
          element: (
            <RegistryOwner
              key="artworks-owner"
              routeId="artworks"
              titlePrefix="Artworks owner"
            />
          ),
        },
      ],
    },
  ], { initialEntries: ['/metadata/1'] })
}

function RegistryOwner({
  routeId,
  titlePrefix,
  onOwner,
}: {
  routeId: RouteOrientationId
  titlePrefix: string
  onOwner?: (owner: CapturedOwner) => void
}) {
  const registry = useContext(RouteTitleRegistryContext)
  const owner = useRef(Symbol(`${routeId}-test-owner`))
  const exhibitionId = Number(useParams().id)

  useLayoutEffect(() => {
    if (!registry) return
    const currentOwner = owner.current
    onOwner?.({ owner: currentOwner, registry })
    registry.update({
      owner: currentOwner,
      routeId,
      exhibitionId,
      title: `${titlePrefix} ${exhibitionId} | Curatium`,
      announcement: null,
    })
    return () => registry.remove(currentOwner)
  }, [exhibitionId, onOwner, registry, routeId, titlePrefix])

  return null
}
