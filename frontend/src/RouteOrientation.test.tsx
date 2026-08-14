import { act, cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { appRouter } from './router'

vi.mock('./features/virtual-gallery/LazyExhibitionGallery', () => ({
  LazyExhibitionGallery: ({ exhibition }: { exhibition: { title: string } }) => (
    <div data-testid="gallery">{exhibition.title}</div>
  ),
}))

function detail(id = 1, title = 'Lines of Light', status: 'DRAFT' | 'PUBLISHED' = 'DRAFT') {
  return {
    id,
    title,
    summary: 'A study of light and form.',
    introduction: 'An introductory text.',
    status,
    publishedAt: status === 'PUBLISHED' ? '2026-07-22T14:30:00Z' : null,
    coverArtworkId: null,
    items: [],
    createdAt: '2026-07-18T12:00:00Z',
    updatedAt: '2026-07-22T14:30:00Z',
  }
}

function apiError(status: number) {
  return {
    code: status === 404 ? 'EXHIBITION_NOT_FOUND' : 'SERVICE_UNAVAILABLE',
    message: status === 404 ? 'Exhibition not found.' : 'Please try again shortly.',
    fieldErrors: [],
    timestamp: '2026-07-18T12:00:00Z',
  }
}

function respond(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function renderAt(path: string, state?: unknown) {
  window.history.pushState(state === undefined ? {} : {
    usr: state,
    key: 'route-orientation-test',
    idx: window.history.state?.idx ?? 0,
  }, '', path)
  window.dispatchEvent(new PopStateEvent('popstate'))
  return render(<App />)
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('route document titles', () => {
  it.each([
    ['/', 'Exhibitions | Curatium'],
    ['/exhibitions', 'Curator exhibitions | Curatium'],
    ['/exhibitions/new', 'Create exhibition | Curatium'],
    ['/missing-page', 'Page not found | Curatium'],
  ])('sets the static title for %s', async (path, expectedTitle) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respond([])))
    renderAt(path)
    expect(document.title).toBe(expectedTitle)
    const expectedAnnouncement = path === '/'
      ? 'Exhibitions'
      : path === '/exhibitions'
        ? 'Curator exhibitions'
        : path === '/exhibitions/new'
          ? 'Create exhibition'
          : 'Page not found'
    await waitFor(() => expect(routeAnnouncement()).toHaveTextContent(expectedAnnouncement))
  })

  it.each([
    ['/exhibitions/1/edit', 'Loading exhibition metadata | Curatium', 'Metadata — Lines of Light | Curatium', 'Metadata for Lines of Light'],
    ['/exhibitions/1/artworks', 'Loading exhibition artworks | Curatium', 'Artworks — Lines of Light | Curatium', 'Artworks for Lines of Light'],
    ['/exhibitions/1/preview', 'Loading curator preview | Curatium', 'Preview — Lines of Light | Curatium', 'Preview for Lines of Light'],
    ['/visit/1', 'Loading exhibition | Curatium', 'Lines of Light | Curatium', 'Exhibition: Lines of Light'],
  ])('replaces the loading title with authoritative data for %s', async (path, loadingTitle, loadedTitle, loadedAnnouncement) => {
    let resolveRequest: ((response: Response) => void) | undefined
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => new Promise<Response>((resolve) => {
      resolveRequest = resolve
    })))

    renderAt(path)
    expect(document.title).toBe(loadingTitle)
    expect(routeAnnouncement()).toHaveTextContent('')

    await act(async () => {
      resolveRequest?.(respond(detail(1, 'Lines of Light', path === '/visit/1' ? 'PUBLISHED' : 'DRAFT')))
    })
    await waitFor(() => expect(document.title).toBe(loadedTitle))
    await waitFor(() => expect(routeAnnouncement()).toHaveTextContent(loadedAnnouncement))
  })

  it.each([
    '/exhibitions/not-a-number/edit',
    '/exhibitions/not-a-number/artworks',
    '/exhibitions/not-a-number/preview',
    '/visit/not-a-number',
  ])('sets the invalid-address title for %s', (path) => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    renderAt(path)
    expect(document.title).toBe('Invalid exhibition address | Curatium')
    expect(routeAnnouncement()).toHaveTextContent('')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it.each([
    '/exhibitions/1/edit',
    '/exhibitions/1/artworks',
    '/exhibitions/1/preview',
    '/visit/1',
  ])('sets the exhibition-not-found title for %s', async (path) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respond(apiError(404), 404)))
    renderAt(path)
    await waitFor(() => expect(document.title).toBe('Exhibition not found | Curatium'))
    expect(routeAnnouncement()).toHaveTextContent('')
  })

  it.each([
    ['/exhibitions/1/edit', 'Exhibition unavailable | Curatium'],
    ['/exhibitions/1/artworks', 'Exhibition unavailable | Curatium'],
    ['/exhibitions/1/preview', 'Preview unavailable | Curatium'],
    ['/visit/1', 'Exhibition unavailable | Curatium'],
  ])('sets the route-specific load-error title for %s', async (path, expectedTitle) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respond(apiError(503), 503)))
    renderAt(path)
    await waitFor(() => expect(document.title).toBe(expectedTitle))
    expect(routeAnnouncement()).toHaveTextContent('')
  })

  it('installs the next exhibition loading title immediately and ignores the previous response', async () => {
    let resolveFirst: ((response: Response) => void) | undefined
    let resolveSecond: ((response: Response) => void) | undefined
    const fetchMock = vi.fn((path: string) => new Promise<Response>((resolve) => {
      if (path === '/api/exhibitions/1') resolveFirst = resolve
      if (path === '/api/exhibitions/2') resolveSecond = resolve
    }))
    vi.stubGlobal('fetch', fetchMock)
    renderAt('/exhibitions/1/edit')
    expect(document.title).toBe('Loading exhibition metadata | Curatium')

    await act(async () => { await appRouter.navigate('/exhibitions/2/edit') })
    expect(document.title).toBe('Loading exhibition metadata | Curatium')

    await act(async () => {
      resolveFirst?.(respond(detail(1, 'First exhibition')))
    })
    expect(document.title).toBe('Loading exhibition metadata | Curatium')

    await act(async () => {
      resolveSecond?.(respond(detail(2, 'Second exhibition')))
    })
    await waitFor(() => expect(document.title).toBe('Metadata — Second exhibition | Curatium'))
  })

  it('replaces a loaded route title with the next route loading title before its response arrives', async () => {
    let resolveArtworks: ((response: Response) => void) | undefined
    const fetchMock = vi.fn((path: string) => {
      if (path === '/api/exhibitions/1') return Promise.resolve(respond(detail()))
      if (path === '/api/exhibitions/2') {
        return new Promise<Response>((resolve) => {
          resolveArtworks = resolve
        })
      }
      throw new Error(`Unexpected request: ${path}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    renderAt('/exhibitions/1/edit')
    await waitFor(() => expect(document.title).toBe('Metadata — Lines of Light | Curatium'))

    await act(async () => { await appRouter.navigate('/exhibitions/2/artworks') })
    expect(document.title).toBe('Loading exhibition artworks | Curatium')

    await act(async () => {
      resolveArtworks?.(respond(detail(2, 'Second exhibition')))
    })
    await waitFor(() => expect(document.title).toBe('Artworks — Second exhibition | Curatium'))
  })

  it('keeps the authoritative Artworks title through same-route q/page changes', async () => {
    vi.stubGlobal('fetch', vi.fn((path: string) => {
      if (path === '/api/exhibitions/1') return Promise.resolve(respond(detail()))
      if (path.startsWith('/api/museum/artworks')) {
        return Promise.resolve(respond({ items: [], page: 2, pageSize: 20, hasNextPage: false }))
      }
      throw new Error(`Unexpected request: ${path}`)
    }))
    renderAt('/exhibitions/1/artworks')
    await waitFor(() => expect(document.title).toBe('Artworks — Lines of Light | Curatium'))

    await act(async () => {
      await appRouter.navigate('/exhibitions/1/artworks?q=landscape&page=2')
    })
    expect(document.title).toBe('Artworks — Lines of Light | Curatium')
  })

  it('keeps the loaded public title while curator route state is consumed with REPLACE', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respond(detail(1, 'Curator handoff', 'PUBLISHED'))))
    renderAt('/visit/1', {
      curatorExhibitionId: 1,
      curatorReturnTo: '/exhibitions/1/preview',
    })

    await waitFor(() => expect(document.title).toBe('Curator handoff | Curatium'))
    await waitFor(() => expect(window.history.state?.usr).toBeNull())
    expect(document.title).toBe('Curator handoff | Curatium')
  })
})

function routeAnnouncement(): HTMLElement {
  const announcement = document.querySelector<HTMLElement>('.route-announcement')
  if (!announcement) throw new Error('Route announcement region was not rendered.')
  return announcement
}
