import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useContext, useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  createMemoryRouter,
  Link,
  RouterProvider,
  useParams,
} from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppLayout } from './components/AppLayout'
import { DirtyNavigationConfirmation } from './features/exhibitions/DirtyNavigationGuard'
import { useDirtyNavigation } from './features/exhibitions/useDirtyNavigation'
import {
  RouteTitleRegistryContext,
  type RouteTitleRegistry,
} from './features/route-orientation/RouteTitleRegistry'
import { routeOrientationMetadata } from './features/route-orientation/routeOrientation'
import { useRouteFocusTarget } from './features/route-orientation/useRouteFocusTarget'
import { ExhibitionPreviewPage } from './pages/ExhibitionPreviewPage'
import { PublicExhibitionPage } from './pages/PublicExhibitionPage'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('semantic route focus', () => {
  it('focuses layout routes and then yields preview focus to the gallery shell', async () => {
    const user = userEvent.setup()
    const router = createFocusRouter(['/exhibitions'])
    render(<RouterProvider router={router} />)

    await user.click(screen.getByRole('link', { name: 'Edit exhibition' }))
    const metadataHeading = await screen.findByRole('heading', { name: 'Edit exhibition' })
    await waitFor(() => expect(metadataHeading).toHaveFocus())
    expect(metadataHeading).toHaveAttribute('tabindex', '-1')

    await user.click(screen.getByRole('link', { name: 'Artworks' }))
    const artworksHeading = screen.getByRole('heading', { name: 'Curate artworks' })
    await waitFor(() => expect(artworksHeading).toHaveFocus())

    const focusEvents = recordFocusEvents()
    await user.click(screen.getByRole('link', { name: 'Preview & publish' }))
    const previewGallery = screen.getByRole('region', { name: 'Preview gallery' })
    const previewHeading = screen.getByRole('heading', { name: 'Preview exhibition' })
    await waitFor(() => expect(previewGallery).toHaveFocus())
    focusEvents.stop()
    expect(focusEvents.elements.filter((element) => (
      element === previewGallery
      || element === previewHeading
      || element === document.getElementById('main-content')
    ))).toEqual([previewGallery])
    expect(document.activeElement).not.toBe(document.body)
  })

  it('focuses gallery-owned public and curator-return destinations', async () => {
    const user = userEvent.setup()
    const router = createFocusRouter(['/'])
    render(<RouterProvider router={router} />)

    await user.click(screen.getByRole('link', { name: 'Enter exhibition' }))
    const publicGallery = screen.getByRole('region', { name: 'Public exhibition gallery' })
    await waitFor(() => expect(publicGallery).toHaveFocus())

    await user.click(screen.getByRole('link', { name: 'Return to curator preview' }))
    const previewGallery = screen.getByRole('region', { name: 'Preview gallery' })
    await waitFor(() => expect(previewGallery).toHaveFocus())

    await user.click(screen.getByRole('link', { name: 'View public exhibition' }))
    await waitFor(() => expect(screen.getByRole('region', { name: 'Public exhibition gallery' })).toHaveFocus())
  })

  it('moves persistent header navigation to the destination page context', async () => {
    const user = userEvent.setup()
    const router = createFocusRouter(['/exhibitions/1/edit'])
    render(<RouterProvider router={router} />)

    const visitLink = screen.getByRole('link', { name: 'Visit' })
    await user.click(visitLink)
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Catalogue' })).toHaveFocus())

    await user.click(screen.getByRole('link', { name: 'Curate' }))
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Curator exhibitions' })).toHaveFocus())
  })

  it('ignores same-route replacements but treats a cross-route replacement as forward navigation', async () => {
    const router = createFocusRouter(['/exhibitions/1/edit'])
    render(<RouterProvider router={router} />)
    const retainedControl = screen.getByRole('button', { name: 'Keep focus' })
    retainedControl.focus()

    await act(async () => router.navigate('/exhibitions/1/edit', {
      replace: true,
      state: { acknowledgementConsumed: true },
    }))
    expect(retainedControl).toHaveFocus()

    await act(async () => router.navigate('/exhibitions/1/artworks', { replace: true }))
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Curate artworks' })).toHaveFocus())
  })

  it('does not force focus on ordinary POP navigation', async () => {
    const router = createFocusRouter([
      '/exhibitions',
      '/exhibitions/1/edit',
    ])
    render(<RouterProvider router={router} />)
    screen.getByRole('button', { name: 'Keep focus' }).focus()

    await act(async () => router.navigate(-1))
    await screen.findByRole('heading', { name: 'Curator exhibitions' })
    await act(async () => new Promise((resolve) => window.setTimeout(resolve, 10)))
    expect(screen.getByRole('heading', { name: 'Curator exhibitions' })).not.toHaveFocus()
    expect(document.activeElement).toBe(document.body)
  })

  it('does not force gallery focus on ordinary POP navigation', async () => {
    const router = createFocusRouter([
      '/visit/1',
      '/exhibitions/1/edit',
    ])
    render(<RouterProvider router={router} />)
    screen.getByRole('button', { name: 'Keep focus' }).focus()

    await act(async () => router.navigate(-1))
    const publicGallery = await screen.findByRole('region', { name: 'Public exhibition gallery' })
    await act(async () => new Promise((resolve) => window.setTimeout(resolve, 10)))

    expect(publicGallery).not.toHaveFocus()
    expect(document.activeElement).toBe(document.body)
  })

  it('preserves dirty-navigation focus after an approved POP', async () => {
    const user = userEvent.setup()
    const router = createFocusRouter([
      '/exhibitions',
      '/exhibitions/1/edit',
    ])
    render(<RouterProvider router={router} />)
    await user.type(screen.getByRole('textbox', { name: 'Unsaved note' }), 'Unsaved')

    const backNavigation = router.navigate(-1)
    await user.click(await screen.findByRole('button', { name: 'Discard changes' }))
    await backNavigation

    await screen.findByRole('heading', { name: 'Curator exhibitions' })
    await waitFor(() => expect(document.getElementById('main-content')).toHaveFocus())
  })

  it('does not override a meaningful destination focus owner', async () => {
    const user = userEvent.setup()
    const router = createFocusRouter(['/exhibitions'])
    render(<RouterProvider router={router} />)

    await user.click(screen.getByRole('link', { name: 'Open owned focus route' }))
    const status = screen.getByRole('status', { name: 'Authoritative destination status' })
    await waitFor(() => expect(status).toHaveFocus())
    expect(screen.getByRole('heading', { name: 'Feature-owned destination' })).not.toHaveFocus()
  })

  it('does not steal focus moved while a gallery target is delayed', async () => {
    let revealGallery: (() => void) | null = null
    const router = createFocusRouter(['/exhibitions/1/edit'], undefined, (reveal) => {
      revealGallery = reveal
    })
    render(<RouterProvider router={router} />)

    await act(async () => router.navigate('/delayed-gallery/1'))
    const loadingControl = screen.getByRole('button', { name: 'Use loading controls' })
    loadingControl.focus()
    expect(loadingControl).toHaveFocus()

    act(() => revealGallery?.())
    const delayedGallery = await screen.findByRole('region', { name: 'Delayed gallery' })
    await act(async () => new Promise((resolve) => window.setTimeout(resolve, 10)))

    expect(delayedGallery).not.toHaveFocus()
    expect(loadingControl).toHaveFocus()
  })

  it.each([
    ['preview', '/exhibitions/1/preview', 'We could not load this preview', 503],
    ['public', '/visit/1', 'Exhibition not found', 404],
  ] as const)('focuses the %s terminal heading after a gallery PUSH', async (kind, path, heading, status) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      code: status === 404 ? 'EXHIBITION_NOT_FOUND' : 'SERVICE_UNAVAILABLE',
      message: status === 404 ? 'Exhibition not found.' : 'Exhibition unavailable.',
      fieldErrors: [],
      timestamp: '2026-08-08T12:00:00Z',
    }), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })))
    const router = createTerminalRouter(kind, path)
    render(<RouterProvider router={router} />)

    await userEvent.click(screen.getByRole('link', { name: 'Open terminal route' }))
    const terminalHeading = await screen.findByRole('heading', { name: heading })
    await waitFor(() => expect(terminalHeading).toHaveFocus())

    expect(terminalHeading).toHaveAttribute('tabindex', '-1')
    expect(document.activeElement).not.toBe(document.body)
  })

  it('ignores stale gallery registration and cleanup from an earlier semantic session', async () => {
    const capturedRegistries: RouteTitleRegistry[] = []
    const router = createFocusRouter(['/exhibitions/1/edit'], (registry) => {
      capturedRegistries.push(registry)
    })
    render(<RouterProvider router={router} />)

    await act(async () => router.navigate('/pending-gallery/1'))
    await screen.findByRole('heading', { name: 'Pending gallery' })
    const staleRegistry = capturedRegistries[0]

    await act(async () => router.navigate('/pending-gallery/2'))
    await screen.findByText('Exhibition 2 is loading.')
    await waitFor(() => expect(capturedRegistries.length).toBeGreaterThanOrEqual(2))
    const currentRegistry = capturedRegistries.at(-1)!
    const sharedOwner = Symbol('shared-gallery-target-owner')
    const currentTarget = document.createElement('div')
    currentTarget.tabIndex = -1
    document.body.append(currentTarget)
    act(() => {
      currentRegistry.registerFocusTarget(sharedOwner, currentTarget)
      staleRegistry.removeFocusTarget(sharedOwner)
    })
    await waitFor(() => expect(currentTarget).toHaveFocus())

    await act(async () => router.navigate('/exhibitions'))
    const destinationHeading = screen.getByRole('heading', { name: 'Curator exhibitions' })
    await waitFor(() => expect(destinationHeading).toHaveFocus())

    const staleTarget = document.createElement('div')
    staleTarget.tabIndex = -1
    document.body.append(staleTarget)
    act(() => staleRegistry.registerFocusTarget(Symbol('stale-gallery-target'), staleTarget))
    await act(async () => new Promise((resolve) => window.setTimeout(resolve, 10)))

    expect(destinationHeading).toHaveFocus()
    currentTarget.remove()
    staleTarget.remove()
  })
})

function createFocusRouter(
  initialEntries: string[],
  capturePendingRegistry?: (registry: RouteTitleRegistry) => void,
  captureDelayedReveal?: (reveal: () => void) => void,
) {
  return createMemoryRouter([
    {
      element: <AppLayout />,
      children: [
        {
          path: '/',
          handle: { orientation: routeOrientationMetadata.catalogue },
          element: (
            <TestPage heading="Catalogue">
              <Link to="/visit/1">Enter exhibition</Link>
            </TestPage>
          ),
        },
        {
          path: '/exhibitions',
          handle: { orientation: routeOrientationMetadata.curatorList },
          element: (
            <TestPage heading="Curator exhibitions">
              <Link to="/exhibitions/1/edit">Edit exhibition</Link>
              <Link to="/owned-focus">Open owned focus route</Link>
            </TestPage>
          ),
        },
        {
          path: '/exhibitions/:id/edit',
          handle: { orientation: routeOrientationMetadata.metadata },
          element: <MetadataTestPage />,
        },
        {
          path: '/exhibitions/:id/artworks',
          handle: { orientation: routeOrientationMetadata.artworks },
          element: (
            <LayoutFocusTestPage heading="Curate artworks">
              <Link to="/exhibitions/1/preview">Preview &amp; publish</Link>
            </LayoutFocusTestPage>
          ),
        },
        {
          path: '/exhibitions/:id/preview',
          handle: { orientation: routeOrientationMetadata.preview },
          element: (
            <GalleryTestPage key="preview-gallery" heading="Preview exhibition" label="Preview gallery">
              <Link to="/visit/1">View public exhibition</Link>
            </GalleryTestPage>
          ),
        },
        {
          path: '/visit/:id',
          handle: { orientation: routeOrientationMetadata.publicExhibition },
          element: (
            <GalleryTestPage key="public-gallery" heading="Public exhibition" label="Public exhibition gallery">
              <Link to="/exhibitions/1/preview">Return to curator preview</Link>
            </GalleryTestPage>
          ),
        },
        {
          path: '/pending-gallery/:id',
          handle: { orientation: routeOrientationMetadata.publicExhibition },
          element: <PendingGalleryPage captureRegistry={capturePendingRegistry} />,
        },
        {
          path: '/delayed-gallery/:id',
          handle: { orientation: routeOrientationMetadata.publicExhibition },
          element: <DelayedGalleryPage captureReveal={captureDelayedReveal} />,
        },
        {
          path: '/owned-focus',
          handle: { orientation: routeOrientationMetadata.newExhibition },
          element: <FeatureOwnedFocusPage />,
        },
      ],
    },
  ], {
    initialEntries,
    initialIndex: initialEntries.length - 1,
  })
}

function TestPage({ heading, children }: { heading: string; children?: React.ReactNode }) {
  return (
    <section>
      <h1>{heading}</h1>
      {children}
    </section>
  )
}

function LayoutFocusTestPage({ heading, children }: { heading: string; children?: React.ReactNode }) {
  const headingRef = useRef<HTMLHeadingElement>(null)
  useRouteFocusTarget(headingRef)
  return (
    <section>
      <h1 ref={headingRef}>{heading}</h1>
      {children}
    </section>
  )
}

function MetadataTestPage() {
  const [note, setNote] = useState('')
  const navigation = useDirtyNavigation(note !== '')
  const headingRef = useRef<HTMLHeadingElement>(null)
  useRouteFocusTarget(headingRef)
  return (
    <section>
      <h1 ref={headingRef}>Edit exhibition</h1>
      <Link to="/exhibitions/1/artworks">Artworks</Link>
      <button type="button">Keep focus</button>
      <label>
        Unsaved note
        <input value={note} onChange={(event) => setNote(event.target.value)} />
      </label>
      <DirtyNavigationConfirmation navigation={navigation} />
    </section>
  )
}

function GalleryTestPage({
  heading,
  label,
  children,
}: {
  heading: string
  label: string
  children: React.ReactNode
}) {
  const shellRef = useRef<HTMLDivElement>(null)
  useRouteFocusTarget(shellRef)
  return (
    <section>
      <h1>{heading}</h1>
      <div ref={shellRef} role="region" aria-label={label} tabIndex={-1}>
        {children}
      </div>
    </section>
  )
}

function FeatureOwnedFocusPage() {
  const statusRef = useRef<HTMLParagraphElement>(null)
  useEffect(() => statusRef.current?.focus(), [])
  return (
    <section>
      <h1>Feature-owned destination</h1>
      <p ref={statusRef} role="status" aria-label="Authoritative destination status" tabIndex={-1}>
        Destination is ready.
      </p>
    </section>
  )
}

function PendingGalleryPage({
  captureRegistry,
}: {
  captureRegistry?: (registry: RouteTitleRegistry) => void
}) {
  const registry = useContext(RouteTitleRegistryContext)
  const { id } = useParams()
  useLayoutEffect(() => {
    if (registry) captureRegistry?.(registry)
  }, [captureRegistry, registry])
  return <TestPage heading="Pending gallery">Exhibition {id} is loading.</TestPage>
}

function DelayedGalleryPage({ captureReveal }: { captureReveal?: (reveal: () => void) => void }) {
  const [ready, setReady] = useState(false)
  useLayoutEffect(() => {
    captureReveal?.(() => setReady(true))
  }, [captureReveal])
  return (
    <TestPage heading="Delayed gallery route">
      <button type="button">Use loading controls</button>
      {ready && <RegisteredGalleryTarget label="Delayed gallery" />}
    </TestPage>
  )
}

function RegisteredGalleryTarget({ label }: { label: string }) {
  const targetRef = useRef<HTMLDivElement>(null)
  useRouteFocusTarget(targetRef)
  return <div ref={targetRef} role="region" aria-label={label} tabIndex={-1} />
}

function recordFocusEvents() {
  const elements: Element[] = []
  const record = (event: FocusEvent) => {
    if (event.target instanceof Element) elements.push(event.target)
  }
  document.addEventListener('focusin', record)
  return {
    elements,
    stop: () => document.removeEventListener('focusin', record),
  }
}

function createTerminalRouter(kind: 'preview' | 'public', destination: string) {
  return createMemoryRouter([
    {
      element: <AppLayout />,
      children: [
        {
          path: '/',
          handle: { orientation: routeOrientationMetadata.catalogue },
          element: <Link to={destination}>Open terminal route</Link>,
        },
        kind === 'preview'
          ? {
              path: '/exhibitions/:id/preview',
              handle: { orientation: routeOrientationMetadata.preview },
              element: <ExhibitionPreviewPage />,
            }
          : {
              path: '/visit/:id',
              handle: { orientation: routeOrientationMetadata.publicExhibition },
              element: <PublicExhibitionPage />,
            },
      ],
    },
  ], { initialEntries: ['/'] })
}
