import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { appRouter } from './router'

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
      .mockResolvedValueOnce(respond(detail({
        id: 42,
        title: 'Night works',
        summary: undefined,
        introduction: undefined,
        coverArtworkId: undefined,
      }), 201))
      .mockResolvedValueOnce(respond(detail({
        id: 42,
        title: 'Night works',
        summary: undefined,
        introduction: undefined,
        coverArtworkId: undefined,
      })))
    vi.stubGlobal('fetch', fetchMock)
    renderAt('/exhibitions/new')

    await userEvent.type(screen.getByLabelText(/title/i), 'Night works')
    await userEvent.click(screen.getByRole('button', { name: 'Create exhibition' }))

    expect(await screen.findByDisplayValue('Night works')).toBeInTheDocument()
    expect(window.location.pathname).toBe('/exhibitions/42/edit')
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/exhibitions', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ title: 'Night works', summary: '', introduction: '' }),
    }))
  })

  it('loads an uncovered draft when nullable metadata is omitted', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respond(detail({
      title: 'Uncovered draft',
      summary: undefined,
      introduction: undefined,
      coverArtworkId: undefined,
    }))))
    renderAt('/exhibitions/1/edit')

    expect(await screen.findByLabelText(/title/i)).toHaveValue('Uncovered draft')
    expect(screen.getByLabelText(/summary/i)).toHaveValue('')
    expect(screen.getByLabelText(/introduction/i)).toHaveValue('')
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
    await userEvent.click(screen.getByRole('link', { name: 'Cancel' }))
    expect(screen.getByRole('alertdialog', { name: 'Discard unsaved changes?' })).toBeInTheDocument()
  })

  it('blocks dirty creation cancellation and Stay preserves the draft', async () => {
    vi.stubGlobal('fetch', vi.fn())
    renderAt('/exhibitions/new')
    const title = screen.getByLabelText(/title/i)
    await userEvent.type(title, '  New draft  ')

    await userEvent.click(screen.getByRole('link', { name: 'Cancel' }))

    expect(screen.getByRole('button', { name: 'Stay' })).toHaveFocus()
    await userEvent.click(screen.getByRole('button', { name: 'Stay' }))
    await waitFor(() => expect(screen.getByRole('link', { name: 'Cancel' })).toHaveFocus())
    expect(title).toHaveValue('  New draft  ')
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

  it('allows clean metadata navigation and protects a dirty Link until it is discarded', async () => {
    const fetchMock = vi.fn((path: string) => {
      if (path === '/api/exhibitions/1') return Promise.resolve(respond(detail()))
      throw new Error(`Unexpected request: ${path}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    renderAt('/exhibitions/1/edit')

    const title = await screen.findByLabelText(/title/i)
    await userEvent.click(screen.getByRole('link', { name: 'Curate artworks' }))
    expect(await screen.findByRole('heading', { name: 'Add artworks' })).toBeInTheDocument()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()

    await act(async () => { await appRouter.navigate('/exhibitions/1/edit') })
    const reloadedTitle = await screen.findByLabelText(/title/i)
    await userEvent.clear(reloadedTitle)
    await userEvent.type(reloadedTitle, '  Exact dirty title  ')
    await userEvent.click(screen.getByRole('link', { name: 'Preview exhibition' }))
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    expect(window.location.pathname).toBe('/exhibitions/1/edit')

    await userEvent.click(screen.getByRole('button', { name: 'Discard changes' }))
    expect(await screen.findByText('Draft preview')).toBeInTheDocument()
    expect(window.location.pathname).toBe('/exhibitions/1/preview')
    expect(title).not.toBeInTheDocument()
  })

  it('successful metadata save becomes clean while a failed save remains protected', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(respond(detail()))
      .mockResolvedValueOnce(respond(detail({ title: 'Committed update' })))
      .mockResolvedValueOnce(respond(detail({ title: 'Committed update' })))
      .mockResolvedValueOnce(respond(detail({ title: 'Committed update' })))
      .mockResolvedValueOnce(respond(error('SERVICE_UNAVAILABLE', 'Please try again.', 503), 503))
    vi.stubGlobal('fetch', fetchMock)
    renderAt('/exhibitions/1/edit')

    const title = await screen.findByLabelText(/title/i)
    await userEvent.clear(title)
    await userEvent.type(title, 'Client update')
    await userEvent.click(screen.getByRole('button', { name: 'Save metadata' }))
    await screen.findByText('Metadata saved.')
    await userEvent.click(screen.getByRole('link', { name: 'Preview exhibition' }))
    expect(await screen.findByText('Draft preview')).toBeInTheDocument()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()

    await act(async () => { await appRouter.navigate('/exhibitions/1/edit') })
    const titleAfterReturn = await screen.findByLabelText(/title/i)
    await userEvent.clear(titleAfterReturn)
    await userEvent.type(titleAfterReturn, 'Failed update')
    await userEvent.click(screen.getByRole('button', { name: 'Save metadata' }))
    await screen.findByText('Please try again.')
    await userEvent.click(screen.getByRole('link', { name: 'Preview exhibition' }))
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    expect(titleAfterReturn).toHaveValue('Failed update')
  })

  it('continues the original blocked navigation when a pending metadata save succeeds', async () => {
    let resolveSave: ((response: Response) => void) | undefined
    const fetchMock = vi.fn((path: string, options?: RequestInit) => {
      if (path === '/api/exhibitions/1' && options?.method === 'PUT') {
        return new Promise<Response>((resolve) => { resolveSave = resolve })
      }
      if (path === '/api/exhibitions/1') return Promise.resolve(respond(detail({ title: 'Saved title' })))
      throw new Error(`Unexpected request: ${path}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    renderAt('/exhibitions/1/edit')

    const title = await screen.findByLabelText(/title/i)
    await userEvent.clear(title)
    await userEvent.type(title, 'Pending title')
    await userEvent.click(screen.getByRole('button', { name: 'Save metadata' }))
    await waitFor(() => expect(resolveSave).toBeDefined())
    await userEvent.click(screen.getByRole('link', { name: 'Preview exhibition' }))
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()

    await act(async () => { resolveSave?.(respond(detail({ title: 'Saved title' }))) })

    expect(await screen.findByText('Draft preview')).toBeInTheDocument()
    expect(window.location.pathname).toBe('/exhibitions/1/preview')
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('main')).toHaveFocus())
  })

  it('keeps the original metadata confirmation when a pending save fails', async () => {
    let resolveSave: ((response: Response) => void) | undefined
    const fetchMock = vi.fn((path: string, options?: RequestInit) => {
      if (path === '/api/exhibitions/1' && options?.method === 'PUT') {
        return new Promise<Response>((resolve) => { resolveSave = resolve })
      }
      if (path === '/api/exhibitions/1') return Promise.resolve(respond(detail()))
      throw new Error(`Unexpected request: ${path}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    renderAt('/exhibitions/1/edit')

    const title = await screen.findByLabelText(/title/i)
    await userEvent.clear(title)
    await userEvent.type(title, 'Still unsaved')
    await userEvent.click(screen.getByRole('button', { name: 'Save metadata' }))
    await waitFor(() => expect(resolveSave).toBeDefined())
    await userEvent.click(screen.getByRole('link', { name: 'Preview exhibition' }))

    await act(async () => { resolveSave?.(respond(error('SERVICE_UNAVAILABLE', 'Please try again.', 503), 503)) })

    expect(await screen.findByText('Please try again.')).toBeInTheDocument()
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    expect(title).toHaveValue('Still unsaved')
    expect(document.activeElement).not.toBe(document.body)
  })

  it('does not continue a blocked metadata navigation after Stay, even if the save later succeeds', async () => {
    let resolveSave: ((response: Response) => void) | undefined
    const fetchMock = vi.fn((path: string, options?: RequestInit) => {
      if (path === '/api/exhibitions/1' && options?.method === 'PUT') {
        return new Promise<Response>((resolve) => { resolveSave = resolve })
      }
      if (path === '/api/exhibitions/1') return Promise.resolve(respond(detail({ title: 'Saved title' })))
      throw new Error(`Unexpected request: ${path}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    renderAt('/exhibitions/1/edit')

    const title = await screen.findByLabelText(/title/i)
    await userEvent.clear(title)
    await userEvent.type(title, 'Pending title')
    await userEvent.click(screen.getByRole('button', { name: 'Save metadata' }))
    await waitFor(() => expect(resolveSave).toBeDefined())
    const preview = screen.getByRole('link', { name: 'Preview exhibition' })
    await userEvent.click(preview)
    await userEvent.click(screen.getByRole('button', { name: 'Stay' }))
    await waitFor(() => expect(preview).toHaveFocus())

    await act(async () => { resolveSave?.(respond(detail({ title: 'Saved title' }))) })

    expect(await screen.findByText('Metadata saved.')).toBeInTheDocument()
    expect(window.location.pathname).toBe('/exhibitions/1/edit')
    expect(document.activeElement).not.toBe(document.body)
  })

  it('aborts a pending metadata save after Discard and keeps the destination stable', async () => {
    let saveSignal: AbortSignal | undefined
    const fetchMock = vi.fn((path: string, options?: RequestInit) => {
      if (path === '/api/exhibitions/1' && options?.method === 'PUT') {
        saveSignal = options.signal as AbortSignal
        return new Promise<Response>((_, reject) => {
          saveSignal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
        })
      }
      if (path === '/api/exhibitions/1') return Promise.resolve(respond(detail()))
      throw new Error(`Unexpected request: ${path}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    renderAt('/exhibitions/1/edit')

    const title = await screen.findByLabelText(/title/i)
    await userEvent.clear(title)
    await userEvent.type(title, 'Pending title')
    await userEvent.click(screen.getByRole('button', { name: 'Save metadata' }))
    await userEvent.click(screen.getByRole('link', { name: 'Preview exhibition' }))
    await userEvent.click(screen.getByRole('button', { name: 'Discard changes' }))

    expect(await screen.findByText('Draft preview')).toBeInTheDocument()
    await waitFor(() => expect(saveSignal?.aborted).toBe(true))
    expect(window.location.pathname).toBe('/exhibitions/1/preview')
    expect(document.activeElement).not.toBe(document.body)
  })

  it('blocks a dirty route-parameter switch between exhibitions', async () => {
    const fetchMock = vi.fn((path: string) => {
      if (path === '/api/exhibitions/1') return Promise.resolve(respond(detail({ id: 1, title: 'First exhibition' })))
      if (path === '/api/exhibitions/2') return Promise.resolve(respond(detail({ id: 2, title: 'Second exhibition' })))
      throw new Error(`Unexpected request: ${path}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    renderAt('/exhibitions/1/edit')
    const title = await screen.findByLabelText(/title/i)
    await userEvent.type(title, ' changed')

    const routeChange = appRouter.navigate('/exhibitions/2/edit')

    expect(await screen.findByRole('alertdialog')).toBeInTheDocument()
    expect(window.location.pathname).toBe('/exhibitions/1/edit')
    await userEvent.click(screen.getByRole('button', { name: 'Discard changes' }))
    await routeChange
    expect(await screen.findByDisplayValue('Second exhibition')).toBeInTheDocument()
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

  it('confirms once, then aborts an old mutation and ignores its stale callback after discard', async () => {
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
    const routeChange = appRouter.navigate('/exhibitions/2/edit')

    expect(await screen.findByRole('alertdialog')).toBeInTheDocument()
    expect(screen.getAllByRole('alertdialog')).toHaveLength(1)
    expect(putSignal?.aborted).toBe(false)
    await userEvent.click(screen.getByRole('button', { name: 'Discard changes' }))
    await routeChange

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
