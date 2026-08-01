import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('./features/virtual-gallery/webgl', () => ({
  supportsWebGL: () => false,
  watchWebGLContextLoss: vi.fn(),
}))

vi.mock('./features/virtual-gallery/LazyExhibitionGallery', async () => {
  const { ExhibitionGallery } = await vi.importActual<typeof import('./features/virtual-gallery/ExhibitionGallery')>('./features/virtual-gallery/ExhibitionGallery')
  return { LazyExhibitionGallery: ExhibitionGallery }
})

import App from './App'

function response(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })
}

const publicDetail = {
  id: 1,
  title: 'Public gallery',
  summary: null,
  introduction: null,
  publishedAt: null,
  coverArtworkId: null,
  items: [],
}

const curatorDetail = {
  id: 2,
  title: 'Curator gallery',
  summary: null,
  introduction: null,
  status: 'DRAFT',
  publishedAt: null,
  coverArtworkId: null,
  items: [],
  createdAt: '2026-07-18T12:00:00Z',
  updatedAt: '2026-07-18T12:00:00Z',
}

function renderAt(path: string) {
  window.history.pushState({}, '', path)
  window.dispatchEvent(new PopStateEvent('popstate'))
  return render(<App />)
}

afterEach(() => {
  cleanup()
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
})
