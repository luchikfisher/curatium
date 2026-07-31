import { cleanup, render, screen, waitFor } from '@testing-library/react'
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

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('route screens', () => {
  it('loads the curator exhibition list', async () => {
    const fetchMock = vi.fn().mockResolvedValue(respond([summary('Lines of Light', 'DRAFT')]))
    vi.stubGlobal('fetch', fetchMock)
    renderAt('/exhibitions')
    expect(screen.getByText('Loading your exhibitions…')).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'Lines of Light' })).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith('/api/exhibitions', expect.any(Object))
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
