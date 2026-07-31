import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import * as webgl from './features/virtual-gallery/webgl'

function artwork(overrides: Record<string, unknown> = {}) {
  return {
    id: 101,
    title: 'Nocturne',
    artistDisplay: 'James McNeill Whistler',
    dateDisplay: '1875',
    mediumDisplay: 'Oil on canvas',
    imageUrl: '/api/artwork-images/art-institute/11111111-1111-1111-1111-111111111111/display',
    sourceUrl: 'https://museum.example/artworks/nocturne',
    creditLine: 'Museum collection',
    ...overrides,
  }
}

function item(position: number, artworkOverrides: Record<string, unknown> = {}, itemOverrides: Record<string, unknown> = {}) {
  return {
    id: position + 10,
    position,
    curatorialNote: `Note for artwork ${position}.`,
    artwork: artwork({ id: position + 100, ...artworkOverrides }),
    ...itemOverrides,
  }
}

function detail(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    title: 'Lines of Light',
    summary: 'A study of light and form.',
    introduction: 'An introductory text.',
    publishedAt: '2026-07-22T14:30:00Z',
    coverArtworkId: 101,
    items: [item(1)],
    ...overrides,
  }
}

function error(code: string, message: string, status: number) {
  return { code, message, fieldErrors: [], timestamp: '2026-07-18T12:00:00Z', status }
}

function respond(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function renderAt(path: string) {
  window.history.pushState({}, '', path)
  window.dispatchEvent(new PopStateEvent('popstate'))
  return render(<App />)
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('public exhibition view', () => {
  it('renders a complete published exhibition through the public endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(respond(detail()))
    vi.stubGlobal('fetch', fetchMock)
    renderAt('/visit/1')

    expect(await screen.findByRole('heading', { name: 'Lines of Light' })).toBeInTheDocument()
    expect(screen.getByText('A study of light and form.')).toBeInTheDocument()
    expect(screen.getByText('An introductory text.')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Cover artwork: Nocturne' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Artwork 1 of 1: Nocturne' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Artwork 1 of 1: Nocturne' })).toHaveAttribute(
      'src',
      '/api/artwork-images/art-institute/11111111-1111-1111-1111-111111111111/display',
    )
    expect(screen.getAllByText('James McNeill Whistler')).toHaveLength(2)
    expect(screen.getByText('1875')).toBeInTheDocument()
    expect(screen.getByText('Oil on canvas')).toBeInTheDocument()
    expect(screen.getByText('Museum collection')).toBeInTheDocument()
    expect(screen.getByText('Note for artwork 1.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'View source for artwork 1 of 1: Nocturne' })).toHaveAttribute(
      'href',
      'https://museum.example/artworks/nocturne',
    )
    expect(document.querySelector('time[datetime="2026-07-22T14:30:00Z"]')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith('/api/public/exhibitions/1', expect.any(Object))
    expect(fetchMock).not.toHaveBeenCalledWith('/api/exhibitions/1', expect.anything())
  })

  it('renders artwork cards in their committed position order', async () => {
    const first = item(1, { title: 'First committed artwork' })
    const second = item(2, { title: 'Second committed artwork' })
    const third = item(3, { title: 'Third committed artwork' })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respond(detail({ items: [third, first, second] }))))
    renderAt('/visit/1')

    const artworkList = await screen.findByRole('list', { name: 'Exhibition artworks' })
    expect(within(artworkList).getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent)).toEqual([
      'First committed artwork', 'Second committed artwork', 'Third committed artwork',
    ])
  })

  it('keeps the complete ten-artwork HTML exhibition usable when WebGL is unavailable', async () => {
    vi.spyOn(webgl, 'supportsWebGL').mockReturnValue(false)
    const orderedItems = Array.from({ length: 10 }, (_, index) => item(index + 1, {
      id: index + 101,
      title: `Committed artwork ${index + 1}`,
      sourceUrl: `https://museum.example/artworks/${index + 1}`,
    })).reverse()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respond(detail({
      coverArtworkId: 101,
      items: orderedItems,
    }))))
    renderAt('/visit/1')

    const artworkList = await screen.findByRole('list', { name: 'Exhibition artworks' })
    expect(within(artworkList).getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent)).toEqual(
      Array.from({ length: 10 }, (_, index) => `Committed artwork ${index + 1}`),
    )
    expect(screen.getByRole('img', { name: 'Artwork 10 of 10: Committed artwork 10' })).toBeInTheDocument()
    expect(within(artworkList).getAllByRole('link', { name: /^View source for artwork \d+ of 10:/ })).toHaveLength(10)
    expect(screen.getByRole('link', { name: 'View source for artwork 10 of 10: Committed artwork 10' })).toHaveAttribute(
      'href',
      'https://museum.example/artworks/10',
    )
    expect(screen.getByRole('link', { name: 'Back to exhibitions' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Begin tour' })).not.toBeInTheDocument()
  })

  it('normalizes omitted nullable metadata and renders missing-cover and empty-content states', async () => {
    const sparseArtwork = item(1, {
      title: 'Untitled',
      artistDisplay: undefined,
      dateDisplay: undefined,
      mediumDisplay: undefined,
      sourceUrl: undefined,
      creditLine: undefined,
    }, { curatorialNote: undefined })
    const sparseDetail = detail({
      summary: undefined,
      introduction: undefined,
      publishedAt: undefined,
      coverArtworkId: undefined,
      items: [sparseArtwork],
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respond(sparseDetail)))
    renderAt('/visit/1')

    expect(await screen.findByText('No summary has been provided.')).toBeInTheDocument()
    expect(screen.getByText('Publication date unavailable.')).toBeInTheDocument()
    expect(screen.getByText('No introduction has been provided.')).toBeInTheDocument()
    expect(screen.getByText('No cover artwork has been selected.')).toBeInTheDocument()
    expect(screen.getByText('Artist unknown')).toBeInTheDocument()
    expect(screen.getByText('Date unavailable')).toBeInTheDocument()
    expect(screen.getByText('Medium unavailable')).toBeInTheDocument()
    expect(screen.getByText('Credit line unavailable')).toBeInTheDocument()
    expect(screen.getByText('No curatorial note.')).toBeInTheDocument()
    expect(screen.getByText('Artwork source unavailable.')).toBeInTheDocument()
  })

  it('keeps same-titled artworks distinguishable through image and source-link names', async () => {
    const first = item(1, { title: 'Untitled', sourceUrl: 'https://museum.example/one' })
    const second = item(2, { title: 'Untitled', sourceUrl: 'https://museum.example/two' })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respond(detail({ coverArtworkId: null, items: [first, second] }))))
    renderAt('/visit/1')

    expect(await screen.findByRole('img', { name: 'Artwork 1 of 2: Untitled' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Artwork 2 of 2: Untitled' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'View source for artwork 1 of 2: Untitled' })).toHaveAttribute('href', 'https://museum.example/one')
    expect(screen.getByRole('link', { name: 'View source for artwork 2 of 2: Untitled' })).toHaveAttribute('href', 'https://museum.example/two')
  })

  it('shows the same not-found state for a hidden draft and retries the public endpoint', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(respond(error('EXHIBITION_NOT_FOUND', 'Exhibition 1 was not found.', 404), 404))
      .mockResolvedValueOnce(respond(detail()))
    vi.stubGlobal('fetch', fetchMock)
    renderAt('/visit/1')

    expect(await screen.findByRole('heading', { name: 'Exhibition not found' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('heading', { name: 'Lines of Light' })).toBeInTheDocument()
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/public/exhibitions/1', expect.any(Object))
  })

  it('shows malformed responses as retryable load errors', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(respond({ id: 1, title: 'Broken exhibition' }))
      .mockResolvedValueOnce(respond(detail()))
    vi.stubGlobal('fetch', fetchMock)
    renderAt('/visit/1')

    expect(await screen.findByRole('heading', { name: 'We could not load this exhibition' })).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('could not understand')
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('heading', { name: 'Lines of Light' })).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('does not load an invalid route ID', () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    renderAt('/visit/not-a-number')

    expect(screen.getByRole('heading', { name: 'Invalid exhibition address' })).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('cancels a stale public request when the route changes', async () => {
    let firstSignal: AbortSignal | undefined
    const fetchMock = vi.fn((path: string, options: RequestInit) => {
      if (path === '/api/public/exhibitions/1') {
        firstSignal = options.signal as AbortSignal
        return new Promise<Response>((_resolve, reject) => {
          firstSignal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
        })
      }
      return Promise.resolve(respond(detail({ id: 2, title: 'Second exhibition' })))
    })
    vi.stubGlobal('fetch', fetchMock)
    renderAt('/visit/1')

    await waitFor(() => expect(firstSignal).toBeDefined())
    window.history.pushState({}, '', '/visit/2')
    window.dispatchEvent(new PopStateEvent('popstate'))

    expect(await screen.findByRole('heading', { name: 'Second exhibition' })).toBeInTheDocument()
    expect(firstSignal?.aborted).toBe(true)
    expect(fetchMock).toHaveBeenCalledWith('/api/public/exhibitions/2', expect.any(Object))
  })

  it('opens the complete exhibition view from a catalogue card without a full-page navigation', async () => {
    const fetchMock = vi.fn((path: string) => {
      if (path === '/api/public/exhibitions') {
        return Promise.resolve(respond([{
          id: 1,
          title: 'Lines of Light',
          summary: 'A study of light and form.',
          status: 'PUBLISHED',
          coverImageUrl: null,
          artworkCount: 1,
          updatedAt: '2026-07-22T14:30:00Z',
        }]))
      }
      return Promise.resolve(respond(detail()))
    })
    vi.stubGlobal('fetch', fetchMock)
    renderAt('/')

    await userEvent.click(await screen.findByRole('link', { name: /Enter exhibition/ }))

    expect(await screen.findByRole('heading', { name: 'Lines of Light' })).toBeInTheDocument()
    expect(window.location.pathname).toBe('/visit/1')
    expect(fetchMock).toHaveBeenCalledWith('/api/public/exhibitions/1', expect.any(Object))
  })
})
