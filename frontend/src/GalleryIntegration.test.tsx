import { cleanup, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('./features/virtual-gallery/LazyExhibitionGallery', () => ({
  LazyExhibitionGallery: ({ exhibition, exitAction }: { exhibition: { id: number; title: string }; exitAction: ReactNode }) => (
    <div data-testid="shared-gallery">
      <p>{exhibition.id}: {exhibition.title}</p>
      {exitAction}
    </div>
  ),
}))

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
  it('uses the same renderer in public visit and curator preview routes', async () => {
    vi.stubGlobal('fetch', vi.fn((path: string) => Promise.resolve(response(
      path === '/api/public/exhibitions/1' ? publicDetail : curatorDetail,
    ))))

    const publicView = renderAt('/visit/1')
    expect(await screen.findByTestId('shared-gallery')).toHaveTextContent('1: Public gallery')
    expect(screen.getByRole('link', { name: 'Exit to exhibitions' })).toHaveAttribute('href', '/')
    publicView.unmount()

    renderAt('/exhibitions/2/preview')
    expect(await screen.findByTestId('shared-gallery')).toHaveTextContent('2: Curator gallery')
    expect(screen.getByRole('link', { name: 'Return to exhibition editor' })).toHaveAttribute('href', '/exhibitions/2/edit')
  })
})
