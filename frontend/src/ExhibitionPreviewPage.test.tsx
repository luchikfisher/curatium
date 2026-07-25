import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'

function artwork(overrides: Record<string, unknown> = {}) {
  return {
    id: 101,
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

function item(position: number, overrides: Record<string, unknown> = {}) {
  return {
    id: position + 10,
    position,
    artwork: artwork({ id: position + 100, externalId: String(position), ...overrides }),
    curatorialNote: `Note for artwork ${position}.`,
  }
}

function detail(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    title: 'Lines of Light',
    summary: 'A study of light and form.',
    introduction: 'An introductory text.',
    status: 'DRAFT',
    coverArtworkId: null,
    items: [],
    createdAt: '2026-07-18T12:00:00Z',
    updatedAt: '2026-07-19T12:00:00Z',
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
})

describe('curator exhibition preview', () => {
  it('renders a complete draft preview from curator detail data', async () => {
    const first = item(1)
    const second = item(2, { title: 'Moonlit Harbor', artistDisplay: null, dateDisplay: null, mediumDisplay: null, creditLine: null })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respond(detail({ items: [second, first], coverArtworkId: first.artwork.id }))))
    renderAt('/exhibitions/1/preview')

    expect(await screen.findByRole('heading', { name: 'Lines of Light' })).toBeInTheDocument()
    expect(screen.getByText('Draft preview')).toBeInTheDocument()
    expect(screen.getByText('A study of light and form.')).toBeInTheDocument()
    expect(screen.getByText('An introductory text.')).toBeInTheDocument()
    expect(screen.getByText('This draft is visible only in the curator workspace.')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Cover artwork: Nocturne' })).toBeInTheDocument()
    expect(screen.getByText('Note for artwork 1.')).toBeInTheDocument()
    expect(screen.getByText('Artist unknown')).toBeInTheDocument()
    expect(screen.getAllByText('Public domain')).toHaveLength(2)
    expect(screen.getAllByRole('link', { name: 'View artwork source' })[0]).toHaveAttribute('href', 'https://museum.example/artworks/154235')
  })

  it('renders a complete published preview without using the public endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(respond(detail({
      status: 'PUBLISHED',
      publishedAt: '2026-07-20T12:00:00Z',
      items: [item(1)],
    })))
    vi.stubGlobal('fetch', fetchMock)
    renderAt('/exhibitions/1/preview')

    expect(await screen.findByText('Published exhibition')).toBeInTheDocument()
    expect(screen.getByText('This is the curator view of a published exhibition.')).toBeInTheDocument()
    expect(screen.getByText('Published', { selector: 'dd' })).toBeInTheDocument()
    expect(screen.getByText('Published', { selector: 'dt' })).toBeInTheDocument()
    expect(screen.getByText('Created', { selector: 'dt' })).toBeInTheDocument()
    expect(screen.getByText('Last updated', { selector: 'dt' })).toBeInTheDocument()
    expect(document.querySelector('time[datetime="2026-07-20T12:00:00Z"]')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith('/api/exhibitions/1', expect.any(Object))
    expect(fetchMock).not.toHaveBeenCalledWith('/api/public/exhibitions/1', expect.anything())
  })

  it('renders artworks in committed position order', async () => {
    const first = item(1, { title: 'First committed artwork' })
    const second = item(2, { title: 'Second committed artwork' })
    const third = item(3, { title: 'Third committed artwork' })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respond(detail({ items: [third, first, second] }))))
    renderAt('/exhibitions/1/preview')

    await screen.findByRole('heading', { name: 'First committed artwork' })
    expect(within(screen.getByRole('list')).getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent)).toEqual([
      'First committed artwork', 'Second committed artwork', 'Third committed artwork',
    ])
  })

  it('normalizes omitted nullable fields and shows sensible empty states', async () => {
    const noNote = item(1)
    delete (noNote as { curatorialNote?: string }).curatorialNote
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respond(detail({
      summary: undefined,
      introduction: undefined,
      coverArtworkId: undefined,
      items: [noNote],
    }))))
    renderAt('/exhibitions/1/preview')

    expect(await screen.findByText('No summary has been provided.')).toBeInTheDocument()
    expect(screen.getByText('No introduction has been provided.')).toBeInTheDocument()
    expect(screen.getByText('No cover artwork has been selected.')).toBeInTheDocument()
    expect(screen.getByText('No curatorial note.')).toBeInTheDocument()
  })

  it('renders an empty exhibition state', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respond(detail())))
    renderAt('/exhibitions/1/preview')

    expect(await screen.findByRole('heading', { name: 'Artworks (0)' })).toBeInTheDocument()
    expect(screen.getByText('No artworks have been added to this exhibition.')).toBeInTheDocument()
  })

  it('handles an invalid route ID without loading', () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    renderAt('/exhibitions/not-an-id/preview')

    expect(screen.getByRole('heading', { name: 'Invalid exhibition address' })).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('shows not found and retries loading the preview', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(respond(error('EXHIBITION_NOT_FOUND', 'No exhibition found.', 404), 404))
      .mockResolvedValueOnce(respond(detail({ title: 'Recovered preview' })))
    vi.stubGlobal('fetch', fetchMock)
    renderAt('/exhibitions/1/preview')

    expect(await screen.findByRole('heading', { name: 'Exhibition not found' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('heading', { name: 'Recovered preview' })).toBeInTheDocument()
  })

  it('displays a recoverable malformed-response error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respond({ id: 1, title: 'Incomplete' })))
    renderAt('/exhibitions/1/preview')

    expect(await screen.findByRole('heading', { name: 'We could not load this preview' })).toBeInTheDocument()
    expect(screen.getByText('The server returned data Curatium could not understand.')).toBeInTheDocument()
  })

  it('aborts a stale preview request when the route changes', async () => {
    let firstSignal: AbortSignal | undefined
    const fetchMock = vi.fn((path: string, options?: RequestInit) => {
      if (path === '/api/exhibitions/1') {
        firstSignal = options?.signal as AbortSignal
        return new Promise<Response>((_, reject) => {
          firstSignal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
        })
      }
      if (path === '/api/exhibitions/2') return Promise.resolve(respond(detail({ id: 2, title: 'Second preview' })))
      throw new Error(`Unexpected request: ${path}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    renderAt('/exhibitions/1/preview')

    expect(await screen.findByText('Loading curator preview…')).toBeInTheDocument()
    window.history.pushState({}, '', '/exhibitions/2/preview')
    window.dispatchEvent(new PopStateEvent('popstate'))

    await waitFor(() => expect(firstSignal?.aborted).toBe(true))
    expect(await screen.findByRole('heading', { name: 'Second preview' })).toBeInTheDocument()
  })

  it('provides accessible editor navigation and artwork image text', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respond(detail({ items: [item(1)] }))))
    renderAt('/exhibitions/1/preview')

    await screen.findByRole('heading', { name: 'Nocturne' })
    expect(screen.getByRole('navigation', { name: 'Preview actions' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Edit metadata' })).toHaveAttribute('href', '/exhibitions/1/edit')
    expect(screen.getByRole('link', { name: 'Curate artworks' })).toHaveAttribute('href', '/exhibitions/1/artworks')
    expect(screen.getByRole('img', { name: 'Artwork 1 of 1: Nocturne' })).toBeInTheDocument()
  })
})
