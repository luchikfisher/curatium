import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'

function summary(
  title = 'Lines of Light',
  status: 'DRAFT' | 'PUBLISHED' = 'PUBLISHED',
  coverImageUrl: string | null = null,
) {
  return { id: 1, title, summary: 'A study of light and form.', status, coverImageUrl, artworkCount: 3, updatedAt: '2026-07-18T12:00:00Z' }
}

function respond(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function renderAt(path: string) {
  window.history.pushState({}, '', path)
  window.dispatchEvent(new PopStateEvent('popstate'))
  return render(<App />)
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

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('route screens', () => {
  it('loads the curator exhibition list', async () => {
    const fetchMock = vi.fn().mockResolvedValue(respond([
      summary(
        'Lines of Light',
        'DRAFT',
        '/api/artwork-images/art-institute/11111111-1111-1111-1111-111111111111/thumbnail',
      ),
    ]))
    vi.stubGlobal('fetch', fetchMock)
    renderAt('/exhibitions')
    expect(screen.getByText('Loading your exhibitions…')).toBeInTheDocument()
    const title = await screen.findByRole('heading', { name: 'Lines of Light' })
    const row = title.closest('.curator-exhibition-row')
    expect(row).toBeInstanceOf(HTMLElement)
    const curatorRow = row as HTMLElement
    expect(within(curatorRow).getByText('Draft')).toBeInTheDocument()
    expect(within(curatorRow).getByText('3 artworks')).toBeInTheDocument()
    expect(within(curatorRow).getByText(/Updated/)).toBeInTheDocument()
    expect(row?.querySelector('time')).toHaveAttribute('datetime', '2026-07-18T12:00:00Z')
    const cover = row?.querySelector('.artwork-image--thumbnail img')
    expect(cover).toHaveAttribute('src', '/api/artwork-images/art-institute/11111111-1111-1111-1111-111111111111/thumbnail')
    expect(cover).toHaveAttribute('alt', '')
    expect(fetchMock).toHaveBeenCalledWith('/api/exhibitions', expect.any(Object))
  })

  it('focuses authoritative Metadata and Artworks H1s once without an intermediate main focus', async () => {
    const fetchMock = vi.fn((path: string) => {
      if (path === '/api/exhibitions') return Promise.resolve(respond([summary('Lines of Light', 'DRAFT')]))
      if (path === '/api/exhibitions/1') {
        return Promise.resolve(respond({
          id: 1,
          title: 'Lines of Light',
          summary: 'A study of light and form.',
          introduction: 'A committed introduction.',
          status: 'DRAFT',
          publishedAt: null,
          coverArtworkId: null,
          items: [],
          createdAt: '2026-07-18T12:00:00Z',
          updatedAt: '2026-07-18T12:00:00Z',
        }))
      }
      throw new Error(`Unexpected request: ${path}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    renderAt('/exhibitions')

    const metadataFocusEvents = recordFocusEvents()
    await userEvent.click(await screen.findByRole('link', { name: 'Edit exhibition 1 of 1: Lines of Light' }))

    const metadataHeading = await screen.findByRole('heading', { name: 'Lines of Light', level: 1 })
    await waitFor(() => expect(metadataHeading).toHaveFocus())
    await act(async () => new Promise((resolve) => window.setTimeout(resolve, 20)))
    metadataFocusEvents.stop()
    expect(metadataFocusEvents.elements.filter((element) => (
      element === metadataHeading || element === document.getElementById('main-content')
    ))).toEqual([metadataHeading])
    expect(metadataHeading).toHaveAttribute('tabindex', '-1')
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.getByRole('main')).not.toHaveFocus()

    const artworksFocusEvents = recordFocusEvents()
    await userEvent.click(within(screen.getByRole('navigation', { name: 'Exhibition workflow' }))
      .getByRole('link', { name: 'Artworks' }))

    const artworksHeading = await screen.findByRole('heading', { name: 'Lines of Light', level: 1 })
    await waitFor(() => expect(artworksHeading).toHaveFocus())
    await act(async () => new Promise((resolve) => window.setTimeout(resolve, 20)))
    artworksFocusEvents.stop()
    expect(artworksFocusEvents.elements.filter((element) => (
      element === artworksHeading || element === document.getElementById('main-content')
    ))).toEqual([artworksHeading])
    expect(artworksHeading).toHaveAttribute('tabindex', '-1')
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.getByRole('main')).not.toHaveFocus()
  })

  it('uses status-aware curator card actions without changing destinations', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respond([
      summary('Draft exhibition', 'DRAFT'),
      { ...summary('Published exhibition', 'PUBLISHED'), id: 2 },
    ])))
    renderAt('/exhibitions')

    expect(await screen.findByRole('link', { name: 'Edit exhibition 1 of 2: Draft exhibition' })).toHaveAttribute('href', '/exhibitions/1/edit')
    expect(screen.getByRole('link', { name: 'Manage exhibition 2 of 2: Published exhibition' })).toHaveAttribute('href', '/exhibitions/2/edit')
  })

  it('gives duplicate-titled public and curator exhibition actions position-qualified names', async () => {
    const duplicatePublic = [
      summary('Untitled exhibition', 'PUBLISHED'),
      { ...summary('Untitled exhibition', 'PUBLISHED'), id: 2 },
    ]
    const fetchMock = vi.fn().mockResolvedValueOnce(respond(duplicatePublic))
    vi.stubGlobal('fetch', fetchMock)
    renderAt('/')

    expect(await screen.findByRole('link', { name: 'Enter exhibition 1 of 2: Untitled exhibition' }))
      .toHaveAttribute('href', '/visit/1')
    expect(screen.getByRole('link', { name: 'Enter exhibition 2 of 2: Untitled exhibition' }))
      .toHaveAttribute('href', '/visit/2')

    cleanup()
    fetchMock.mockResolvedValueOnce(respond(duplicatePublic))
    renderAt('/exhibitions')

    expect(await screen.findByRole('link', { name: 'Manage exhibition 1 of 2: Untitled exhibition' }))
      .toHaveAttribute('href', '/exhibitions/1/edit')
    expect(screen.getByRole('link', { name: 'Manage exhibition 2 of 2: Untitled exhibition' }))
      .toHaveAttribute('href', '/exhibitions/2/edit')
  })

  it.each([
    ['/', 'Visit'],
    ['/visit/1', 'Visit'],
    ['/exhibitions', 'Curate'],
    ['/exhibitions/1/artworks', 'Curate'],
  ])('marks exactly one primary navigation item current on %s', (path, expectedCurrent) => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})))
    renderAt(path)

    const navigation = screen.getByRole('navigation', { name: 'Primary navigation' })
    const links = within(navigation).getAllByRole('link')
    expect(links.filter((link) => link.getAttribute('aria-current') === 'page')).toHaveLength(1)
    expect(within(navigation).getByRole('link', { name: expectedCurrent })).toHaveAttribute('aria-current', 'page')
    expect(within(navigation).getByRole('link', { name: 'Visit' })).toHaveAttribute('href', '/')
    expect(within(navigation).getByRole('link', { name: 'Curate' })).toHaveAttribute('href', '/exhibitions')
  })

  it('shows the curator empty state', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respond([])))
    renderAt('/exhibitions')
    expect(await screen.findByRole('heading', { name: 'Begin your first exhibition' })).toBeInTheDocument()
  })

  it('loads the public catalogue without filtering based on status assumptions', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respond([summary('Server-selected exhibition', 'DRAFT')])))
    renderAt('/')
    expect(await screen.findByRole('heading', { name: 'Server-selected exhibition' })).toBeInTheDocument()
    expect(screen.queryByText('Draft')).not.toBeInTheDocument()
  })

  it('renders catalogue covers as decorative lazy local artwork images', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respond([
      summary('Covered exhibition', 'PUBLISHED', '/api/artwork-images/art-institute/11111111-1111-1111-1111-111111111111/thumbnail'),
    ])))
    renderAt('/')

    await screen.findByRole('heading', { name: 'Covered exhibition' })
    const image = document.querySelector('.exhibition-card__image img')
    expect(image).toHaveAttribute('src', '/api/artwork-images/art-institute/11111111-1111-1111-1111-111111111111/thumbnail')
    expect(image).toHaveAttribute('loading', 'lazy')
    expect(image).toHaveAttribute('alt', '')
    expect(image?.closest('.artwork-image')).toHaveClass('artwork-image--cover')
  })

  it('retries a recoverable catalogue error', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(respond({ code: 'SERVICE_UNAVAILABLE', message: 'Please try again shortly.', fieldErrors: [], timestamp: '2026-07-18T12:00:00Z' }, 503))
      .mockResolvedValueOnce(respond([summary('Recovered exhibition')]))
    vi.stubGlobal('fetch', fetchMock)
    renderAt('/')
    expect(await screen.findByText('Please try again shortly.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('heading', { name: 'Recovered exhibition' })).toBeInTheDocument()
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
  })

  it('renders the public empty state', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respond([])))
    renderAt('/')
    expect(await screen.findByRole('heading', { name: 'The gallery is quiet' })).toBeInTheDocument()
  })

  it('renders the not-found route without calling the API', () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    renderAt('/missing-page')
    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
