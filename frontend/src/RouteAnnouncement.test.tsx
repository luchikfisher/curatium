import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useContext, useLayoutEffect, useRef, useState } from 'react'
import {
  createMemoryRouter,
  Link,
  RouterProvider,
  useParams,
} from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import { AppLayout } from './components/AppLayout'
import {
  RouteTitleRegistryContext,
  type RouteTitleRegistry,
} from './features/route-orientation/RouteTitleRegistry'
import { routeOrientationMetadata } from './features/route-orientation/routeOrientation'
import { useRouteDocumentTitle } from './features/route-orientation/useRouteDocumentTitle'

afterEach(cleanup)

describe('route announcements', () => {
  it('announces each static PUSH exactly once', async () => {
    const user = userEvent.setup()
    const router = createAnnouncementRouter(['/'])
    render(<RouterProvider router={router} />)
    await expectAnnouncement('Exhibitions')
    const liveRegion = routeAnnouncement()
    expect(liveRegion).toHaveAttribute('aria-live', 'polite')
    expect(liveRegion).toHaveAttribute('aria-atomic', 'true')
    const observer = observeAnnouncements()

    await user.click(screen.getByRole('link', { name: 'Curator exhibitions' }))
    await expectAnnouncement('Curator exhibitions')
    await user.click(screen.getByRole('link', { name: 'Create exhibition' }))
    await expectAnnouncement('Create exhibition')

    observer.stop()
    expect(routeAnnouncement()).toBe(liveRegion)
    expect(observer.values).toEqual(['Curator exhibitions', 'Create exhibition'])
  })

  it('waits for one authoritative dynamic announcement on PUSH', async () => {
    let resolveRoute: (() => void) | null = null
    const user = userEvent.setup()
    const router = createAnnouncementRouter(['/'], {
      captureDelayedResolve: (resolve) => { resolveRoute = resolve },
    })
    render(<RouterProvider router={router} />)
    await expectAnnouncement('Exhibitions')
    const observer = observeAnnouncements()

    await user.click(screen.getByRole('link', { name: 'Open delayed metadata' }))
    expect(screen.getByRole('status')).toHaveTextContent('Loading metadata…')
    expect(routeAnnouncement()).toHaveTextContent('')
    expect(observer.values).toEqual([])

    act(() => resolveRoute?.())
    await expectAnnouncement('Metadata for Loaded exhibition')
    observer.stop()
    expect(observer.values).toEqual(['Metadata for Loaded exhibition'])
  })

  it('announces POP once without forcing focus', async () => {
    const router = createAnnouncementRouter(['/', '/exhibitions'])
    render(<RouterProvider router={router} />)
    await expectAnnouncement('Curator exhibitions')
    screen.getByRole('button', { name: 'Keep curator focus' }).focus()
    const observer = observeAnnouncements()

    await act(async () => router.navigate(-1))
    await expectAnnouncement('Exhibitions')
    await act(async () => new Promise((resolve) => window.setTimeout(resolve, 10)))

    observer.stop()
    expect(observer.values).toEqual(['Exhibitions'])
    expect(screen.getByRole('heading', { name: 'Exhibitions' })).not.toHaveFocus()
    expect(document.activeElement).toBe(document.body)
  })

  it('does not announce same-route REPLACE or q/page changes', async () => {
    const router = createAnnouncementRouter(['/exhibitions/1/artworks'])
    render(<RouterProvider router={router} />)
    await expectAnnouncement('Artworks for Collection study')
    const retainedFocus = screen.getByRole('button', { name: 'Keep artwork focus' })
    retainedFocus.focus()
    const observer = observeAnnouncements()

    await act(async () => router.navigate('/exhibitions/1/artworks', {
      replace: true,
      state: { cleanupComplete: true },
    }))
    await act(async () => router.navigate('/exhibitions/1/artworks?q=landscape&page=2'))
    await act(async () => new Promise((resolve) => window.setTimeout(resolve, 10)))

    observer.stop()
    expect(observer.values).toEqual([])
    expect(routeAnnouncement()).toHaveTextContent('Artworks for Collection study')
    expect(retainedFocus).toHaveFocus()
  })

  it('updates a metadata title without replaying route arrival', async () => {
    const user = userEvent.setup()
    const router = createAnnouncementRouter(['/exhibitions/1/edit'])
    render(<RouterProvider router={router} />)
    await expectAnnouncement('Metadata for Original title')
    const observer = observeAnnouncements()

    await user.click(screen.getByRole('button', { name: 'Install authoritative rename' }))
    await waitFor(() => expect(document.title).toBe('Metadata — Renamed exhibition | Curatium'))
    await act(async () => new Promise((resolve) => window.setTimeout(resolve, 10)))

    observer.stop()
    expect(observer.values).toEqual([])
    expect(routeAnnouncement()).toHaveTextContent('Metadata for Original title')
  })

  it('leaves terminal alerts solely responsible for their announcement', async () => {
    const user = userEvent.setup()
    const router = createAnnouncementRouter(['/'])
    render(<RouterProvider router={router} />)
    await expectAnnouncement('Exhibitions')
    const observer = observeAnnouncements()

    await user.click(screen.getByRole('link', { name: 'Open unavailable preview' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Preview unavailable')
    await act(async () => new Promise((resolve) => window.setTimeout(resolve, 10)))

    observer.stop()
    expect(routeAnnouncement()).toHaveTextContent('')
    expect(observer.values).toEqual([])
  })

  it('keeps gallery loading and recovery statuses independent', async () => {
    const user = userEvent.setup()
    const router = createAnnouncementRouter(['/'])
    render(<RouterProvider router={router} />)
    await expectAnnouncement('Exhibitions')

    await user.click(screen.getByRole('link', { name: 'Open gallery' }))
    await expectAnnouncement('Exhibition: Gallery study')
    expect(screen.getByRole('status')).toHaveTextContent('Preparing gallery renderer')
    const observer = observeAnnouncements()

    await user.click(screen.getByRole('button', { name: 'Recover gallery' }))
    expect(screen.getByRole('status')).toHaveTextContent('Gallery renderer recovered')
    await act(async () => new Promise((resolve) => window.setTimeout(resolve, 10)))

    observer.stop()
    expect(observer.values).toEqual([])
    expect(routeAnnouncement()).toHaveTextContent('Exhibition: Gallery study')
  })

  it('rejects stale registration and cleanup from an earlier route session', async () => {
    const captured: Array<{ owner: symbol; registry: RouteTitleRegistry }> = []
    const router = createAnnouncementRouter(['/captured/1'], {
      captureOwner: (owner) => captured.push(owner),
    })
    render(<RouterProvider router={router} />)
    await expectAnnouncement('Metadata for Captured exhibition 1')
    const staleOwner = captured[0]

    await act(async () => router.navigate('/exhibitions'))
    await expectAnnouncement('Curator exhibitions')
    const observer = observeAnnouncements()
    act(() => {
      staleOwner.registry.update({
        owner: staleOwner.owner,
        routeId: 'metadata',
        exhibitionId: 1,
        title: 'Metadata — Stale title | Curatium',
        announcement: 'Metadata for Stale title',
      })
    })
    await act(async () => new Promise((resolve) => window.setTimeout(resolve, 10)))
    expect(observer.values).toEqual([])
    expect(routeAnnouncement()).toHaveTextContent('Curator exhibitions')

    await act(async () => router.navigate('/captured/1'))
    await expectAnnouncement('Metadata for Captured exhibition 1')
    const currentOwner = captured[1]
    act(() => staleOwner.registry.remove(staleOwner.owner))
    await act(async () => new Promise((resolve) => window.setTimeout(resolve, 10)))

    observer.stop()
    expect(currentOwner.owner).not.toBe(staleOwner.owner)
    expect(routeAnnouncement()).toHaveTextContent('Metadata for Captured exhibition 1')
  })
})

function createAnnouncementRouter(
  initialEntries: string[],
  {
    captureDelayedResolve,
    captureOwner,
  }: {
    captureDelayedResolve?: (resolve: () => void) => void
    captureOwner?: (owner: { owner: symbol; registry: RouteTitleRegistry }) => void
  } = {},
) {
  return createMemoryRouter([
    {
      element: <AppLayout />,
      children: [
        {
          path: '/',
          handle: { orientation: routeOrientationMetadata.catalogue },
          element: (
            <StaticPage heading="Exhibitions">
              <Link to="/exhibitions">Curator exhibitions</Link>
              <Link to="/delayed/1">Open delayed metadata</Link>
              <Link to="/terminal/1">Open unavailable preview</Link>
              <Link to="/visit/1">Open gallery</Link>
            </StaticPage>
          ),
        },
        {
          path: '/exhibitions',
          handle: { orientation: routeOrientationMetadata.curatorList },
          element: (
            <StaticPage heading="Curator exhibitions">
              <button type="button">Keep curator focus</button>
              <Link to="/exhibitions/new">Create exhibition</Link>
            </StaticPage>
          ),
        },
        {
          path: '/exhibitions/new',
          handle: { orientation: routeOrientationMetadata.newExhibition },
          element: <StaticPage heading="Create exhibition" />,
        },
        {
          path: '/exhibitions/:id/edit',
          handle: { orientation: routeOrientationMetadata.metadata },
          element: <MetadataAnnouncementPage />,
        },
        {
          path: '/exhibitions/:id/artworks',
          handle: { orientation: routeOrientationMetadata.artworks },
          element: <ArtworkAnnouncementPage />,
        },
        {
          path: '/delayed/:id',
          handle: { orientation: routeOrientationMetadata.metadata },
          element: <DelayedAnnouncementPage captureResolve={captureDelayedResolve} />,
        },
        {
          path: '/terminal/:id',
          handle: { orientation: routeOrientationMetadata.preview },
          element: <TerminalAnnouncementPage />,
        },
        {
          path: '/visit/:id',
          handle: { orientation: routeOrientationMetadata.publicExhibition },
          element: <GalleryAnnouncementPage />,
        },
        {
          path: '/captured/:id',
          handle: { orientation: routeOrientationMetadata.metadata },
          element: <CapturedAnnouncementPage captureOwner={captureOwner} />,
        },
      ],
    },
  ], {
    initialEntries,
    initialIndex: initialEntries.length - 1,
  })
}

function StaticPage({ heading, children }: { heading: string; children?: React.ReactNode }) {
  return <section><h1>{heading}</h1>{children}</section>
}

function MetadataAnnouncementPage() {
  const [title, setTitle] = useState('Original title')
  useRouteDocumentTitle({
    routeId: 'metadata',
    exhibitionId: 1,
    title: `Metadata — ${title} | Curatium`,
    announcement: `Metadata for ${title}`,
  })
  return (
    <section>
      <h1>{title}</h1>
      <button type="button" onClick={() => setTitle('Renamed exhibition')}>
        Install authoritative rename
      </button>
    </section>
  )
}

function ArtworkAnnouncementPage() {
  useRouteDocumentTitle({
    routeId: 'artworks',
    exhibitionId: 1,
    title: 'Artworks — Collection study | Curatium',
    announcement: 'Artworks for Collection study',
  })
  return <section><h1>Collection study</h1><button type="button">Keep artwork focus</button></section>
}

function DelayedAnnouncementPage({ captureResolve }: { captureResolve?: (resolve: () => void) => void }) {
  const [loaded, setLoaded] = useState(false)
  useLayoutEffect(() => captureResolve?.(() => setLoaded(true)), [captureResolve])
  useRouteDocumentTitle({
    routeId: 'metadata',
    exhibitionId: 1,
    title: loaded ? 'Metadata — Loaded exhibition | Curatium' : null,
    announcement: loaded ? 'Metadata for Loaded exhibition' : null,
  })
  return loaded ? <h1>Loaded exhibition</h1> : <p role="status">Loading metadata…</p>
}

function TerminalAnnouncementPage() {
  useRouteDocumentTitle({
    routeId: 'preview',
    exhibitionId: 1,
    title: 'Preview unavailable | Curatium',
    announcement: null,
  })
  return <p role="alert">Preview unavailable</p>
}

function GalleryAnnouncementPage() {
  const [status, setStatus] = useState('Preparing gallery renderer')
  useRouteDocumentTitle({
    routeId: 'public-exhibition',
    exhibitionId: 1,
    title: 'Gallery study | Curatium',
    announcement: 'Exhibition: Gallery study',
  })
  return (
    <section>
      <h1>Gallery study</h1>
      <p role="status">{status}</p>
      <button type="button" onClick={() => setStatus('Gallery renderer recovered')}>Recover gallery</button>
    </section>
  )
}

function CapturedAnnouncementPage({
  captureOwner,
}: {
  captureOwner?: (owner: { owner: symbol; registry: RouteTitleRegistry }) => void
}) {
  const registry = useContext(RouteTitleRegistryContext)
  const ownerRef = useRef(Symbol('captured-announcement-owner'))
  const exhibitionId = Number(useParams().id)
  useLayoutEffect(() => {
    if (!registry) return
    const owner = ownerRef.current
    captureOwner?.({ owner, registry })
    registry.update({
      owner,
      routeId: 'metadata',
      exhibitionId,
      title: `Metadata — Captured exhibition ${exhibitionId} | Curatium`,
      announcement: `Metadata for Captured exhibition ${exhibitionId}`,
    })
    return () => registry.remove(owner)
  }, [captureOwner, exhibitionId, registry])
  return <h1>Captured exhibition {exhibitionId}</h1>
}

function routeAnnouncement(): HTMLElement {
  const region = document.querySelector<HTMLElement>('.route-announcement')
  if (!region) throw new Error('Route announcement region was not rendered.')
  return region
}

async function expectAnnouncement(value: string) {
  await waitFor(() => expect(routeAnnouncement()).toHaveTextContent(value))
}

function observeAnnouncements() {
  const values: string[] = []
  const region = routeAnnouncement()
  const observer = new MutationObserver(() => {
    const value = region.textContent?.trim() ?? ''
    if (value && values.at(-1) !== value) values.push(value)
  })
  observer.observe(region, { childList: true, characterData: true, subtree: true })
  return {
    values,
    stop: () => observer.disconnect(),
  }
}
