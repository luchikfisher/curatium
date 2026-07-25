import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'

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
    updatedAt: '2026-07-18T12:00:00Z',
    ...overrides,
  }
}

function summary() {
  return {
    id: 1,
    title: 'Lines of Light',
    summary: 'A study of light and form.',
    status: 'DRAFT',
    coverImageUrl: null,
    artworkCount: 0,
    updatedAt: '2026-07-18T12:00:00Z',
  }
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

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('exhibition create and edit workflow', () => {
  it('creates an exhibition and opens its edit route', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(respond(detail({ id: 42, title: 'Night works' }), 201))
      .mockResolvedValueOnce(respond(detail({ id: 42, title: 'Night works' })))
    vi.stubGlobal('fetch', fetchMock)
    renderAt('/exhibitions/new')

    await userEvent.type(screen.getByLabelText(/title/i), 'Night works')
    await userEvent.click(screen.getByRole('button', { name: 'Create exhibition' }))

    expect(await screen.findByDisplayValue('Night works')).toBeInTheDocument()
    expect(window.location.pathname).toBe('/exhibitions/42/edit')
    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/exhibitions', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ title: 'Night works', summary: '', introduction: '' }),
    }))
  })

  it('shows backend field errors beside the form field', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respond(
      error('VALIDATION_ERROR', 'The request contains invalid values.', 400, [
        { field: 'title', message: 'This title is already in use.' },
      ]),
      400,
    )))
    renderAt('/exhibitions/new')

    await userEvent.type(screen.getByLabelText(/title/i), 'Repeated title')
    await userEvent.click(screen.getByRole('button', { name: 'Create exhibition' }))

    expect(await screen.findByText('This title is already in use.')).toBeInTheDocument()
    expect(screen.getByLabelText(/title/i)).toHaveValue('Repeated title')
  })

  it('preserves creation values after a recoverable failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respond(
      error('SERVICE_UNAVAILABLE', 'Please try again shortly.', 503),
      503,
    )))
    renderAt('/exhibitions/new')

    await userEvent.type(screen.getByLabelText(/title/i), 'Saved locally')
    await userEvent.type(screen.getByLabelText(/summary/i), 'Keep this text')
    await userEvent.click(screen.getByRole('button', { name: 'Create exhibition' }))

    expect(await screen.findByText('Please try again shortly.')).toBeInTheDocument()
    expect(screen.getByLabelText(/title/i)).toHaveValue('Saved locally')
    expect(screen.getByLabelText(/summary/i)).toHaveValue('Keep this text')
  })

  it('prevents duplicate creation submissions while the request is pending', async () => {
    let resolveRequest: ((response: Response) => void) | undefined
    const fetchMock = vi.fn().mockImplementation(() => new Promise<Response>((resolve) => {
      resolveRequest = resolve
    }))
    vi.stubGlobal('fetch', fetchMock)
    renderAt('/exhibitions/new')

    await userEvent.type(screen.getByLabelText(/title/i), 'One request only')
    const submit = screen.getByRole('button', { name: 'Create exhibition' })
    await userEvent.click(submit)
    await userEvent.click(submit)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    resolveRequest?.(respond(detail(), 201))
  })

  it('loads existing metadata and saves an update', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(respond(detail()))
      .mockResolvedValueOnce(respond(detail({
        title: 'Server-normalized title',
        summary: 'Committed summary',
        introduction: 'Committed introduction',
      })))
    vi.stubGlobal('fetch', fetchMock)
    renderAt('/exhibitions/1/edit')

    expect(screen.getByText('Loading exhibition metadata…')).toBeInTheDocument()
    const title = await screen.findByLabelText(/title/i)
    expect(title).toHaveValue('Lines of Light')
    await userEvent.clear(title)
    await userEvent.type(title, 'Client title')
    await userEvent.click(screen.getByRole('button', { name: 'Save metadata' }))

    expect(await screen.findByText('Metadata saved.')).toBeInTheDocument()
    expect(screen.getByLabelText(/title/i)).toHaveValue('Server-normalized title')
    expect(screen.getByLabelText(/summary/i)).toHaveValue('Committed summary')
    expect(screen.getByLabelText(/introduction/i)).toHaveValue('Committed introduction')
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/exhibitions/1', expect.objectContaining({
      method: 'PUT',
      body: JSON.stringify({
        title: 'Client title',
        summary: 'A study of light and form.',
        introduction: 'An introductory text.',
      }),
    }))
  })

  it('handles a published read-only response explicitly', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(respond(detail()))
      .mockResolvedValueOnce(respond(error(
        'PUBLISHED_EXHIBITION_READ_ONLY',
        'Published exhibitions cannot be changed.',
        409,
      ), 409))
    vi.stubGlobal('fetch', fetchMock)
    renderAt('/exhibitions/1/edit')

    const title = await screen.findByLabelText(/title/i)
    await userEvent.clear(title)
    await userEvent.type(title, 'Change attempted')
    await userEvent.click(screen.getByRole('button', { name: 'Save metadata' }))

    expect(await screen.findByText(/published and read-only/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/title/i)).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Delete exhibition' })).not.toBeInTheDocument()
  })

  it('shows not-found and retries the metadata request', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(respond(error('EXHIBITION_NOT_FOUND', 'No exhibition found.', 404), 404))
      .mockResolvedValueOnce(respond(detail({ title: 'Recovered exhibition' })))
    vi.stubGlobal('fetch', fetchMock)
    renderAt('/exhibitions/1/edit')

    expect(await screen.findByRole('heading', { name: 'Exhibition not found' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByDisplayValue('Recovered exhibition')).toBeInTheDocument()
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
  })

  it('requires deletion confirmation and returns to the exhibition list', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(respond(detail()))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(respond([summary()]))
    vi.stubGlobal('fetch', fetchMock)
    renderAt('/exhibitions/1/edit')

    await screen.findByLabelText(/title/i)
    await userEvent.click(screen.getByRole('button', { name: 'Delete exhibition' }))
    expect(screen.getByText('Delete this draft exhibition? This cannot be undone.')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await userEvent.click(screen.getByRole('button', { name: 'Confirm deletion' }))

    expect(await screen.findByRole('heading', { name: 'Lines of Light' })).toBeInTheDocument()
    expect(window.location.pathname).toBe('/exhibitions')
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/exhibitions/1', expect.objectContaining({ method: 'DELETE' }))
  })

  it('cancels deletion without sending a request and restores focus to the trigger', async () => {
    const fetchMock = vi.fn().mockResolvedValue(respond(detail()))
    vi.stubGlobal('fetch', fetchMock)
    renderAt('/exhibitions/1/edit')

    await screen.findByLabelText(/title/i)
    await userEvent.click(screen.getByRole('button', { name: 'Delete exhibition' }))
    const keep = screen.getByRole('button', { name: 'Keep exhibition' })
    expect(screen.getByRole('button', { name: 'Confirm deletion' })).toHaveFocus()
    await userEvent.click(keep)

    const deleteButton = screen.getByRole('button', { name: 'Delete exhibition' })
    expect(deleteButton).toHaveFocus()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('keeps the editor usable after a failed deletion', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(respond(detail()))
      .mockResolvedValueOnce(respond(error('INTERNAL_ERROR', 'Please try again.', 500), 500))
    vi.stubGlobal('fetch', fetchMock)
    renderAt('/exhibitions/1/edit')

    await screen.findByLabelText(/title/i)
    await userEvent.click(screen.getByRole('button', { name: 'Delete exhibition' }))
    await userEvent.click(screen.getByRole('button', { name: 'Confirm deletion' }))

    expect(await screen.findByText('Please try again.')).toBeInTheDocument()
    expect(screen.getByLabelText(/title/i)).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Confirm deletion' })).toBeEnabled()
  })

  it('prevents duplicate deletion submissions while a request is pending', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(respond(detail()))
      .mockImplementationOnce(() => new Promise<Response>(() => {}))
    vi.stubGlobal('fetch', fetchMock)
    renderAt('/exhibitions/1/edit')

    await screen.findByLabelText(/title/i)
    await userEvent.click(screen.getByRole('button', { name: 'Delete exhibition' }))
    const confirm = screen.getByRole('button', { name: 'Confirm deletion' })
    await userEvent.click(confirm)
    await userEvent.click(confirm)

    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('handles a published deletion conflict as read-only', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(respond(detail()))
      .mockResolvedValueOnce(respond(error(
        'PUBLISHED_EXHIBITION_READ_ONLY',
        'Published exhibitions cannot be deleted.',
        409,
      ), 409))
    vi.stubGlobal('fetch', fetchMock)
    renderAt('/exhibitions/1/edit')

    await screen.findByLabelText(/title/i)
    await userEvent.click(screen.getByRole('button', { name: 'Delete exhibition' }))
    await userEvent.click(screen.getByRole('button', { name: 'Confirm deletion' }))

    expect(await screen.findByText(/published and read-only/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete exhibition' })).not.toBeInTheDocument()
  })

  it('aborts an old mutation and resets editor state when the route ID changes', async () => {
    let putSignal: AbortSignal | undefined
    let resolveUpdate: ((response: Response) => void) | undefined
    const fetchMock = vi.fn((path: string, options?: RequestInit) => {
      if (path === '/api/exhibitions/1' && options?.method === 'PUT') {
        putSignal = options.signal as AbortSignal
        return new Promise<Response>((resolve) => {
          resolveUpdate = resolve
        })
      }
      if (path === '/api/exhibitions/1') return Promise.resolve(respond(detail({ id: 1, title: 'First exhibition' })))
      if (path === '/api/exhibitions/2') return Promise.resolve(respond(detail({ id: 2, title: 'Second exhibition' })))
      throw new Error(`Unexpected request: ${path}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    renderAt('/exhibitions/1/edit')

    const title = await screen.findByLabelText(/title/i)
    await userEvent.clear(title)
    await userEvent.type(title, 'Changed first exhibition')
    await userEvent.click(screen.getByRole('button', { name: 'Save metadata' }))
    window.history.pushState({}, '', '/exhibitions/2/edit')
    window.dispatchEvent(new PopStateEvent('popstate'))

    expect(await screen.findByDisplayValue('Second exhibition')).toBeInTheDocument()
    expect(putSignal?.aborted).toBe(true)
    resolveUpdate?.(respond(detail({ id: 1, title: 'Old committed exhibition' })))
    expect(screen.queryByText('Metadata saved.')).not.toBeInTheDocument()
    expect(screen.getByLabelText(/title/i)).toBeEnabled()
  })

  it('shows malformed exhibition IDs without a retry action', () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    renderAt('/exhibitions/not-a-number/edit')

    expect(screen.getByRole('heading', { name: 'Invalid exhibition address' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
