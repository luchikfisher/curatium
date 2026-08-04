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
    thumbnailUrl: '/api/artwork-images/art-institute/11111111-1111-1111-1111-111111111111/thumbnail',
    imageUrl: '/api/artwork-images/art-institute/11111111-1111-1111-1111-111111111111/display',
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
    expect(screen.getByRole('img', { name: 'Cover artwork: Nocturne' })).toHaveAttribute(
      'src',
      '/api/artwork-images/art-institute/11111111-1111-1111-1111-111111111111/display',
    )
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
    expect(within(screen.getByRole('list', { name: 'Exhibition artworks' })).getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent)).toEqual([
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

  it('publishes from committed backend state and displays the committed publication time', async () => {
    const first = item(1, { title: 'Committed cover' })
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(respond(detail({ items: [first], coverArtworkId: first.artwork.id })))
      .mockResolvedValueOnce(respond(detail({
        title: 'Committed published title',
        status: 'PUBLISHED',
        publishedAt: '2026-07-22T14:30:00Z',
        items: [first],
        coverArtworkId: first.artwork.id,
      })))
    vi.stubGlobal('fetch', fetchMock)
    renderAt('/exhibitions/1/preview')

    await screen.findByRole('button', { name: 'Publish exhibition' })
    await userEvent.click(screen.getByRole('button', { name: 'Publish exhibition' }))

    expect(await screen.findByText('Committed published title')).toBeInTheDocument()
    expect(screen.getByText('Published exhibition')).toBeInTheDocument()
    expect(document.querySelector('time[datetime="2026-07-22T14:30:00Z"]')).toBeInTheDocument()
    expect(screen.getByText('Exhibition published. Curatorial editing is now read-only.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'View metadata' })).toHaveAttribute('href', '/exhibitions/1/edit')
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/exhibitions/1/publish', expect.objectContaining({ method: 'POST' }))
  })

  it('shows server publication prerequisite failures while retaining the draft preview', async () => {
    const draft = detail()
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(respond(draft))
      .mockResolvedValueOnce(respond(error(
        'INVALID_PUBLICATION_STATE',
        'A published exhibition must include at least one artwork.',
        409,
      ), 409))
      .mockResolvedValueOnce(respond(draft)))
    renderAt('/exhibitions/1/preview')

    await userEvent.click(await screen.findByRole('button', { name: 'Publish exhibition' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('A published exhibition must include at least one artwork.')
    expect(screen.getByRole('list', { name: 'Publication requirements' })).toHaveTextContent('Required: At least one artwork')
    expect(screen.getByText('Draft preview')).toBeInTheDocument()
  })

  it('explains a published-read-only conflict without replacing committed preview data', async () => {
    const first = item(1)
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(respond(detail({ items: [first], coverArtworkId: first.artwork.id })))
      .mockResolvedValueOnce(respond(error(
        'PUBLISHED_EXHIBITION_READ_ONLY',
        'Exhibition 1 must be unpublished before it can be edited.',
        409,
      ), 409))
      .mockResolvedValueOnce(respond(detail({
        status: 'PUBLISHED',
        publishedAt: '2026-07-22T14:30:00Z',
        items: [first],
        coverArtworkId: first.artwork.id,
      }))))
    renderAt('/exhibitions/1/preview')

    await userEvent.click(await screen.findByRole('button', { name: 'Publish exhibition' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('This exhibition is currently read-only.')
    expect(await screen.findByText('Published exhibition')).toBeInTheDocument()
  })

  it('opens an accessible unpublish confirmation without sending a mutation', async () => {
    const first = item(1)
    const fetchMock = vi.fn().mockResolvedValue(respond(detail({
      status: 'PUBLISHED',
      publishedAt: '2026-07-22T14:30:00Z',
      items: [first],
      coverArtworkId: first.artwork.id,
    })))
    vi.stubGlobal('fetch', fetchMock)
    renderAt('/exhibitions/1/preview')

    await userEvent.click(await screen.findByRole('button', { name: 'Unpublish exhibition' }))

    const confirmation = screen.getByRole('alertdialog', { name: 'Unpublish this exhibition?' })
    expect(confirmation).toHaveTextContent('The public exhibition will become unavailable.')
    expect(confirmation).toHaveTextContent('All exhibition content will be preserved')
    expect(confirmation).toHaveTextContent('return to an editable draft')
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus()
    expect(screen.getByRole('button', { name: 'Confirm unpublish' })).toBeEnabled()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(document.activeElement).not.toBe(document.body)
  })

  it('cancels unpublish without a request and restores trigger focus', async () => {
    const first = item(1)
    const fetchMock = vi.fn().mockResolvedValue(respond(detail({
      status: 'PUBLISHED',
      publishedAt: '2026-07-22T14:30:00Z',
      items: [first],
      coverArtworkId: first.artwork.id,
    })))
    vi.stubGlobal('fetch', fetchMock)
    renderAt('/exhibitions/1/preview')

    await userEvent.click(await screen.findByRole('button', { name: 'Unpublish exhibition' }))
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Unpublish exhibition' })).toHaveFocus()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(screen.getByText('Published exhibition')).toBeInTheDocument()
    expect(document.activeElement).not.toBe(document.body)
  })

  it('treats Escape from the unpublish confirmation as Cancel', async () => {
    const first = item(1)
    const fetchMock = vi.fn().mockResolvedValue(respond(detail({
      status: 'PUBLISHED',
      publishedAt: '2026-07-22T14:30:00Z',
      items: [first],
      coverArtworkId: first.artwork.id,
    })))
    vi.stubGlobal('fetch', fetchMock)
    renderAt('/exhibitions/1/preview')

    await userEvent.click(await screen.findByRole('button', { name: 'Unpublish exhibition' }))
    await userEvent.keyboard('{Escape}')

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Unpublish exhibition' })).toHaveFocus()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('unpublishes once with committed preserved data and clears publishedAt', async () => {
    const first = item(1, { title: 'Preserved cover' })
    first.curatorialNote = 'Preserved note.'
    const second = item(2, { title: 'Preserved second artwork', artistDisplay: 'Preserved artist' })
    second.curatorialNote = 'Second preserved note.'
    const published = detail({
      summary: 'Preserved summary',
      introduction: 'Preserved introduction',
      status: 'PUBLISHED',
      publishedAt: '2026-07-22T14:30:00Z',
      items: [second, first],
      coverArtworkId: first.artwork.id,
    })
    const unpublished = { ...published, status: 'DRAFT', publishedAt: null, updatedAt: '2026-07-23T10:00:00Z' }
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(respond(published))
      .mockResolvedValueOnce(respond(unpublished))
    vi.stubGlobal('fetch', fetchMock)
    renderAt('/exhibitions/1/preview')

    await userEvent.click(await screen.findByRole('button', { name: 'Unpublish exhibition' }))
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await userEvent.click(screen.getByRole('button', { name: 'Confirm unpublish' }))

    expect(await screen.findByText('Draft preview')).toBeInTheDocument()
    expect(screen.queryByText('Published', { selector: 'dt' })).not.toBeInTheDocument()
    expect(screen.getByText('Preserved summary')).toBeInTheDocument()
    expect(screen.getByText('Preserved introduction')).toBeInTheDocument()
    expect(screen.getByText('Preserved note.')).toBeInTheDocument()
    expect(screen.getByText('Second preserved note.')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Cover artwork: Preserved cover' })).toBeInTheDocument()
    expect(within(screen.getByRole('list', { name: 'Exhibition artworks' })).getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent)).toEqual([
      'Preserved cover', 'Preserved second artwork',
    ])
    expect(screen.getByText('Preserved artist')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Edit metadata' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Curate artworks' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'View metadata' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Unpublish exhibition' })).not.toBeInTheDocument()
    const success = screen.getByText('Exhibition unpublished. Curatorial editing is available again.')
    expect(success).toHaveFocus()
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/exhibitions/1/unpublish', expect.objectContaining({ method: 'POST' }))
    expect(document.activeElement).not.toBe(document.body)
  })

  it('prevents duplicate confirmed unpublish submissions while pending', async () => {
    const first = item(1)
    let resolveUnpublish: ((response: Response) => void) | undefined
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(respond(detail({
        status: 'PUBLISHED',
        publishedAt: '2026-07-22T14:30:00Z',
        items: [first],
        coverArtworkId: first.artwork.id,
      })))
      .mockImplementationOnce(() => new Promise<Response>((resolve) => { resolveUnpublish = resolve }))
    vi.stubGlobal('fetch', fetchMock)
    renderAt('/exhibitions/1/preview')

    await userEvent.click(await screen.findByRole('button', { name: 'Unpublish exhibition' }))
    const confirm = screen.getByRole('button', { name: 'Confirm unpublish' })
    await userEvent.click(confirm)
    const pending = screen.getByRole('button', { name: 'Unpublishing…' })
    expect(pending).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
    expect(screen.getByText('Published exhibition')).toBeInTheDocument()
    expect(document.querySelector('time[datetime="2026-07-22T14:30:00Z"]')).toBeInTheDocument()
    await userEvent.click(pending)
    expect(fetchMock).toHaveBeenCalledTimes(2)

    resolveUnpublish?.(respond(detail({
      status: 'DRAFT',
      publishedAt: null,
      items: [first],
      coverArtworkId: first.artwork.id,
    })))
    expect(await screen.findByText('Draft preview')).toBeInTheDocument()
  })

  it('preserves published state after unpublish failure and allows retry', async () => {
    const first = item(1)
    const published = detail({
      status: 'PUBLISHED',
      publishedAt: '2026-07-22T14:30:00Z',
      items: [first],
      coverArtworkId: first.artwork.id,
    })
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(respond(published))
      .mockResolvedValueOnce(respond(error('SERVICE_UNAVAILABLE', 'Unpublish is temporarily unavailable.', 503), 503))
      .mockResolvedValueOnce(respond({ ...published, status: 'DRAFT', publishedAt: null }))
    vi.stubGlobal('fetch', fetchMock)
    renderAt('/exhibitions/1/preview')

    await userEvent.click(await screen.findByRole('button', { name: 'Unpublish exhibition' }))
    await userEvent.click(screen.getByRole('button', { name: 'Confirm unpublish' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Unpublish is temporarily unavailable.')
    expect(screen.getByText('Published exhibition')).toBeInTheDocument()
    expect(document.querySelector('time[datetime="2026-07-22T14:30:00Z"]')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'View metadata' })).toBeInTheDocument()
    expect(screen.queryByText('Exhibition unpublished. Curatorial editing is available again.')).not.toBeInTheDocument()
    const retryUnpublish = screen.getByRole('button', { name: 'Try unpublishing again' })
    expect(retryUnpublish).toHaveFocus()
    expect(document.activeElement).not.toBe(document.body)

    await userEvent.click(retryUnpublish)
    expect(await screen.findByText('Draft preview')).toBeInTheDocument()
    expect(screen.getByText('Exhibition unpublished. Curatorial editing is available again.')).toHaveFocus()
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('allows cancellation after unpublish failure without another mutation', async () => {
    const first = item(1)
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(respond(detail({
        status: 'PUBLISHED',
        publishedAt: '2026-07-22T14:30:00Z',
        items: [first],
        coverArtworkId: first.artwork.id,
      })))
      .mockResolvedValueOnce(respond(error('SERVICE_UNAVAILABLE', 'Try later.', 503), 503))
    vi.stubGlobal('fetch', fetchMock)
    renderAt('/exhibitions/1/preview')

    await userEvent.click(await screen.findByRole('button', { name: 'Unpublish exhibition' }))
    await userEvent.click(screen.getByRole('button', { name: 'Confirm unpublish' }))
    await screen.findByRole('alert')
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Unpublish exhibition' })).toHaveFocus()
    expect(screen.getByText('Published exhibition')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('prevents duplicate publication submissions while the request is pending', async () => {
    const first = item(1)
    let resolvePublish: ((response: Response) => void) | undefined
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(respond(detail({ items: [first], coverArtworkId: first.artwork.id })))
      .mockImplementationOnce(() => new Promise<Response>((resolve) => { resolvePublish = resolve }))
    vi.stubGlobal('fetch', fetchMock)
    renderAt('/exhibitions/1/preview')

    const publishButton = await screen.findByRole('button', { name: 'Publish exhibition' })
    await userEvent.click(publishButton)
    expect(screen.getByRole('button', { name: 'Publishing…' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Publishing…' }))
    expect(fetchMock).toHaveBeenCalledTimes(2)

    resolvePublish?.(respond(detail({
      status: 'PUBLISHED',
      publishedAt: '2026-07-22T14:30:00Z',
      items: [first],
      coverArtworkId: first.artwork.id,
    })))
    expect(await screen.findByText('Published exhibition')).toBeInTheDocument()
  })

  it('refreshes a stale draft after the server reports that it is already published', async () => {
    const first = item(1)
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(respond(detail({ items: [first], coverArtworkId: first.artwork.id })))
      .mockResolvedValueOnce(respond(error('INVALID_PUBLICATION_STATE', 'The exhibition is already published.', 409), 409))
      .mockResolvedValueOnce(respond(detail({
        status: 'PUBLISHED',
        publishedAt: '2026-07-22T14:30:00Z',
        items: [first],
        coverArtworkId: first.artwork.id,
      })))
    vi.stubGlobal('fetch', fetchMock)
    renderAt('/exhibitions/1/preview')

    await userEvent.click(await screen.findByRole('button', { name: 'Publish exhibition' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('The exhibition is already published.')
    expect(await screen.findByText('Published exhibition')).toBeInTheDocument()
    expect(document.querySelector('time[datetime="2026-07-22T14:30:00Z"]')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Unpublish exhibition' })).toBeInTheDocument()
    expect(fetchMock).toHaveBeenNthCalledWith(3, '/api/exhibitions/1', expect.any(Object))
  })

  it('clears stale unpublish confirmation state after reconciling an authoritative draft', async () => {
    const first = item(1)
    const authoritativeDraft = detail({
      status: 'DRAFT',
      publishedAt: null,
      items: [first],
      coverArtworkId: first.artwork.id,
    })
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(respond(detail({
        status: 'PUBLISHED',
        publishedAt: '2026-07-22T14:30:00Z',
        items: [first],
        coverArtworkId: first.artwork.id,
      })))
      .mockResolvedValueOnce(respond(error('INVALID_PUBLICATION_STATE', 'The exhibition is already a draft.', 409), 409))
      .mockResolvedValueOnce(respond(authoritativeDraft))
      .mockResolvedValueOnce(respond({
        ...authoritativeDraft,
        status: 'PUBLISHED',
        publishedAt: '2026-07-24T09:00:00Z',
      }))
    vi.stubGlobal('fetch', fetchMock)
    renderAt('/exhibitions/1/preview')

    await userEvent.click(await screen.findByRole('button', { name: 'Unpublish exhibition' }))
    await userEvent.click(screen.getByRole('button', { name: 'Confirm unpublish' }))
    expect(await screen.findByText('Draft preview')).toBeInTheDocument()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(document.querySelector('time[datetime="2026-07-22T14:30:00Z"]')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Publish exhibition' })).toBeInTheDocument()
    expect(screen.getByText('Draft preview')).toHaveFocus()
    expect(fetchMock).toHaveBeenNthCalledWith(3, '/api/exhibitions/1', expect.any(Object))

    await userEvent.click(screen.getByRole('button', { name: 'Publish exhibition' }))
    expect(await screen.findByText('Published exhibition')).toBeInTheDocument()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Unpublish exhibition' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Unpublish exhibition' }))
    expect(screen.getByRole('alertdialog', { name: 'Unpublish this exhibition?' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus()
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })

  it('moves to the exhibition-not-found state when a publication request reports a missing exhibition', async () => {
    const first = item(1)
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(respond(detail({ items: [first], coverArtworkId: first.artwork.id })))
      .mockResolvedValueOnce(respond(error('EXHIBITION_NOT_FOUND', 'No exhibition found.', 404), 404)))
    renderAt('/exhibitions/1/preview')

    await userEvent.click(await screen.findByRole('button', { name: 'Publish exhibition' }))

    expect(await screen.findByRole('heading', { name: 'Exhibition not found' })).toBeInTheDocument()
  })

  it('focuses the not-found heading when confirmed unpublish reports a missing exhibition', async () => {
    const first = item(1)
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(respond(detail({
        status: 'PUBLISHED',
        publishedAt: '2026-07-22T14:30:00Z',
        items: [first],
        coverArtworkId: first.artwork.id,
      })))
      .mockResolvedValueOnce(respond(error('EXHIBITION_NOT_FOUND', 'No exhibition found.', 404), 404))
    vi.stubGlobal('fetch', fetchMock)
    renderAt('/exhibitions/1/preview')

    await userEvent.click(await screen.findByRole('button', { name: 'Unpublish exhibition' }))
    await userEvent.click(screen.getByRole('button', { name: 'Confirm unpublish' }))

    const notFoundHeading = await screen.findByRole('heading', { name: 'Exhibition not found' })
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(notFoundHeading).toHaveFocus()
    expect(screen.queryByText('Exhibition unpublished. Curatorial editing is available again.')).not.toBeInTheDocument()
    expect(screen.queryByText('No exhibition found.')).not.toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(document.activeElement).not.toBe(document.body)
  })

  it('aborts a stale publication request when the preview route changes', async () => {
    const first = item(1)
    let publicationSignal: AbortSignal | undefined
    let resolvePublication: ((response: Response) => void) | undefined
    const fetchMock = vi.fn((path: string, options?: RequestInit) => {
      if (path === '/api/exhibitions/1') return Promise.resolve(respond(detail({ items: [first], coverArtworkId: first.artwork.id })))
      if (path === '/api/exhibitions/1/publish') {
        publicationSignal = options?.signal as AbortSignal
        return new Promise<Response>((resolve) => { resolvePublication = resolve })
      }
      if (path === '/api/exhibitions/2') return Promise.resolve(respond(detail({ id: 2, title: 'Second preview' })))
      throw new Error(`Unexpected request: ${path}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    renderAt('/exhibitions/1/preview')

    await userEvent.click(await screen.findByRole('button', { name: 'Publish exhibition' }))
    window.history.pushState({}, '', '/exhibitions/2/preview')
    window.dispatchEvent(new PopStateEvent('popstate'))

    await waitFor(() => expect(publicationSignal?.aborted).toBe(true))
    resolvePublication?.(respond(detail({
      title: 'Stale published exhibition',
      status: 'PUBLISHED',
      publishedAt: '2026-07-22T14:30:00Z',
      items: [first],
      coverArtworkId: first.artwork.id,
    })))
    expect(await screen.findByRole('heading', { name: 'Second preview' })).toBeInTheDocument()
    expect(screen.queryByText('Stale published exhibition')).not.toBeInTheDocument()
  })

  it('aborts a stale confirmed unpublish when the preview route changes', async () => {
    const first = item(1)
    let publicationSignal: AbortSignal | undefined
    let resolvePublication: ((response: Response) => void) | undefined
    const fetchMock = vi.fn((path: string, options?: RequestInit) => {
      if (path === '/api/exhibitions/1') {
        return Promise.resolve(respond(detail({
          status: 'PUBLISHED',
          publishedAt: '2026-07-22T14:30:00Z',
          items: [first],
          coverArtworkId: first.artwork.id,
        })))
      }
      if (path === '/api/exhibitions/1/unpublish') {
        publicationSignal = options?.signal as AbortSignal
        return new Promise<Response>((resolve) => { resolvePublication = resolve })
      }
      if (path === '/api/exhibitions/2') return Promise.resolve(respond(detail({ id: 2, title: 'Second preview' })))
      throw new Error(`Unexpected request: ${path}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    renderAt('/exhibitions/1/preview')

    await userEvent.click(await screen.findByRole('button', { name: 'Unpublish exhibition' }))
    await userEvent.click(screen.getByRole('button', { name: 'Confirm unpublish' }))
    window.history.pushState({}, '', '/exhibitions/2/preview')
    window.dispatchEvent(new PopStateEvent('popstate'))

    await waitFor(() => expect(publicationSignal?.aborted).toBe(true))
    resolvePublication?.(respond(detail({
      title: 'Stale unpublished exhibition',
      status: 'DRAFT',
      publishedAt: null,
      items: [first],
      coverArtworkId: first.artwork.id,
    })))
    expect(await screen.findByRole('heading', { name: 'Second preview' })).toBeInTheDocument()
    expect(screen.queryByText('Stale unpublished exhibition')).not.toBeInTheDocument()
    expect(document.activeElement).not.toBe(document.body)
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

  it('provides accessible publication status, requirements, and action controls', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respond(detail())))
    renderAt('/exhibitions/1/preview')

    await screen.findByRole('heading', { name: 'Lines of Light' })
    expect(screen.getByRole('status')).toHaveTextContent('Draft preview')
    expect(screen.getByRole('list', { name: 'Publication requirements' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Publish exhibition' })).toHaveAttribute('aria-describedby', 'publication-prerequisites')
  })

  it('does not describe unpublish controls with publication prerequisites', async () => {
    const first = item(1)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respond(detail({
      status: 'PUBLISHED',
      publishedAt: '2026-07-22T14:30:00Z',
      items: [first],
      coverArtworkId: first.artwork.id,
    }))))
    renderAt('/exhibitions/1/preview')

    const unpublish = await screen.findByRole('button', { name: 'Unpublish exhibition' })
    expect(unpublish).not.toHaveAttribute('aria-describedby')
    await userEvent.click(unpublish)

    const confirmation = screen.getByRole('alertdialog', { name: 'Unpublish this exhibition?' })
    expect(confirmation).toHaveAttribute('aria-describedby', 'unpublish-confirmation-description')
    expect(screen.getByRole('button', { name: 'Confirm unpublish' })).not.toHaveAttribute(
      'aria-describedby',
      'publication-prerequisites',
    )
  })
})
