import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { appRouter } from './router'

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
    thumbnailUrl: '/api/artwork-images/art-institute/11111111-1111-1111-1111-111111111111/thumbnail',
    imageUrl: '/api/artwork-images/art-institute/11111111-1111-1111-1111-111111111111/display',
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

function curatedItem(title: string, position: number, note: string | null = null) {
  const result = item(`curated-${position}`, position)
  result.artwork.title = title
  return { ...result, curatorialNote: note }
}

function searchPage(items: unknown[] = [searchArtwork()], overrides: Record<string, unknown> = {}) {
  return { items, page: 1, pageSize: 20, hasNextPage: false, ...overrides }
}

function error(code: string, message: string, status: number, fieldErrors: unknown[] = []) {
  return { code, message, fieldErrors, timestamp: '2026-07-18T12:00:00Z', status }
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
    expect(screen.getByRole('img', { name: 'Thumbnail of Nocturne' })).toHaveAttribute(
      'src',
      '/api/artwork-images/art-institute/11111111-1111-1111-1111-111111111111/thumbnail',
    )
    expect(screen.getByRole('img', { name: 'Thumbnail of Nocturne' })).toHaveAttribute('loading', 'lazy')
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
    expect(screen.getByRole('heading', { name: 'Committed museum title' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Thumbnail of Committed museum title' })).toHaveAttribute(
      'src',
      '/api/artwork-images/art-institute/11111111-1111-1111-1111-111111111111/thumbnail',
    )
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

  it('handles a duplicate conflict', async () => {
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
  })

  it('reloads committed exhibition items after a capacity conflict', async () => {
    const initialItem = item('initial-artwork')
    initialItem.artwork.title = 'Initially loaded artwork'
    const committedItems = Array.from({ length: 10 }, (_, index) => {
      const committedItem = item(`committed-${index + 1}`, index + 1)
      committedItem.artwork.title = `Committed artwork ${index + 1}`
      return committedItem
    })
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(respond(detail({ items: [initialItem] })))
      .mockResolvedValueOnce(respond(searchPage()))
      .mockResolvedValueOnce(respond(error('EXHIBITION_ARTWORK_LIMIT_REACHED', 'At capacity.', 409), 409))
      .mockResolvedValueOnce(respond(detail({ items: committedItems })))
    vi.stubGlobal('fetch', fetchMock)
    renderAt('/exhibitions/1/artworks')

    const query = await loadSearchPage()
    await userEvent.type(query, 'night')
    await userEvent.click(screen.getByRole('button', { name: 'Search' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Add artwork' }))

    expect(await screen.findByText('This exhibition already has the maximum of 10 artworks.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Current artworks (10/10)' })).toBeInTheDocument()
    expect(within(screen.getByRole('list')).getAllByRole('listitem')).toHaveLength(10)
    expect(screen.getByRole('heading', { name: 'Committed artwork 10' })).toBeInTheDocument()
    expect(query).toHaveValue('night')
    expect(screen.getByRole('heading', { name: 'Nocturne' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add artwork' })).toBeDisabled()
    expect(fetchMock).toHaveBeenNthCalledWith(4, '/api/exhibitions/1', expect.any(Object))
  })

  it('warns that committed items may be stale when a capacity refresh fails', async () => {
    const initialItem = item('initial-artwork')
    initialItem.artwork.title = 'Initially loaded artwork'
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(respond(detail({ items: [initialItem] })))
      .mockResolvedValueOnce(respond(searchPage()))
      .mockResolvedValueOnce(respond(error('EXHIBITION_ARTWORK_LIMIT_REACHED', 'At capacity.', 409), 409))
      .mockRejectedValueOnce(new TypeError('Connection lost'))
    vi.stubGlobal('fetch', fetchMock)
    renderAt('/exhibitions/1/artworks')

    await userEvent.type(await loadSearchPage(), 'night')
    await userEvent.click(screen.getByRole('button', { name: 'Search' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Add artwork' }))

    expect(await screen.findByText(/displayed artwork list could not be refreshed and may be stale/i)).toBeInTheDocument()
    expect(screen.getByText('This exhibition has reached its 10-artwork limit.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Current artworks (1/10)' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Initially loaded artwork' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add artwork' })).toBeDisabled()
  })

  it('handles published read-only and non-importable add responses', async () => {
    const committed = curatedItem('Committed published artwork', 1, 'Committed note')
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(respond(detail()))
      .mockResolvedValueOnce(respond(searchPage()))
      .mockResolvedValueOnce(respond(error('ARTWORK_NOT_IMPORTABLE', 'Only public-domain artworks can be imported.', 422), 422))
      .mockResolvedValueOnce(respond(error('PUBLISHED_EXHIBITION_READ_ONLY', 'Read only.', 409), 409))
      .mockResolvedValueOnce(respond(detail({
        title: 'Published authority',
        status: 'PUBLISHED',
        publishedAt: '2026-08-04T09:00:00Z',
        items: [committed],
        coverArtworkId: committed.artwork.id,
      })))
    vi.stubGlobal('fetch', fetchMock)
    renderAt('/exhibitions/1/artworks')

    await userEvent.type(await loadSearchPage(), 'night')
    await userEvent.click(screen.getByRole('button', { name: 'Search' }))
    const add = await screen.findByRole('button', { name: 'Add artwork' })
    await userEvent.click(add)
    expect(await screen.findByText('Only public-domain artworks can be imported.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Add artwork' }))

    const reconciliationStatus = await screen.findByText(/attempted change was not saved because this exhibition is now published/i)
    expect(reconciliationStatus).toHaveFocus()
    expect(document.activeElement).not.toBe(document.body)
    expect(screen.getByText(/Published authority/)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Committed published artwork' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Current artworks (1/10)' })).toBeInTheDocument()
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
    await act(async () => { await appRouter.navigate('/exhibitions/2/artworks') })

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
    await act(async () => { await appRouter.navigate('/exhibitions/2/artworks') })

    await waitFor(() => expect(addSignal?.aborted).toBe(true))
    expect(await screen.findByText(/Second exhibition/)).toBeInTheDocument()
    expect(screen.queryByText(/problem occurred while adding/)).not.toBeInTheDocument()
  })

  it('aborts a capacity-conflict refresh when the artwork route changes', async () => {
    let exhibitionOneRequests = 0
    let refreshSignal: AbortSignal | undefined
    const fetchMock = vi.fn((path: string, options?: RequestInit) => {
      if (path === '/api/exhibitions/1') {
        exhibitionOneRequests += 1
        if (exhibitionOneRequests === 1) return Promise.resolve(respond(detail()))
        refreshSignal = options?.signal as AbortSignal
        return new Promise<Response>((_, reject) => {
          refreshSignal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
        })
      }
      if (path === '/api/museum/artworks?q=night&page=1&size=20') {
        return Promise.resolve(respond(searchPage()))
      }
      if (path === '/api/exhibitions/1/items') {
        return Promise.resolve(respond(error('EXHIBITION_ARTWORK_LIMIT_REACHED', 'At capacity.', 409), 409))
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
    await waitFor(() => expect(refreshSignal).toBeDefined())
    await act(async () => { await appRouter.navigate('/exhibitions/2/artworks') })

    await waitFor(() => expect(refreshSignal?.aborted).toBe(true))
    expect(await screen.findByText(/Second exhibition/)).toBeInTheDocument()
    expect(screen.queryByText('Lines of Light')).not.toBeInTheDocument()
  })

  it('saves a curatorial note from the committed backend response', async () => {
    const initialItem = curatedItem('First artwork', 1, 'Existing note')
    const committedItem = { ...initialItem, curatorialNote: 'Server-normalized note' }
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(respond(detail({ items: [initialItem] })))
      .mockResolvedValueOnce(respond(committedItem))
    vi.stubGlobal('fetch', fetchMock)
    renderAt('/exhibitions/1/artworks')

    const note = await screen.findByLabelText('Curatorial note for artwork 1 of 1: First artwork')
    await userEvent.clear(note)
    await userEvent.type(note, 'Browser draft')
    await userEvent.click(screen.getByRole('button', { name: /Save note for artwork/ }))

    await waitFor(() => expect(note).toHaveValue('Server-normalized note'))
    expect(screen.getByText('Curatorial note saved.')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/exhibitions/1/items/1', expect.objectContaining({
      method: 'PUT',
      body: JSON.stringify({ curatorialNote: 'Browser draft' }),
    }))
  })

  it('continues the original blocked navigation when a pending note save succeeds', async () => {
    let resolveNoteSave: ((response: Response) => void) | undefined
    const initialItem = curatedItem('First artwork', 1, 'Existing note')
    const committedItem = { ...initialItem, curatorialNote: 'Saved note' }
    const fetchMock = vi.fn((path: string, options?: RequestInit) => {
      if (path === '/api/exhibitions/1/items/1') {
        return new Promise<Response>((resolve) => { resolveNoteSave = resolve })
      }
      if (path === '/api/exhibitions/1') return Promise.resolve(respond(detail({ items: [initialItem] })))
      throw new Error(`Unexpected request: ${path} ${options?.method ?? 'GET'}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    renderAt('/exhibitions/1/artworks')

    const note = await screen.findByLabelText('Curatorial note for artwork 1 of 1: First artwork')
    await userEvent.clear(note)
    await userEvent.type(note, 'Pending note')
    await userEvent.click(screen.getByRole('button', { name: 'Save note for artwork 1 of 1, First artwork' }))
    await waitFor(() => expect(resolveNoteSave).toBeDefined())
    await userEvent.click(screen.getByRole('link', { name: 'Preview exhibition' }))
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()

    await act(async () => { resolveNoteSave?.(respond(committedItem)) })

    expect(await screen.findByText('Draft preview')).toBeInTheDocument()
    expect(window.location.pathname).toBe('/exhibitions/1/preview')
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('main')).toHaveFocus())
  })

  it('protects one and multiple dirty notes, and becomes clean when both return to baseline', async () => {
    const first = curatedItem('First artwork', 1, 'Committed first note')
    const second = curatedItem('Second artwork', 2)
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(respond(detail({
      items: [first, second],
      coverArtworkId: null,
      publishedAt: null,
    }))))
    vi.stubGlobal('fetch', fetchMock)
    renderAt('/exhibitions/1/artworks')

    const firstNote = await screen.findByLabelText('Curatorial note for artwork 1 of 2: First artwork')
    const secondNote = screen.getByLabelText('Curatorial note for artwork 2 of 2: Second artwork')
    await userEvent.clear(firstNote)
    await userEvent.type(firstNote, '  First exact draft  ')
    await userEvent.click(screen.getByRole('link', { name: 'Preview exhibition' }))
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Stay' }))
    expect(firstNote).toHaveValue('  First exact draft  ')

    await userEvent.type(secondNote, 'Second draft')
    await userEvent.click(screen.getByRole('link', { name: 'Preview exhibition' }))
    expect(screen.getAllByRole('alertdialog')).toHaveLength(1)
    await userEvent.click(screen.getByRole('button', { name: 'Stay' }))
    expect(firstNote).toHaveValue('  First exact draft  ')
    expect(secondNote).toHaveValue('Second draft')

    await userEvent.clear(firstNote)
    await userEvent.type(firstNote, 'Committed first note')
    await userEvent.clear(secondNote)
    await userEvent.click(screen.getByRole('link', { name: 'Preview exhibition' }))

    expect(await screen.findByText('Draft preview')).toBeInTheDocument()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('successful note save clears only that item while another dirty note remains protected', async () => {
    const first = curatedItem('First artwork', 1, 'First committed')
    const second = curatedItem('Second artwork', 2, 'Second committed')
    const savedFirst = { ...first, curatorialNote: 'First saved' }
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(respond(detail({ items: [first, second] })))
      .mockResolvedValueOnce(respond(savedFirst))
    vi.stubGlobal('fetch', fetchMock)
    renderAt('/exhibitions/1/artworks')

    const firstNote = await screen.findByLabelText('Curatorial note for artwork 1 of 2: First artwork')
    const secondNote = screen.getByLabelText('Curatorial note for artwork 2 of 2: Second artwork')
    await userEvent.clear(firstNote)
    await userEvent.type(firstNote, 'First browser draft')
    await userEvent.clear(secondNote)
    await userEvent.type(secondNote, 'Second browser draft')
    await userEvent.click(screen.getByRole('button', { name: 'Save note for artwork 1 of 2, First artwork' }))
    await waitFor(() => expect(firstNote).toHaveValue('First saved'))

    await userEvent.click(screen.getByRole('link', { name: 'Preview exhibition' }))

    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    expect(firstNote).toHaveValue('First saved')
    expect(secondNote).toHaveValue('Second browser draft')
  })

  it('failed note save preserves the draft and keeps navigation protected', async () => {
    const first = curatedItem('First artwork', 1, 'Committed note')
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(respond(detail({ items: [first] })))
      .mockResolvedValueOnce(respond(error('SERVICE_UNAVAILABLE', 'Could not save note.', 503), 503))
    vi.stubGlobal('fetch', fetchMock)
    renderAt('/exhibitions/1/artworks')

    const note = await screen.findByLabelText('Curatorial note for artwork 1 of 1: First artwork')
    await userEvent.clear(note)
    await userEvent.type(note, 'Unsaved after failure')
    await userEvent.click(screen.getByRole('button', { name: 'Save note for artwork 1 of 1, First artwork' }))
    await screen.findByText('Could not save note.')
    await userEvent.click(screen.getByRole('link', { name: 'Preview exhibition' }))

    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    expect(note).toHaveValue('Unsaved after failure')
  })

  it('clears a curatorial note using the committed null response', async () => {
    const initialItem = curatedItem('First artwork', 1, 'Existing note')
    const clearedItem = { ...initialItem, curatorialNote: undefined }
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(respond(detail({ items: [initialItem] })))
      .mockResolvedValueOnce(respond(clearedItem))
    vi.stubGlobal('fetch', fetchMock)
    renderAt('/exhibitions/1/artworks')

    const note = await screen.findByLabelText('Curatorial note for artwork 1 of 1: First artwork')
    await userEvent.click(screen.getByRole('button', { name: /Clear note for artwork/ }))

    await waitFor(() => expect(note).toHaveValue(''))
    expect(screen.getByText('Curatorial note cleared.')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/exhibitions/1/items/1', expect.objectContaining({
      method: 'PUT',
      body: JSON.stringify({ curatorialNote: '' }),
    }))
  })

  it('validates oversized notes before submitting them', async () => {
    const fetchMock = vi.fn().mockResolvedValue(respond(detail({ items: [curatedItem('First artwork', 1)] })))
    vi.stubGlobal('fetch', fetchMock)
    renderAt('/exhibitions/1/artworks')

    fireEvent.change(await screen.findByLabelText('Curatorial note for artwork 1 of 1: First artwork'), {
      target: { value: 'x'.repeat(2001) },
    })
    await userEvent.click(screen.getByRole('button', { name: /Save note for artwork/ }))

    expect(screen.getByText('Curatorial note must be at most 2000 characters.')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('displays a backend curatorial-note field error', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(respond(detail({ items: [curatedItem('First artwork', 1)] })))
      .mockResolvedValueOnce(respond(error(
        'VALIDATION_ERROR',
        'Validation failed.',
        400,
        [{ field: 'curatorialNote', message: 'Curatorial note must be at most 2000 characters.' }],
      ), 400))
    vi.stubGlobal('fetch', fetchMock)
    renderAt('/exhibitions/1/artworks')

    const note = await screen.findByLabelText('Curatorial note for artwork 1 of 1: First artwork')
    await userEvent.type(note, 'A note')
    await userEvent.click(screen.getByRole('button', { name: /Save note for artwork/ }))

    expect(await screen.findByText('Curatorial note must be at most 2000 characters.')).toBeInTheDocument()
    expect(note).toHaveAttribute('aria-invalid', 'true')
  })

  it('preserves the active search query and results through an item mutation', async () => {
    const first = curatedItem('First artwork', 1)
    const committed = { ...first, curatorialNote: 'Committed note' }
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(respond(detail({ items: [first] })))
      .mockResolvedValueOnce(respond(searchPage()))
      .mockResolvedValueOnce(respond(committed))
    vi.stubGlobal('fetch', fetchMock)
    renderAt('/exhibitions/1/artworks')

    const query = await loadSearchPage()
    await userEvent.type(query, 'night')
    await userEvent.click(screen.getByRole('button', { name: 'Search' }))
    await screen.findByRole('heading', { name: 'Nocturne' })
    await userEvent.type(screen.getByLabelText('Curatorial note for artwork 1 of 1: First artwork'), 'Draft note')
    await userEvent.click(screen.getByRole('button', { name: /Save note for artwork/ }))

    expect(await screen.findByText('Curatorial note saved.')).toBeInTheDocument()
    expect(query).toHaveValue('night')
    expect(screen.getByRole('heading', { name: 'Nocturne' })).toBeInTheDocument()
  })

  it('replaces the displayed order with committed move-up and move-down responses', async () => {
    const first = curatedItem('First artwork', 1)
    const second = curatedItem('Second artwork', 2)
    const third = curatedItem('Third artwork', 3)
    const movedUp = [
      { ...second, position: 1 },
      { ...first, position: 2 },
      third,
    ]
    const movedDown = [first, second, third]
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(respond(detail({ items: [first, second, third] })))
      .mockResolvedValueOnce(respond(movedUp))
      .mockResolvedValueOnce(respond(movedDown))
    vi.stubGlobal('fetch', fetchMock)
    renderAt('/exhibitions/1/artworks')

    await screen.findByRole('heading', { name: 'Second artwork' })
    await userEvent.click(within(screen.getByRole('heading', { name: 'Second artwork' }).closest('article')!).getByRole('button', { name: 'Move artwork 2 of 3, Second artwork up' }))
    await waitFor(() => expect(within(screen.getByRole('list')).getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent)).toEqual([
      'Second artwork', 'First artwork', 'Third artwork',
    ]))
    await userEvent.click(within(screen.getByRole('heading', { name: 'Second artwork' }).closest('article')!).getByRole('button', { name: 'Move artwork 1 of 3, Second artwork down' }))
    await waitFor(() => expect(within(screen.getByRole('list')).getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent)).toEqual([
      'First artwork', 'Second artwork', 'Third artwork',
    ]))
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/exhibitions/1/items/2/move-up', expect.objectContaining({ method: 'POST' }))
    expect(fetchMock).toHaveBeenNthCalledWith(3, '/api/exhibitions/1/items/2/move-down', expect.objectContaining({ method: 'POST' }))
  })

  it('disables move controls at the first and last boundaries', async () => {
    const first = curatedItem('First artwork', 1)
    const last = curatedItem('Last artwork', 2)
    const fetchMock = vi.fn().mockResolvedValue(respond(detail({ items: [first, last] })))
    vi.stubGlobal('fetch', fetchMock)
    renderAt('/exhibitions/1/artworks')

    await screen.findByRole('heading', { name: 'First artwork' })
    expect(within(screen.getByRole('heading', { name: 'First artwork' }).closest('article')!).getByRole('button', { name: 'Move artwork 1 of 2, First artwork up' })).toBeDisabled()
    expect(within(screen.getByRole('heading', { name: 'Last artwork' }).closest('article')!).getByRole('button', { name: 'Move artwork 2 of 2, Last artwork down' })).toBeDisabled()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('selects a cover using the included artwork ID and displays the committed cover', async () => {
    const first = curatedItem('First artwork', 1)
    const second = curatedItem('Second artwork', 2)
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(respond(detail({ items: [first, second] })))
      .mockResolvedValueOnce(respond(detail({ items: [first, second], coverArtworkId: second.artwork.id })))
    vi.stubGlobal('fetch', fetchMock)
    renderAt('/exhibitions/1/artworks')

    await userEvent.click(await screen.findByRole('button', { name: 'Set artwork 2 of 2, Second artwork as cover' }))

    expect(await screen.findByText('Cover updated.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Clear cover, artwork 2 of 2, Second artwork' })).toBeInTheDocument()
    expect(within(screen.getByRole('heading', { name: 'Second artwork' }).closest('article')!).getByText('Current cover')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/exhibitions/1/cover',
      expect.objectContaining({ method: 'PUT', body: JSON.stringify({ artworkId: second.artwork.id }) }),
    )
  })

  it('replaces the cover and uses the committed response rather than the requested artwork', async () => {
    const first = curatedItem('First artwork', 1)
    const second = curatedItem('Second artwork', 2)
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(respond(detail({ items: [first, second], coverArtworkId: first.artwork.id })))
      .mockResolvedValueOnce(respond(detail({ items: [first, second], coverArtworkId: first.artwork.id })))
    vi.stubGlobal('fetch', fetchMock)
    renderAt('/exhibitions/1/artworks')

    await userEvent.click(await screen.findByRole('button', { name: 'Replace cover with artwork 2 of 2, Second artwork' }))

    expect(await screen.findByText('Cover updated.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Clear cover, artwork 1 of 2, First artwork' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Clear cover, artwork 2 of 2, Second artwork' })).not.toBeInTheDocument()
  })

  it('clears the cover from the committed response', async () => {
    const first = curatedItem('First artwork', 1)
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(respond(detail({ items: [first], coverArtworkId: first.artwork.id })))
      .mockResolvedValueOnce(respond(detail({ items: [first] })))
    vi.stubGlobal('fetch', fetchMock)
    renderAt('/exhibitions/1/artworks')

    await userEvent.click(await screen.findByRole('button', { name: 'Clear cover, artwork 1 of 1, First artwork' }))

    expect(await screen.findByText('Cover cleared.')).toBeInTheDocument()
    expect(screen.getByText('No cover selected. Choose an artwork below to use as the exhibition cover.')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/exhibitions/1/cover', expect.objectContaining({ method: 'DELETE' }))
  })

  it('displays an invalid-cover conflict without changing the current cover', async () => {
    const first = curatedItem('First artwork', 1)
    const second = curatedItem('Second artwork', 2)
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(respond(detail({ items: [first, second], coverArtworkId: first.artwork.id })))
      .mockResolvedValueOnce(respond(error('INVALID_COVER_ARTWORK', 'That artwork is not in this exhibition.', 409), 409))
    vi.stubGlobal('fetch', fetchMock)
    renderAt('/exhibitions/1/artworks')

    await userEvent.click(await screen.findByRole('button', { name: 'Replace cover with artwork 2 of 2, Second artwork' }))

    expect(await screen.findByText('That artwork is not in this exhibition.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Clear cover, artwork 1 of 2, First artwork' })).toBeInTheDocument()
  })

  it('shows the exhibition-not-found state when cover selection reports a missing exhibition', async () => {
    const first = curatedItem('First artwork', 1)
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(respond(detail({ items: [first] })))
      .mockResolvedValueOnce(respond(error('EXHIBITION_NOT_FOUND', 'Missing exhibition.', 404), 404))
    vi.stubGlobal('fetch', fetchMock)
    renderAt('/exhibitions/1/artworks')

    await userEvent.click(await screen.findByRole('button', { name: 'Set artwork 1 of 1, First artwork as cover' }))

    expect(await screen.findByRole('heading', { name: 'Exhibition not found' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'First artwork' })).not.toBeInTheDocument()
  })

  it('handles a published-read-only cover response', async () => {
    const first = curatedItem('First artwork', 1)
    const second = curatedItem('Committed cover artwork', 1)
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(respond(detail({ items: [first] })))
      .mockResolvedValueOnce(respond(error('PUBLISHED_EXHIBITION_READ_ONLY', 'Read only.', 409), 409))
      .mockResolvedValueOnce(respond(detail({
        status: 'PUBLISHED',
        publishedAt: '2026-08-04T09:00:00Z',
        items: [second],
        coverArtworkId: second.artwork.id,
      })))
    vi.stubGlobal('fetch', fetchMock)
    renderAt('/exhibitions/1/artworks')

    await userEvent.click(await screen.findByRole('button', { name: 'Set artwork 1 of 1, First artwork as cover' }))

    expect(await screen.findByText(/attempted change was not saved because this exhibition is now published/i)).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'First artwork' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Committed cover artwork' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Clear cover, artwork 1 of 1, Committed cover artwork' })).toBeDisabled()
  })

  it('reconciles a published clear-cover conflict without retrying the rejected action', async () => {
    const first = curatedItem('Rejected clear cover', 1)
    const committed = curatedItem('Committed published cover', 1)
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(respond(detail({ items: [first], coverArtworkId: first.artwork.id })))
      .mockResolvedValueOnce(respond(error('PUBLISHED_EXHIBITION_READ_ONLY', 'Read only.', 409), 409))
      .mockResolvedValueOnce(respond(detail({
        status: 'PUBLISHED',
        publishedAt: '2026-08-04T09:00:00Z',
        items: [committed],
        coverArtworkId: committed.artwork.id,
      })))
    vi.stubGlobal('fetch', fetchMock)
    renderAt('/exhibitions/1/artworks')

    await userEvent.click(await screen.findByRole('button', {
      name: 'Clear cover, artwork 1 of 1, Rejected clear cover',
    }))

    expect(await screen.findByText(/committed published version is shown below/i)).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Rejected clear cover' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Committed published cover' })).toBeInTheDocument()
    expect(screen.getByRole('button', {
      name: 'Clear cover, artwork 1 of 1, Committed published cover',
    })).toBeDisabled()
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/exhibitions/1/cover', expect.objectContaining({ method: 'DELETE' }))
    expect(fetchMock).toHaveBeenNthCalledWith(3, '/api/exhibitions/1', expect.any(Object))
  })

  it('prevents duplicate cover submissions while a cover request is pending', async () => {
    let coverSignal: AbortSignal | undefined
    const first = curatedItem('First artwork', 1)
    const fetchMock = vi.fn((path: string, options?: RequestInit) => {
      if (path === '/api/exhibitions/1') return Promise.resolve(respond(detail({ items: [first] })))
      if (path === '/api/exhibitions/1/cover') {
        coverSignal = options?.signal as AbortSignal
        return new Promise<Response>(() => {})
      }
      throw new Error(`Unexpected request: ${path}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    renderAt('/exhibitions/1/artworks')

    const coverButton = await screen.findByRole('button', { name: 'Set artwork 1 of 1, First artwork as cover' })
    await userEvent.click(coverButton)
    expect(screen.getByRole('button', { name: 'Setting cover to artwork 1 of 1, First artwork' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Setting cover to artwork 1 of 1, First artwork' }))

    expect(coverSignal).toBeDefined()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('shows cover-selection progress only on the selected artwork', async () => {
    const first = curatedItem('First artwork', 1)
    const second = curatedItem('Second artwork', 2)
    const third = curatedItem('Third artwork', 3)
    const fetchMock = vi.fn((path: string) => {
      if (path === '/api/exhibitions/1') return Promise.resolve(respond(detail({ items: [first, second, third] })))
      if (path === '/api/exhibitions/1/cover') return new Promise<Response>(() => {})
      throw new Error(`Unexpected request: ${path}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    renderAt('/exhibitions/1/artworks')

    await userEvent.click(await screen.findByRole('button', { name: 'Set artwork 2 of 3, Second artwork as cover' }))

    expect(screen.getByRole('button', { name: 'Setting cover to artwork 2 of 3, Second artwork' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Set artwork 1 of 3, First artwork as cover' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Set artwork 3 of 3, Third artwork as cover' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Setting cover to artwork 1 of 3, First artwork' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Setting cover to artwork 3 of 3, Third artwork' })).not.toBeInTheDocument()
  })

  it('preserves search and curation state while replacing the committed cover', async () => {
    const first = curatedItem('First artwork', 1, 'Committed note')
    const second = curatedItem('Second artwork', 2)
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(respond(detail({ items: [first, second] })))
      .mockResolvedValueOnce(respond(searchPage()))
      .mockResolvedValueOnce(respond(detail({ items: [first, second], coverArtworkId: second.artwork.id })))
    vi.stubGlobal('fetch', fetchMock)
    renderAt('/exhibitions/1/artworks')

    const query = await loadSearchPage()
    await userEvent.type(query, 'night')
    await userEvent.click(screen.getByRole('button', { name: 'Search' }))
    await screen.findByRole('heading', { name: 'Nocturne' })
    await userEvent.clear(screen.getByLabelText('Curatorial note for artwork 1 of 2: First artwork'))
    await userEvent.type(screen.getByLabelText('Curatorial note for artwork 1 of 2: First artwork'), 'Draft note')
    await userEvent.click(screen.getByRole('button', { name: 'Set artwork 2 of 2, Second artwork as cover' }))

    await screen.findByText('Cover updated.')
    expect(query).toHaveValue('night')
    expect(screen.getByRole('heading', { name: 'Nocturne' })).toBeInTheDocument()
    expect(screen.getByLabelText('Curatorial note for artwork 1 of 2: First artwork')).toHaveValue('Draft note')
    expect(within(screen.getByRole('list')).getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent)).toEqual(['First artwork', 'Second artwork'])
  })

  it('aborts a stale cover request when the artwork route changes', async () => {
    let coverSignal: AbortSignal | undefined
    const first = curatedItem('First artwork', 1)
    const fetchMock = vi.fn((path: string, options?: RequestInit) => {
      if (path === '/api/exhibitions/1') return Promise.resolve(respond(detail({ items: [first] })))
      if (path === '/api/exhibitions/1/cover') {
        coverSignal = options?.signal as AbortSignal
        return new Promise<Response>((_, reject) => {
          coverSignal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
        })
      }
      if (path === '/api/exhibitions/2') return Promise.resolve(respond(detail({ id: 2, title: 'Second exhibition' })))
      throw new Error(`Unexpected request: ${path}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    renderAt('/exhibitions/1/artworks')

    await userEvent.click(await screen.findByRole('button', { name: 'Set artwork 1 of 1, First artwork as cover' }))
    await waitFor(() => expect(coverSignal).toBeDefined())
    await act(async () => { await appRouter.navigate('/exhibitions/2/artworks') })

    await waitFor(() => expect(coverSignal?.aborted).toBe(true))
    expect(await screen.findByText(/Second exhibition/)).toBeInTheDocument()
  })

  it('gives same-titled artworks distinct note, move, and remove names', async () => {
    const first = curatedItem('Untitled', 1)
    const second = curatedItem('Untitled', 2)
    const fetchMock = vi.fn().mockResolvedValue(respond(detail({ items: [first, second] })))
    vi.stubGlobal('fetch', fetchMock)
    renderAt('/exhibitions/1/artworks')

    await screen.findAllByRole('heading', { name: 'Untitled' })
    expect(screen.getByLabelText('Curatorial note for artwork 1 of 2: Untitled')).toBeInTheDocument()
    expect(screen.getByLabelText('Curatorial note for artwork 2 of 2: Untitled')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Move artwork 1 of 2, Untitled up' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Move artwork 2 of 2, Untitled down' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove artwork 1 of 2, Untitled from exhibition' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove artwork 2 of 2, Untitled from exhibition' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Set artwork 1 of 2, Untitled as cover' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Set artwork 2 of 2, Untitled as cover' })).toBeInTheDocument()
  })

  it('requires removal confirmation and replaces the item list after deletion', async () => {
    const first = curatedItem('First artwork', 1)
    const second = curatedItem('Second artwork', 2)
    const remaining = { ...second, position: 1 }
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(respond(detail({ items: [first, second], coverArtworkId: first.artwork.id })))
      .mockResolvedValueOnce(respond(detail({ items: [remaining] })))
    vi.stubGlobal('fetch', fetchMock)
    renderAt('/exhibitions/1/artworks')

    const firstRow = () => within(screen.getByRole('heading', { name: 'First artwork' }).closest('article')!)
    await screen.findByRole('heading', { name: 'First artwork' })
    await userEvent.click(firstRow().getByRole('button', { name: 'Remove artwork 1 of 2, First artwork from exhibition' }))
    expect(await screen.findByRole('button', { name: 'Confirm removal of artwork 1 of 2, First artwork' })).toHaveFocus()
    await userEvent.click(screen.getByRole('button', { name: 'Keep artwork 1 of 2, First artwork in exhibition' }))
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(firstRow().getByRole('button', { name: 'Remove artwork 1 of 2, First artwork from exhibition' })).toHaveFocus()

    await userEvent.click(firstRow().getByRole('button', { name: 'Remove artwork 1 of 2, First artwork from exhibition' }))
    await userEvent.click(screen.getByRole('button', { name: 'Confirm removal of artwork 1 of 2, First artwork' }))
    expect(await screen.findByText('Artwork removed.')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'First artwork' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Second artwork' })).toBeInTheDocument()
    expect(screen.getByText('No cover selected. Choose an artwork below to use as the exhibition cover.')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/exhibitions/1/items/1', expect.objectContaining({ method: 'DELETE' }))
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('deletes a non-cover item and installs the authoritative cover, order, and count', async () => {
    const cover = curatedItem('Cover artwork', 1)
    const removed = curatedItem('Removed artwork', 2)
    const last = curatedItem('Last artwork', 3)
    const committedLast = { ...last, position: 2 }
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(respond(detail({
        items: [cover, removed, last],
        coverArtworkId: cover.artwork.id,
      })))
      .mockResolvedValueOnce(respond(detail({
        items: [cover, committedLast],
        coverArtworkId: cover.artwork.id,
      })))
    vi.stubGlobal('fetch', fetchMock)
    renderAt('/exhibitions/1/artworks')

    await userEvent.click(await screen.findByRole('button', {
      name: 'Remove artwork 2 of 3, Removed artwork from exhibition',
    }))
    await userEvent.click(screen.getByRole('button', {
      name: 'Confirm removal of artwork 2 of 3, Removed artwork',
    }))

    expect(await screen.findByText('Artwork removed.')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Removed artwork' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Current artworks (2/10)' })).toBeInTheDocument()
    expect(screen.getByRole('button', {
      name: 'Clear cover, artwork 1 of 2, Cover artwork',
    })).toBeInTheDocument()
    expect(screen.getByRole('button', {
      name: 'Move artwork 2 of 2, Last artwork down',
    })).toBeDisabled()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('preserves an unrelated dirty note and navigation protection after deletion', async () => {
    const first = curatedItem('Artwork with draft', 1, 'Committed first note')
    const second = curatedItem('Artwork to remove', 2, 'Committed second note')
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(respond(detail({ items: [first, second] })))
      .mockResolvedValueOnce(respond(detail({ items: [first] })))
    vi.stubGlobal('fetch', fetchMock)
    renderAt('/exhibitions/1/artworks')

    const firstNote = await screen.findByLabelText('Curatorial note for artwork 1 of 2: Artwork with draft')
    await userEvent.clear(firstNote)
    await userEvent.type(firstNote, 'Unsaved note that must survive')
    await userEvent.click(screen.getByRole('button', {
      name: 'Remove artwork 2 of 2, Artwork to remove from exhibition',
    }))
    await userEvent.click(screen.getByRole('button', {
      name: 'Confirm removal of artwork 2 of 2, Artwork to remove',
    }))

    await screen.findByText('Artwork removed.')
    expect(screen.queryByRole('heading', { name: 'Artwork to remove' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('Curatorial note for artwork 1 of 1: Artwork with draft'))
      .toHaveValue('Unsaved note that must survive')
    await userEvent.click(screen.getByRole('link', { name: 'Preview exhibition' }))
    expect(await screen.findByRole('alertdialog')).toBeInTheDocument()
    expect(window.location.pathname).toBe('/exhibitions/1/artworks')
  })

  it('discards a removed item draft so navigation is clean after committed replacement', async () => {
    const first = curatedItem('First artwork', 1, 'Committed note')
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(respond(detail({ items: [first] })))
      .mockResolvedValueOnce(respond(detail({ items: [] })))
      .mockResolvedValueOnce(respond(detail({ items: [] })))
    vi.stubGlobal('fetch', fetchMock)
    renderAt('/exhibitions/1/artworks')

    const note = await screen.findByLabelText('Curatorial note for artwork 1 of 1: First artwork')
    await userEvent.clear(note)
    await userEvent.type(note, 'Draft that belongs to removed item')
    await userEvent.click(screen.getByRole('button', { name: 'Remove artwork 1 of 1, First artwork from exhibition' }))
    await userEvent.click(screen.getByRole('button', { name: 'Confirm removal of artwork 1 of 1, First artwork' }))
    await screen.findByText('Artwork removed.')

    await userEvent.click(screen.getByRole('link', { name: 'Preview exhibition' }))

    expect(await screen.findByText('Draft preview')).toBeInTheDocument()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('preserves the current list when removal fails', async () => {
    const first = curatedItem('First artwork', 1)
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(respond(detail({ items: [first] })))
      .mockResolvedValueOnce(respond(error('INTERNAL_ERROR', 'Could not remove artwork.', 500), 500))
    vi.stubGlobal('fetch', fetchMock)
    renderAt('/exhibitions/1/artworks')

    await screen.findByRole('heading', { name: 'First artwork' })
    await userEvent.click(screen.getByRole('button', { name: 'Remove artwork 1 of 1, First artwork from exhibition' }))
    await userEvent.click(screen.getByRole('button', { name: 'Confirm removal of artwork 1 of 1, First artwork' }))

    expect(await screen.findByText('Could not remove artwork.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Current artworks (1/10)' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'First artwork' })).toBeInTheDocument()
  })

  it('does not require a follow-up request after the deletion response commits', async () => {
    const first = curatedItem('First artwork', 1)
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(respond(detail({ items: [first] })))
      .mockResolvedValueOnce(respond(detail({ items: [] })))
    vi.stubGlobal('fetch', fetchMock)
    renderAt('/exhibitions/1/artworks')

    await screen.findByRole('heading', { name: 'First artwork' })
    await userEvent.click(screen.getByRole('button', { name: 'Remove artwork 1 of 1, First artwork from exhibition' }))
    await userEvent.click(screen.getByRole('button', { name: 'Confirm removal of artwork 1 of 1, First artwork' }))

    expect(await screen.findByText('Artwork removed.')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'First artwork' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Confirm removal of artwork 1 of 1, First artwork' })).not.toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('sends only one delete request while committed deletion is pending', async () => {
    const first = curatedItem('First artwork', 1)
    let resolveDeletion: ((response: Response) => void) | undefined
    const fetchMock = vi.fn((path: string, options?: RequestInit) => {
      if (path === '/api/exhibitions/1' && !options?.method) {
        return Promise.resolve(respond(detail({ items: [first] })))
      }
      if (path === '/api/exhibitions/1/items/1' && options?.method === 'DELETE') {
        return new Promise<Response>((resolve) => { resolveDeletion = resolve })
      }
      throw new Error(`Unexpected request: ${path}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    renderAt('/exhibitions/1/artworks')

    await userEvent.click(await screen.findByRole('button', { name: 'Remove artwork 1 of 1, First artwork from exhibition' }))
    const confirm = screen.getByRole('button', { name: 'Confirm removal of artwork 1 of 1, First artwork' })
    await userEvent.click(confirm)
    await userEvent.click(confirm)

    expect(fetchMock).toHaveBeenCalledTimes(2)
    resolveDeletion?.(respond(detail({ items: [] })))
    expect(await screen.findByText('Artwork removed.')).toBeInTheDocument()
  })

  it('ignores a late committed deletion response after changing exhibition routes', async () => {
    const first = curatedItem('First route artwork', 1)
    const second = curatedItem('Second route artwork', 1)
    let deletionSignal: AbortSignal | undefined
    let resolveDeletion: ((response: Response) => void) | undefined
    const fetchMock = vi.fn((path: string, options?: RequestInit) => {
      if (path === '/api/exhibitions/1' && !options?.method) {
        return Promise.resolve(respond(detail({ id: 1, title: 'First exhibition', items: [first] })))
      }
      if (path === '/api/exhibitions/1/items/1' && options?.method === 'DELETE') {
        deletionSignal = options.signal as AbortSignal
        return new Promise<Response>((resolve) => { resolveDeletion = resolve })
      }
      if (path === '/api/exhibitions/2' && !options?.method) {
        return Promise.resolve(respond(detail({ id: 2, title: 'Second exhibition', items: [second] })))
      }
      throw new Error(`Unexpected request: ${path}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    renderAt('/exhibitions/1/artworks')

    await userEvent.click(await screen.findByRole('button', { name: 'Remove artwork 1 of 1, First route artwork from exhibition' }))
    await userEvent.click(screen.getByRole('button', { name: 'Confirm removal of artwork 1 of 1, First route artwork' }))
    await act(async () => { await appRouter.navigate('/exhibitions/2/artworks') })

    expect(await screen.findByRole('heading', { name: 'Second route artwork' })).toBeInTheDocument()
    expect(deletionSignal?.aborted).toBe(true)
    resolveDeletion?.(respond(detail({ id: 1, title: 'First exhibition', items: [] })))
    await act(async () => { await Promise.resolve() })
    expect(screen.getByRole('heading', { name: 'Second route artwork' })).toBeInTheDocument()
    expect(screen.queryByText('Artwork removed.')).not.toBeInTheDocument()
  })

  it('reconciles capacity and add state from the post-delete refresh', async () => {
    const initial = curatedItem('Initially loaded artwork', 1)
    const fullItems = Array.from({ length: 10 }, (_, index) => (
      curatedItem(`Committed artwork ${index + 1}`, index + 1)
    ))
    const remainingItems = fullItems.slice(1).map((entry, index) => ({
      ...entry,
      position: index + 1,
    }))
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(respond(detail({ items: [initial] })))
      .mockResolvedValueOnce(respond(searchPage([
        searchArtwork(),
        searchArtwork({ externalId: 'moonlight', title: 'Moonlight' }),
      ])))
      .mockResolvedValueOnce(respond(error('DUPLICATE_EXHIBITION_ARTWORK', 'Duplicate.', 409), 409))
      .mockResolvedValueOnce(respond(error('EXHIBITION_ARTWORK_LIMIT_REACHED', 'At capacity.', 409), 409))
      .mockResolvedValueOnce(respond(detail({ items: fullItems })))
      .mockResolvedValueOnce(respond(detail({ items: remainingItems })))
    vi.stubGlobal('fetch', fetchMock)
    renderAt('/exhibitions/1/artworks')

    await userEvent.type(await loadSearchPage(), 'night')
    await userEvent.click(screen.getByRole('button', { name: 'Search' }))
    await screen.findByRole('heading', { name: 'Nocturne' })
    await userEvent.click(within(screen.getByRole('heading', { name: 'Nocturne' }).closest('article')!).getByRole('button', { name: 'Add artwork' }))
    await userEvent.click(within(screen.getByRole('heading', { name: 'Moonlight' }).closest('article')!).getByRole('button', { name: 'Add artwork' }))
    await screen.findByRole('heading', { name: 'Current artworks (10/10)' })
    await userEvent.click(screen.getByRole('button', { name: 'Remove artwork 1 of 10, Committed artwork 1 from exhibition' }))
    await userEvent.click(screen.getByRole('button', { name: 'Confirm removal of artwork 1 of 10, Committed artwork 1' }))

    expect(await screen.findByRole('heading', { name: 'Current artworks (9/10)' })).toBeInTheDocument()
    expect(screen.queryByText('This exhibition has reached its 10-artwork limit.')).not.toBeInTheDocument()
    expect(screen.queryByText(/maximum of 10 artworks/)).not.toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Add artwork' })).toHaveLength(2)
    expect(screen.getAllByRole('button', { name: 'Add artwork' }).every((button) => !button.hasAttribute('disabled'))).toBe(true)
    expect(screen.getByRole('heading', { name: 'Nocturne' })).toBeInTheDocument()
  })

  it('distinguishes missing items from a missing exhibition', async () => {
    const first = curatedItem('First artwork', 1)
    const itemMissingFetch = vi.fn()
      .mockResolvedValueOnce(respond(detail({ items: [first] })))
      .mockResolvedValueOnce(respond(error('EXHIBITION_ITEM_NOT_FOUND', 'Missing item.', 404), 404))
    vi.stubGlobal('fetch', itemMissingFetch)
    renderAt('/exhibitions/1/artworks')

    await userEvent.click(await screen.findByRole('button', { name: /Save note for artwork/ }))
    expect(await screen.findByText(/This artwork is no longer available/)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'First artwork' })).toBeInTheDocument()

    cleanup()
    const exhibitionMissingFetch = vi.fn()
      .mockResolvedValueOnce(respond(detail({ items: [first] })))
      .mockResolvedValueOnce(respond(error('EXHIBITION_NOT_FOUND', 'Missing exhibition.', 404), 404))
    vi.stubGlobal('fetch', exhibitionMissingFetch)
    renderAt('/exhibitions/1/artworks')

    await userEvent.click(await screen.findByRole('button', { name: /Save note for artwork/ }))
    expect(await screen.findByRole('heading', { name: 'Exhibition not found' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'First artwork' })).not.toBeInTheDocument()
  })

  it('handles a published-read-only item mutation response', async () => {
    const first = curatedItem('First artwork', 1, 'Original note')
    const committed = curatedItem('First artwork', 1, 'Committed published note')
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(respond(detail({ items: [first] })))
      .mockResolvedValueOnce(respond(error('PUBLISHED_EXHIBITION_READ_ONLY', 'Read only.', 409), 409))
      .mockResolvedValueOnce(respond(detail({
        status: 'PUBLISHED',
        publishedAt: '2026-08-04T09:00:00Z',
        items: [committed],
      })))
    vi.stubGlobal('fetch', fetchMock)
    renderAt('/exhibitions/1/artworks')

    const note = await screen.findByLabelText('Curatorial note for artwork 1 of 1: First artwork')
    await userEvent.clear(note)
    await userEvent.type(note, 'Rejected draft note')
    await userEvent.click(screen.getByRole('button', { name: /Save note for artwork/ }))

    expect(await screen.findByText(/attempted change was not saved because this exhibition is now published/i)).toBeInTheDocument()
    expect(screen.getByLabelText('Curatorial note for artwork 1 of 1: First artwork')).toHaveValue('Committed published note')
    expect(screen.queryByDisplayValue('Rejected draft note')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Save note for artwork/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Remove artwork 1 of 1, First artwork from exhibition' })).toBeDisabled()
  })

  it('keeps authoring locked after reconciliation fails and installs committed notes on retry', async () => {
    const first = curatedItem('First artwork', 1, 'Original note')
    const committed = curatedItem('First artwork', 1, 'Recovered committed note')
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(respond(detail({ items: [first] })))
      .mockResolvedValueOnce(respond(error('PUBLISHED_EXHIBITION_READ_ONLY', 'Read only.', 409), 409))
      .mockRejectedValueOnce(new TypeError('Connection lost'))
      .mockResolvedValueOnce(respond(detail({
        status: 'PUBLISHED',
        publishedAt: '2026-08-04T09:00:00Z',
        items: [committed],
      })))
    vi.stubGlobal('fetch', fetchMock)
    renderAt('/exhibitions/1/artworks')

    const note = await screen.findByLabelText('Curatorial note for artwork 1 of 1: First artwork')
    await userEvent.clear(note)
    await userEvent.type(note, 'Unsaved rejected note')
    await userEvent.click(screen.getByRole('button', { name: /Save note for artwork/ }))

    expect(await screen.findByText(/displayed information may be stale or unsaved/i)).toBeInTheDocument()
    expect(note).toHaveValue('Unsaved rejected note')
    expect(note).toBeDisabled()
    const retryButton = screen.getByRole('button', { name: 'Retry loading committed version' })
    expect(retryButton).toHaveFocus()
    expect(document.activeElement).not.toBe(document.body)
    await userEvent.click(retryButton)

    expect(await screen.findByDisplayValue('Recovered committed note')).toBeDisabled()
    expect(screen.queryByDisplayValue('Unsaved rejected note')).not.toBeInTheDocument()
    expect(screen.getByText(/committed published version is shown below/i)).toHaveFocus()
  })

  it('does not steal artwork reconciliation focus when the curator moves elsewhere', async () => {
    const first = curatedItem('First artwork', 1, 'Original note')
    let resolveReconciliation: ((response: Response) => void) | undefined
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(respond(detail({ items: [first] })))
      .mockResolvedValueOnce(respond(error('PUBLISHED_EXHIBITION_READ_ONLY', 'Read only.', 409), 409))
      .mockImplementationOnce(() => new Promise<Response>((resolve) => {
        resolveReconciliation = resolve
      }))
    vi.stubGlobal('fetch', fetchMock)
    renderAt('/exhibitions/1/artworks')

    await userEvent.click(await screen.findByRole('button', { name: /Save note for artwork/ }))
    await screen.findByText(/loading the committed published version/i)
    const previewLink = screen.getByRole('link', { name: 'Preview exhibition' })
    previewLink.focus()
    expect(previewLink).toHaveFocus()
    resolveReconciliation?.(respond(detail({
      status: 'PUBLISHED',
      publishedAt: '2026-08-04T09:00:00Z',
      items: [first],
    })))

    await screen.findByText(/committed published version is shown below/i)
    expect(previewLink).toHaveFocus()
    expect(document.activeElement).not.toBe(document.body)
  })

  it('ignores a stale artwork reconciliation response after changing exhibitions', async () => {
    const first = curatedItem('First exhibition artwork', 1)
    const second = curatedItem('Second exhibition artwork', 1, 'Second draft note')
    let reconciliationSignal: AbortSignal | undefined
    let resolveReconciliation: ((response: Response) => void) | undefined
    let firstLoadComplete = false
    const fetchMock = vi.fn((path: string, options?: RequestInit) => {
      if (path === '/api/exhibitions/1' && !options?.method && !firstLoadComplete) {
        firstLoadComplete = true
        return Promise.resolve(respond(detail({ id: 1, title: 'First exhibition', items: [first] })))
      }
      if (path === '/api/exhibitions/1/cover' && options?.method === 'PUT') {
        return Promise.resolve(respond(error('PUBLISHED_EXHIBITION_READ_ONLY', 'Read only.', 409), 409))
      }
      if (path === '/api/exhibitions/1' && !options?.method) {
        reconciliationSignal = options?.signal as AbortSignal
        return new Promise<Response>((resolve) => { resolveReconciliation = resolve })
      }
      if (path === '/api/exhibitions/2' && !options?.method) {
        return Promise.resolve(respond(detail({
          id: 2,
          title: 'Second exhibition',
          items: [second],
          coverArtworkId: second.artwork.id,
        })))
      }
      throw new Error(`Unexpected request: ${path}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    renderAt('/exhibitions/1/artworks')

    await userEvent.click(await screen.findByRole('button', {
      name: 'Set artwork 1 of 1, First exhibition artwork as cover',
    }))
    await screen.findByText(/loading the committed published version/i)
    await act(async () => { await appRouter.navigate('/exhibitions/2/artworks') })

    expect(await screen.findByRole('heading', { name: 'Second exhibition artwork' })).toBeInTheDocument()
    expect(screen.getByRole('button', {
      name: 'Clear cover, artwork 1 of 1, Second exhibition artwork',
    })).toBeInTheDocument()
    expect(screen.getByLabelText('Curatorial note for artwork 1 of 1: Second exhibition artwork'))
      .toHaveValue('Second draft note')
    expect(reconciliationSignal?.aborted).toBe(true)
    resolveReconciliation?.(respond(detail({
      id: 1,
      title: 'Stale published exhibition',
      status: 'PUBLISHED',
      publishedAt: '2026-08-04T09:00:00Z',
      items: [],
      coverArtworkId: null,
    })))
    await act(async () => { await Promise.resolve() })

    expect(screen.getByRole('heading', { name: 'Second exhibition artwork' })).toBeInTheDocument()
    expect(screen.queryByText('Stale published exhibition')).not.toBeInTheDocument()
    expect(screen.queryByText(/published and read-only/i)).not.toBeInTheDocument()
    expect(screen.getByLabelText('Curatorial note for artwork 1 of 1: Second exhibition artwork'))
      .toHaveValue('Second draft note')
  })

  it('replaces order, cover, and count after a move conflict', async () => {
    const first = curatedItem('First artwork', 1)
    const second = curatedItem('Second artwork', 2)
    const committedSecond = { ...second, position: 1 }
    const committedFirst = { ...first, position: 2 }
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(respond(detail({ items: [first, second] })))
      .mockResolvedValueOnce(respond(error('PUBLISHED_EXHIBITION_READ_ONLY', 'Read only.', 409), 409))
      .mockResolvedValueOnce(respond(detail({
        status: 'PUBLISHED',
        publishedAt: '2026-08-04T09:00:00Z',
        items: [committedSecond, committedFirst],
        coverArtworkId: second.artwork.id,
      })))
    vi.stubGlobal('fetch', fetchMock)
    renderAt('/exhibitions/1/artworks')

    await userEvent.click(await screen.findByRole('button', { name: 'Move artwork 2 of 2, Second artwork up' }))

    expect(await screen.findByText(/attempted change was not saved because this exhibition is now published/i)).toBeInTheDocument()
    expect(within(screen.getByRole('list')).getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent))
      .toEqual(['Second artwork', 'First artwork'])
    expect(screen.getByRole('button', { name: 'Clear cover, artwork 1 of 2, Second artwork' })).toBeDisabled()
  })

  it('replaces the full committed item set after a remove conflict', async () => {
    const first = curatedItem('First artwork', 1)
    const second = curatedItem('Second artwork', 2)
    const authoritative = curatedItem('Authoritative artwork', 1, 'Server note')
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(respond(detail({ items: [first, second] })))
      .mockResolvedValueOnce(respond(error('PUBLISHED_EXHIBITION_READ_ONLY', 'Read only.', 409), 409))
      .mockResolvedValueOnce(respond(detail({
        status: 'PUBLISHED',
        publishedAt: '2026-08-04T09:00:00Z',
        items: [authoritative],
        coverArtworkId: authoritative.artwork.id,
      })))
    vi.stubGlobal('fetch', fetchMock)
    renderAt('/exhibitions/1/artworks')

    await userEvent.click(await screen.findByRole('button', { name: 'Remove artwork 1 of 2, First artwork from exhibition' }))
    await userEvent.click(screen.getByRole('button', { name: 'Confirm removal of artwork 1 of 2, First artwork' }))

    expect(await screen.findByText(/attempted change was not saved because this exhibition is now published/i)).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'First artwork' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Second artwork' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Authoritative artwork' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Current artworks (1/10)' })).toBeInTheDocument()
  })

  it('prevents duplicate note submissions while a mutation is pending', async () => {
    let mutationSignal: AbortSignal | undefined
    const first = curatedItem('First artwork', 1)
    const second = curatedItem('Second artwork', 2)
    const fetchMock = vi.fn((path: string, options?: RequestInit) => {
      if (path === '/api/exhibitions/1') return Promise.resolve(respond(detail({ items: [first, second] })))
      if (path === '/api/exhibitions/1/items/1') {
        mutationSignal = options?.signal as AbortSignal
        return new Promise<Response>(() => {})
      }
      throw new Error(`Unexpected request: ${path}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    renderAt('/exhibitions/1/artworks')

    const firstRow = within((await screen.findByRole('heading', { name: 'First artwork' })).closest('article')!)
    const secondRow = within(screen.getByRole('heading', { name: 'Second artwork' }).closest('article')!)
    await userEvent.click(firstRow.getByRole('button', { name: 'Save note for artwork 1 of 2, First artwork' }))
    expect(firstRow.getByRole('button', { name: 'Saving note for artwork 1 of 2, First artwork' })).toBeDisabled()
    expect(secondRow.getByRole('button', { name: 'Save note for artwork 2 of 2, Second artwork' })).toBeDisabled()
    await userEvent.click(firstRow.getByRole('button', { name: 'Saving note for artwork 1 of 2, First artwork' }))

    expect(mutationSignal).toBeDefined()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('aborts a stale item mutation when the artwork route changes', async () => {
    let mutationSignal: AbortSignal | undefined
    const first = curatedItem('First artwork', 1)
    const second = curatedItem('Second artwork', 2)
    const fetchMock = vi.fn((path: string, options?: RequestInit) => {
      if (path === '/api/exhibitions/1') return Promise.resolve(respond(detail({ items: [first, second] })))
      if (path === '/api/exhibitions/1/items/2/move-up') {
        mutationSignal = options?.signal as AbortSignal
        return new Promise<Response>((_, reject) => {
          mutationSignal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
        })
      }
      if (path === '/api/exhibitions/2') return Promise.resolve(respond(detail({ id: 2, title: 'Second exhibition' })))
      throw new Error(`Unexpected request: ${path}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    renderAt('/exhibitions/1/artworks')

    await screen.findByRole('heading', { name: 'Second artwork' })
    await userEvent.click(within(screen.getByRole('heading', { name: 'Second artwork' }).closest('article')!).getByRole('button', { name: 'Move artwork 2 of 2, Second artwork up' }))
    await waitFor(() => expect(mutationSignal).toBeDefined())
    await act(async () => { await appRouter.navigate('/exhibitions/2/artworks') })

    await waitFor(() => expect(mutationSignal?.aborted).toBe(true))
    expect(await screen.findByText(/Second exhibition/)).toBeInTheDocument()
  })
})
