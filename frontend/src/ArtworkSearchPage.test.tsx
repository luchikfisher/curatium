import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'

function detail(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    title: 'Lines of Light',
    status: 'DRAFT',
    items: [],
    createdAt: '2026-07-18T12:00:00Z',
    updatedAt: '2026-07-18T12:00:00Z',
    ...overrides,
  }
}

function searchArtwork(overrides: Record<string, unknown> = {}) {
  return {
    source: 'ART_INSTITUTE_OF_CHICAGO',
    externalId: '154235',
    title: 'Nocturne',
    artistDisplay: 'James McNeill Whistler',
    dateDisplay: '1875',
    mediumDisplay: 'Oil on canvas',
    thumbnailUrl: 'https://images.example/thumbnail.jpg',
    imageUrl: 'https://images.example/full.jpg',
    sourceUrl: 'https://museum.example/artworks/154235',
    creditLine: 'Museum collection',
    publicDomain: true,
    ...overrides,
  }
}

function item(externalId = '154235', position = 1) {
  return {
    id: position,
    position,
    artwork: {
      id: position + 10,
      ...searchArtwork({ externalId }),
    },
  }
}

function searchPage(items: unknown[] = [searchArtwork()], overrides: Record<string, unknown> = {}) {
  return { items, page: 1, pageSize: 20, hasNextPage: false, ...overrides }
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

async function loadSearchPage() {
  return screen.findByLabelText('Search terms')
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('museum artwork search and add flow', () => {
  it('searches through Curatium and renders museum results', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(respond(detail()))
      .mockResolvedValueOnce(respond(searchPage()))
    vi.stubGlobal('fetch', fetchMock)
    renderAt('/exhibitions/1/artworks')

    await userEvent.type(await loadSearchPage(), ' night ')
    await userEvent.click(screen.getByRole('button', { name: 'Search' }))

    expect(await screen.findByRole('heading', { name: 'Nocturne' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Thumbnail of Nocturne' })).toBeInTheDocument()
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/museum/artworks?q=night&page=1&size=20', expect.any(Object))
  })

  it('shows an empty-result state', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(respond(detail()))
      .mockResolvedValueOnce(respond(searchPage([])))
    vi.stubGlobal('fetch', fetchMock)
    renderAt('/exhibitions/1/artworks')

    await userEvent.type(await loadSearchPage(), 'night')
    await userEvent.click(screen.getByRole('button', { name: 'Search' }))

    expect(await screen.findByRole('heading', { name: 'No artworks found' })).toBeInTheDocument()
  })

  it('can continue from a filtered empty page when the provider has another page', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(respond(detail()))
      .mockResolvedValueOnce(respond(searchPage([], { hasNextPage: true })))
      .mockResolvedValueOnce(respond(searchPage(
        [searchArtwork({ title: 'Moonlit Harbor' })],
        { page: 2 },
      )))
    vi.stubGlobal('fetch', fetchMock)
    renderAt('/exhibitions/1/artworks')

    await userEvent.type(await loadSearchPage(), 'night')
    await userEvent.click(screen.getByRole('button', { name: 'Search' }))
    await screen.findByRole('heading', { name: 'No artworks found' })
    await userEvent.click(screen.getByRole('button', { name: 'Next page' }))

    expect(await screen.findByRole('heading', { name: 'Moonlit Harbor' })).toBeInTheDocument()
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      '/api/museum/artworks?q=night&page=2&size=20',
      expect.any(Object),
    )
  })

  it('validates the normalized query before searching', async () => {
    const fetchMock = vi.fn().mockResolvedValue(respond(detail()))
    vi.stubGlobal('fetch', fetchMock)
    renderAt('/exhibitions/1/artworks')

    await userEvent.type(await loadSearchPage(), ' n ')
    await userEvent.click(screen.getByRole('button', { name: 'Search' }))

    expect(screen.getByText('Search query must be between 2 and 100 characters.')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('cancels a stale search and renders only the latest results', async () => {
    let firstSignal: AbortSignal | undefined
    const fetchMock = vi.fn((path: string, options?: RequestInit) => {
      if (path === '/api/exhibitions/1') return Promise.resolve(respond(detail()))
      if (path.includes('q=night')) {
        firstSignal = options?.signal as AbortSignal
        return new Promise<Response>((_, reject) => {
          firstSignal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
        })
      }
      if (path.includes('q=moon')) return Promise.resolve(respond(searchPage([searchArtwork({ title: 'Moonlight' })])))
      throw new Error(`Unexpected request: ${path}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    renderAt('/exhibitions/1/artworks')

    const query = await loadSearchPage()
    await userEvent.type(query, 'night')
    await userEvent.click(screen.getByRole('button', { name: 'Search' }))
    await userEvent.clear(query)
    await userEvent.type(query, 'moon')
    await userEvent.click(screen.getByRole('button', { name: /Search/ }))

    expect(firstSignal?.aborted).toBe(true)
    expect(await screen.findByRole('heading', { name: 'Moonlight' })).toBeInTheDocument()
    expect(screen.queryByText('Nocturne')).not.toBeInTheDocument()
  })

  it('shows a provider failure and retries the same search', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(respond(detail()))
      .mockResolvedValueOnce(respond(error('MUSEUM_SERVICE_UNAVAILABLE', 'The museum service is temporarily unavailable.', 503), 503))
      .mockResolvedValueOnce(respond(searchPage()))
    vi.stubGlobal('fetch', fetchMock)
    renderAt('/exhibitions/1/artworks')

    await userEvent.type(await loadSearchPage(), 'night')
    await userEvent.click(screen.getByRole('button', { name: 'Search' }))
    expect(await screen.findByText('The museum service is temporarily unavailable.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByRole('heading', { name: 'Nocturne' })).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('keeps preserved results paired with their committed query after another query fails', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(respond(detail()))
      .mockResolvedValueOnce(respond(searchPage(undefined, { hasNextPage: true })))
      .mockResolvedValueOnce(respond(error('MUSEUM_SERVICE_UNAVAILABLE', 'Unavailable.', 503), 503))
      .mockResolvedValueOnce(respond(searchPage(
        [searchArtwork({ title: 'Night on page two' })],
        { page: 2 },
      )))
    vi.stubGlobal('fetch', fetchMock)
    renderAt('/exhibitions/1/artworks')

    const query = await loadSearchPage()
    await userEvent.type(query, 'night')
    await userEvent.click(screen.getByRole('button', { name: 'Search' }))
    await screen.findByRole('heading', { name: 'Nocturne' })
    await userEvent.clear(query)
    await userEvent.type(query, 'moon')
    await userEvent.click(screen.getByRole('button', { name: 'Search' }))
    await screen.findByText('The museum service is temporarily unavailable.')
    await userEvent.click(screen.getByRole('button', { name: 'Next page' }))

    expect(await screen.findByRole('heading', { name: 'Night on page two' })).toBeInTheDocument()
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      '/api/museum/artworks?q=night&page=2&size=20',
      expect.any(Object),
    )
  })

  it('adds an artwork using only source and external ID, retaining search results', async () => {
    const committedItem = item()
    committedItem.artwork.title = 'Committed museum title'
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(respond(detail()))
      .mockResolvedValueOnce(respond(searchPage()))
      .mockResolvedValueOnce(respond(committedItem, 201))
    vi.stubGlobal('fetch', fetchMock)
    renderAt('/exhibitions/1/artworks')

    await userEvent.type(await loadSearchPage(), 'night')
    await userEvent.click(screen.getByRole('button', { name: 'Search' }))
    await screen.findByRole('heading', { name: 'Nocturne' })
    await userEvent.click(screen.getByRole('button', { name: 'Add artwork' }))

    expect(await screen.findByText('Already added')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Current artworks (1/10)' })).toBeInTheDocument()
    expect(screen.getByText(/Committed museum title/)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Nocturne' })).toBeInTheDocument()
    expect(fetchMock).toHaveBeenNthCalledWith(3, '/api/exhibitions/1/items', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ source: 'ART_INSTITUTE_OF_CHICAGO', externalId: '154235' }),
    }))
  })

  it('marks artworks already committed to the exhibition as added', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(respond(detail({ items: [item()] })))
      .mockResolvedValueOnce(respond(searchPage()))
    vi.stubGlobal('fetch', fetchMock)
    renderAt('/exhibitions/1/artworks')

    await userEvent.type(await loadSearchPage(), 'night')
    await userEvent.click(screen.getByRole('button', { name: 'Search' }))

    expect(await screen.findByText('Already added')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add artwork' })).not.toBeInTheDocument()
  })

  it('handles duplicate and capacity conflicts', async () => {
    const duplicateFetch = vi.fn()
      .mockResolvedValueOnce(respond(detail()))
      .mockResolvedValueOnce(respond(searchPage()))
      .mockResolvedValueOnce(respond(error('DUPLICATE_EXHIBITION_ARTWORK', 'Duplicate.', 409), 409))
    vi.stubGlobal('fetch', duplicateFetch)
    renderAt('/exhibitions/1/artworks')

    await userEvent.type(await loadSearchPage(), 'night')
    await userEvent.click(screen.getByRole('button', { name: 'Search' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Add artwork' }))
    expect(await screen.findByText('Nocturne is already in this exhibition.')).toBeInTheDocument()
    expect(screen.getByText('Already added')).toBeInTheDocument()

    cleanup()
    const capacityFetch = vi.fn()
      .mockResolvedValueOnce(respond(detail()))
      .mockResolvedValueOnce(respond(searchPage()))
      .mockResolvedValueOnce(respond(error('EXHIBITION_ARTWORK_LIMIT_REACHED', 'At capacity.', 409), 409))
    vi.stubGlobal('fetch', capacityFetch)
    renderAt('/exhibitions/1/artworks')
    await userEvent.type(await loadSearchPage(), 'night')
    await userEvent.click(screen.getByRole('button', { name: 'Search' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Add artwork' }))

    expect(await screen.findByText('This exhibition already has the maximum of 10 artworks.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add artwork' })).toBeDisabled()
  })

  it('handles published read-only and non-importable add responses', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(respond(detail()))
      .mockResolvedValueOnce(respond(searchPage()))
      .mockResolvedValueOnce(respond(error('ARTWORK_NOT_IMPORTABLE', 'Only public-domain artworks can be imported.', 422), 422))
      .mockResolvedValueOnce(respond(error('PUBLISHED_EXHIBITION_READ_ONLY', 'Read only.', 409), 409))
    vi.stubGlobal('fetch', fetchMock)
    renderAt('/exhibitions/1/artworks')

    await userEvent.type(await loadSearchPage(), 'night')
    await userEvent.click(screen.getByRole('button', { name: 'Search' }))
    const add = await screen.findByRole('button', { name: 'Add artwork' })
    await userEvent.click(add)
    expect(await screen.findByText('Only public-domain artworks can be imported.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Add artwork' }))

    expect(await screen.findByText('This exhibition is published and read-only.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add artwork' })).toBeDisabled()
  })

  it('shows a malformed search response as an error', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(respond(detail()))
      .mockResolvedValueOnce(respond({ items: [], page: 1, pageSize: 20 }))
    vi.stubGlobal('fetch', fetchMock)
    renderAt('/exhibitions/1/artworks')

    await userEvent.type(await loadSearchPage(), 'night')
    await userEvent.click(screen.getByRole('button', { name: 'Search' }))

    expect(await screen.findByText('The server returned data Curatium could not understand.')).toBeInTheDocument()
  })

  it('rejects malformed route IDs without fetching', () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    renderAt('/exhibitions/not-a-number/artworks')

    expect(screen.getByRole('heading', { name: 'Invalid exhibition address' })).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('aborts a stale exhibition request when the artwork route changes', async () => {
    let firstSignal: AbortSignal | undefined
    const fetchMock = vi.fn((path: string, options?: RequestInit) => {
      if (path === '/api/exhibitions/1') {
        firstSignal = options?.signal as AbortSignal
        return new Promise<Response>((_, reject) => {
          firstSignal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
        })
      }
      if (path === '/api/exhibitions/2') return Promise.resolve(respond(detail({ id: 2, title: 'Second exhibition' })))
      throw new Error(`Unexpected request: ${path}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    renderAt('/exhibitions/1/artworks')

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    window.history.pushState({}, '', '/exhibitions/2/artworks')
    window.dispatchEvent(new PopStateEvent('popstate'))

    await waitFor(() => expect(firstSignal?.aborted).toBe(true))
    expect(await screen.findByText(/Second exhibition/)).toBeInTheDocument()
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
  })

  it('aborts an in-flight add when the artwork route changes', async () => {
    let addSignal: AbortSignal | undefined
    const fetchMock = vi.fn((path: string, options?: RequestInit) => {
      if (path === '/api/exhibitions/1') return Promise.resolve(respond(detail()))
      if (path === '/api/museum/artworks?q=night&page=1&size=20') {
        return Promise.resolve(respond(searchPage()))
      }
      if (path === '/api/exhibitions/1/items') {
        addSignal = options?.signal as AbortSignal
        return new Promise<Response>((_, reject) => {
          addSignal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
        })
      }
      if (path === '/api/exhibitions/2') {
        return Promise.resolve(respond(detail({ id: 2, title: 'Second exhibition' })))
      }
      throw new Error(`Unexpected request: ${path}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    renderAt('/exhibitions/1/artworks')

    await userEvent.type(await loadSearchPage(), 'night')
    await userEvent.click(screen.getByRole('button', { name: 'Search' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Add artwork' }))
    await waitFor(() => expect(addSignal).toBeDefined())
    window.history.pushState({}, '', '/exhibitions/2/artworks')
    window.dispatchEvent(new PopStateEvent('popstate'))

    await waitFor(() => expect(addSignal?.aborted).toBe(true))
    expect(await screen.findByText(/Second exhibition/)).toBeInTheDocument()
    expect(screen.queryByText(/problem occurred while adding/)).not.toBeInTheDocument()
  })
})
