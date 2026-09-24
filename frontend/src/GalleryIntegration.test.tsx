import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const galleryIntegrationState = vi.hoisted(() => ({ webglSupported: false }))

vi.mock('./features/virtual-gallery/webgl', () => ({
  supportsWebGL: () => galleryIntegrationState.webglSupported,
  watchWebGLContextLoss: vi.fn(),
}))

vi.mock('@react-three/drei', () => {
  const useTexture = () => ({
    image: { width: 800, height: 600 },
    clone() {
      return { ...this, dispose: () => undefined }
    },
  })
  useTexture.clear = vi.fn()
  return { useTexture }
})

vi.mock('@react-three/fiber', () => ({
  Canvas: ({ onCreated, 'data-gallery-attempt': attempt }: {
    onCreated?: () => void
    'data-gallery-attempt'?: number
  }) => (
    <div data-testid="integration-gallery-canvas" data-gallery-attempt={attempt}>
      <button type="button" onClick={onCreated}>Renderer ready</button>
    </div>
  ),
  useFrame: vi.fn(),
  useThree: vi.fn(),
}))

vi.mock('./features/virtual-gallery/LazyExhibitionGallery', async () => {
  const { ExhibitionGallery } = await vi.importActual<typeof import('./features/virtual-gallery/ExhibitionGallery')>('./features/virtual-gallery/ExhibitionGallery')
  return { LazyExhibitionGallery: ExhibitionGallery }
})

import App from './App'

function response(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })
}

function item(position: number) {
  return {
    id: position + 10,
    position,
    curatorialNote: null,
    artwork: {
      id: position + 100,
      source: 'CLEVELAND_MUSEUM_OF_ART',
      externalId: `2026.${position}`,
      title: `Artwork ${position}`,
      artistDisplay: `Artist ${position}`,
      dateDisplay: '2026',
      mediumDisplay: 'Oil on canvas',
      thumbnailUrl: `/api/artwork-images/cleveland/2026.${position}/thumbnail`,
      imageUrl: `/api/artwork-images/cleveland/2026.${position}/display`,
      sourceUrl: `https://www.clevelandart.org/art/2026.${position}`,
      creditLine: null,
      publicDomain: true,
    },
  }
}

const curatorItems = [item(1), item(2), item(3), item(4)]
const publicItems = curatorItems.map(({ artwork, ...entry }) => ({
  ...entry,
  artwork: {
    id: artwork.id,
    title: artwork.title,
    artistDisplay: artwork.artistDisplay,
    dateDisplay: artwork.dateDisplay,
    mediumDisplay: artwork.mediumDisplay,
    imageUrl: artwork.imageUrl,
    sourceUrl: artwork.sourceUrl,
    creditLine: artwork.creditLine,
  },
}))

const publicDetail = {
  id: 1,
  title: 'Public gallery',
  summary: null,
  introduction: null,
  publishedAt: null,
  coverArtworkId: null,
  items: publicItems,
}

const curatorDetail = {
  id: 2,
  title: 'Curator gallery',
  summary: null,
  introduction: null,
  status: 'DRAFT',
  publishedAt: null,
  coverArtworkId: null,
  items: curatorItems,
  createdAt: '2026-07-18T12:00:00Z',
  updatedAt: '2026-07-18T12:00:00Z',
}

function renderAt(path: string) {
  window.history.pushState({}, '', path)
  window.dispatchEvent(new PopStateEvent('popstate'))
  return render(<App />)
}

function useNarrowGalleryViewport() {
  vi.stubGlobal('matchMedia', vi.fn((query: string) => ({
    matches: query === '(max-width: 42rem)',
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(() => true),
  } as MediaQueryList)))
}

afterEach(() => {
  cleanup()
  galleryIntegrationState.webglSupported = false
  vi.unstubAllGlobals()
})

describe('gallery integration', () => {
  it('uses the same renderer recovery semantics in public visit and curator preview routes', async () => {
    vi.stubGlobal('fetch', vi.fn((path: string) => Promise.resolve(response(
      path === '/api/public/exhibitions/1' ? publicDetail : curatorDetail,
    ))))

    const publicView = renderAt('/visit/1')
    expect(await screen.findByRole('region', { name: 'Showing the standard gallery' })).toHaveTextContent('3D gallery is unavailable in this browser.')
    publicView.unmount()

    renderAt('/exhibitions/2/preview')
    expect(await screen.findByRole('region', { name: 'Showing the standard gallery' })).toHaveTextContent('3D gallery is unavailable in this browser.')
  })

  it('defers narrow entry consistently without changing public or curator routes', async () => {
    useNarrowGalleryViewport()
    galleryIntegrationState.webglSupported = true
    vi.stubGlobal('fetch', vi.fn((path: string) => Promise.resolve(response(
      path === '/api/public/exhibitions/1' ? publicDetail : curatorDetail,
    ))))

    const publicView = renderAt('/visit/1')
    const publicEntry = await screen.findByRole('button', { name: 'Enter virtual gallery' })
    expect(screen.queryByTestId('integration-gallery-canvas')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'View as standard gallery' })).toBeEnabled()
    expect(screen.getByRole('link', { name: 'Exit to exhibitions' })).toBeInTheDocument()
    const publicUrl = window.location.href
    const publicHistoryLength = window.history.length
    const publicHistoryState = window.history.state

    fireEvent.click(publicEntry)

    expect(screen.getAllByTestId('integration-gallery-canvas')).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Renderer ready' }))
    fireEvent.click(screen.getByRole('button', { name: 'Begin tour' }))
    expect(screen.getByRole('link', { name: 'Exit to exhibitions' })).toHaveAttribute('href', '/')
    expect(window.location.href).toBe(publicUrl)
    expect(window.history.length).toBe(publicHistoryLength)
    expect(window.history.state).toBe(publicHistoryState)
    publicView.unmount()

    renderAt('/exhibitions/2/preview')
    fireEvent.click(await screen.findByRole('button', { name: 'Enter virtual gallery' }))
    fireEvent.click(screen.getByRole('button', { name: 'Renderer ready' }))
    fireEvent.click(screen.getByRole('button', { name: 'Begin tour' }))
    expect(screen.getByRole('navigation', { name: 'Artwork navigation' })).toBeInTheDocument()
    expect(screen.getByTestId('integration-gallery-canvas')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'View as standard gallery' })).toBeEnabled()
    expect(screen.getByRole('link', { name: 'Return to exhibition editor' })).toHaveAttribute('href', '/exhibitions/2/edit')
  })

  it('keeps manual mode return local and consistent across public and curator galleries', async () => {
    galleryIntegrationState.webglSupported = true
    vi.stubGlobal('fetch', vi.fn((path: string) => Promise.resolve(response(
      path === '/api/public/exhibitions/1' ? publicDetail : curatorDetail,
    ))))

    const publicView = renderAt('/visit/1')
    await screen.findByRole('button', { name: 'Renderer ready' })
    expect(screen.getByRole('group', { name: 'Gallery mode' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Virtual gallery' })).toHaveAttribute('aria-pressed', 'true')
    await waitFor(() => expect(document.querySelector('.route-announcement')).toHaveTextContent('Exhibition: Public gallery'))
    fireEvent.click(screen.getByRole('button', { name: 'Renderer ready' }))
    expect(screen.queryByRole('region', { name: 'Standard gallery available while the 3D renderer loads' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Begin tour' }))
    fireEvent.click(screen.getByRole('button', { name: 'Next artwork' }))
    fireEvent.click(screen.getByRole('button', { name: 'Next artwork' }))

    const originalUrl = window.location.href
    const originalHistoryLength = window.history.length
    const originalHistoryState = window.history.state
    const routeAnnouncement = document.querySelector<HTMLElement>('.route-announcement')
    if (!routeAnnouncement) throw new Error('Route announcement region was not rendered.')
    const announcementMutations: MutationRecord[] = []
    const observer = new MutationObserver((records) => announcementMutations.push(...records))
    observer.observe(routeAnnouncement, { childList: true, characterData: true, subtree: true })

    fireEvent.click(screen.getByRole('button', { name: 'View as standard gallery' }))
    expect(screen.getByRole('button', { name: 'Return to virtual gallery' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Standard gallery' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByRole('button', { name: 'Try 3D again' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Return to virtual gallery' }))
    expect(screen.getByTestId('integration-gallery-canvas')).toHaveAttribute('data-gallery-attempt', '1')
    fireEvent.click(screen.getByRole('button', { name: 'Renderer ready' }))

    expect(screen.getByRole('status')).toHaveTextContent('Artwork 3 of 4: Artwork 3')
    expect(window.location.href).toBe(originalUrl)
    expect(window.history.length).toBe(originalHistoryLength)
    expect(window.history.state).toBe(originalHistoryState)
    await new Promise((resolve) => window.setTimeout(resolve, 0))
    expect(announcementMutations).toHaveLength(0)
    observer.disconnect()
    publicView.unmount()

    renderAt('/exhibitions/2/preview')
    await screen.findByRole('button', { name: 'Renderer ready' })
    expect(screen.getByRole('heading', { name: 'Standard exhibition', level: 2 })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Renderer ready' }))
    expect(screen.queryByRole('heading', { name: 'Standard exhibition', level: 2 })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Virtual gallery preview', level: 2 })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'View as standard gallery' }))
    expect(screen.getByRole('button', { name: 'Return to virtual gallery' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Standard exhibition', level: 2 })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Try 3D again' })).not.toBeInTheDocument()
  })
})
