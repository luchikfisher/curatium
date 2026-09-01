import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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

interface ValidationFocusSnapshot {
  target: Element
  ariaInvalid: string | null
  describedBy: string | null
  inlineError: string | null
  summary: string | null
}

function recordValidationFocus(
  control: HTMLElement,
  snapshots: ValidationFocusSnapshot[],
) {
  const listener = (event: FocusEvent) => {
    if (event.target !== control) return
    const describedBy = control.getAttribute('aria-describedby')
    snapshots.push({
      target: control,
      ariaInvalid: control.getAttribute('aria-invalid'),
      describedBy,
      inlineError: describedBy ? document.getElementById(describedBy)?.textContent ?? null : null,
      summary: control.closest('form')?.querySelector('[role="alert"]')?.textContent ?? null,
    })
  }
  document.addEventListener('focusin', listener)
  return () => document.removeEventListener('focusin', listener)
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('exhibition create and edit workflow', () => {
  it('announces a blank metadata submission once and focuses the first invalid field', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    renderAt('/exhibitions/new')

    const title = screen.getByLabelText(/title/i)
    const focusSnapshots: ValidationFocusSnapshot[] = []
    const stopRecording = recordValidationFocus(title, focusSnapshots)

    await userEvent.click(screen.getByRole('button', { name: 'Create exhibition' }))
    stopRecording()

    expect(focusSnapshots).toEqual([{
      target: title,
      ariaInvalid: 'true',
      describedBy: 'title-error',
      inlineError: 'Title is required.',
      summary: 'Exhibition metadata was not submitted. Correct the highlighted field.',
    }])
    expect(title).toHaveFocus()
    expect(title).toHaveAttribute('aria-invalid', 'true')
    expect(title).toHaveAttribute('aria-describedby', 'title-error')
    expect(screen.getByText('Title is required.')).not.toHaveAttribute('role')
    expect(screen.getAllByRole('alert')).toHaveLength(1)
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Exhibition metadata was not submitted. Correct the highlighted field.',
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('announces one multi-error summary and focuses the first invalid metadata field in document order', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    renderAt('/exhibitions/new')

    const title = screen.getByLabelText(/title/i)
    const summary = screen.getByLabelText(/summary/i)
    const introduction = screen.getByLabelText(/introduction/i)
    await userEvent.type(title, 'Valid title')
    fireEvent.change(summary, { target: { value: 's'.repeat(301) } })
    fireEvent.change(introduction, { target: { value: 'i'.repeat(5001) } })
    const focusSnapshots: ValidationFocusSnapshot[] = []
    const stopRecording = recordValidationFocus(summary, focusSnapshots)
    await userEvent.click(screen.getByRole('button', { name: 'Create exhibition' }))
    stopRecording()

    expect(focusSnapshots).toEqual([{
      target: summary,
      ariaInvalid: 'true',
      describedBy: 'summary-error',
      inlineError: 'Summary must be at most 300 characters.',
      summary: 'Exhibition metadata was not submitted. Correct the 2 highlighted fields.',
    }])
    expect(summary).toHaveFocus()
    expect(summary).toHaveValue('s'.repeat(301))
    expect(introduction).toHaveValue('i'.repeat(5001))
    expect(screen.getByText('Summary must be at most 300 characters.')).toBeInTheDocument()
    expect(screen.getByText('Introduction must be at most 5,000 characters.')).toBeInTheDocument()
    expect(screen.getAllByRole('alert')).toHaveLength(1)
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Exhibition metadata was not submitted. Correct the 2 highlighted fields.',
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('does not move focus through validation when valid metadata is submitted', async () => {
    const created = detail({ id: 42, title: 'Valid exhibition' })
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(respond(created, 201))
      .mockResolvedValueOnce(respond(created))
    vi.stubGlobal('fetch', fetchMock)
    renderAt('/exhibitions/new')

    const title = screen.getByLabelText(/title/i)
    const summary = screen.getByLabelText(/summary/i)
    const introduction = screen.getByLabelText(/introduction/i)
    await userEvent.type(title, 'Valid exhibition')
    const validationFocusEvents: EventTarget[] = []
    const metadataControls: HTMLElement[] = [title, summary, introduction]
    const listener = (event: FocusEvent) => {
      if (metadataControls.includes(event.target as HTMLElement)) {
        validationFocusEvents.push(event.target!)
      }
    }
    document.addEventListener('focusin', listener)

    await userEvent.click(screen.getByRole('button', { name: 'Create exhibition' }))
    await screen.findByText('Exhibition created.')
    document.removeEventListener('focusin', listener)

    expect(validationFocusEvents).toEqual([])
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(screen.queryByText(/Exhibition metadata was not submitted/)).not.toBeInTheDocument()
  })

  it('shows the creation acknowledgement once and does not replay it after browser Back', async () => {
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
      .mockResolvedValueOnce(respond(detail({ id: 42, title: 'Night works' })))
      .mockResolvedValueOnce(respond(detail({ id: 42, title: 'Night works' })))
    vi.stubGlobal('fetch', fetchMock)
    renderAt('/exhibitions/new')

    await userEvent.type(screen.getByLabelText(/title/i), 'Night works')
    await userEvent.click(screen.getByRole('button', { name: 'Create exhibition' }))

    expect(await screen.findByText('Exhibition created.')).toBeInTheDocument()
    await waitFor(() => expect(window.history.state?.usr).toBeNull())
    expect(document.title).toBe('Metadata — Night works | Curatium')
    expect(screen.getByDisplayValue('Night works')).toBeInTheDocument()
    expect(window.location.pathname).toBe('/exhibitions/42/edit')
    expect(screen.getByRole('link', { name: 'Continue to artworks' })).toHaveAttribute('href', '/exhibitions/42/artworks')
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/exhibitions', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ title: 'Night works', summary: '', introduction: '' }),
    }))

    await userEvent.click(screen.getByRole('link', { name: 'Continue to artworks' }))
    expect(await screen.findByRole('heading', { name: 'Night works', level: 1 })).toBeInTheDocument()
    await act(async () => { await appRouter.navigate(-1) })

    expect(await screen.findByDisplayValue('Night works')).toBeInTheDocument()
    expect(screen.queryByText('Exhibition created.')).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Continue to artworks' })).not.toBeInTheDocument()
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
    expect(document.title).toBe('Metadata — Uncovered draft | Curatium')
    const context = screen.getByRole('region', { name: 'Current exhibition' })
    expect(screen.getByRole('heading', { name: 'Uncovered draft', level: 1 })).toBeInTheDocument()
    expect(within(context).queryByText('Uncovered draft')).not.toBeInTheDocument()
    expect(within(context).getByText('Draft')).toBeInTheDocument()
    expect(within(context).getByRole('link', { name: 'Metadata' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByLabelText(/summary/i)).toHaveValue('')
    expect(screen.getByLabelText(/introduction/i)).toHaveValue('')

    await userEvent.type(screen.getByLabelText(/title/i), ' unsaved')
    expect(document.title).toBe('Metadata — Uncovered draft | Curatium')
    expect(screen.getByRole('heading', { name: 'Uncovered draft', level: 1 })).toBeInTheDocument()
    expect(within(context).queryByText('Uncovered draft unsaved')).not.toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Exhibition actions' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Curate artworks' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Preview exhibition' })).not.toBeInTheDocument()
  })

  it('renders authoritative published metadata as concise editorial content without disabled form controls', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respond(detail({
      title: 'Published authority',
      summary: undefined,
      introduction: undefined,
      status: 'PUBLISHED',
      publishedAt: '2026-08-04T09:00:00Z',
    }))))
    renderAt('/exhibitions/1/edit')

    expect(await screen.findByRole('heading', { name: 'Published authority', level: 1 })).toBeInTheDocument()
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.getByRole('heading', { name: 'Published metadata', level: 2 })).toBeInTheDocument()
    expect(screen.getByText(/published and read-only/i)).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Current exhibition' })).getByText('Published'))
      .toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Preview and unpublish to edit' })).toHaveAttribute(
      'href',
      '/exhibitions/1/preview',
    )
    expect(screen.queryByRole('heading', { name: 'Summary' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Introduction' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/title/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save metadata' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete exhibition' })).not.toBeInTheDocument()
  })

  it('restores the unchanged draft metadata form after unpublishing and reopening Metadata', async () => {
    const published = detail({
      status: 'PUBLISHED',
      publishedAt: '2026-08-04T09:00:00Z',
    })
    const draft = detail({ status: 'DRAFT', publishedAt: null })
    let detailLoads = 0
    const fetchMock = vi.fn((path: string, options?: RequestInit) => {
      if (path === '/api/exhibitions/1/unpublish' && options?.method === 'POST') {
        return Promise.resolve(respond(draft))
      }
      if (path === '/api/exhibitions/1') {
        detailLoads += 1
        return Promise.resolve(respond(detailLoads <= 2 ? published : draft))
      }
      throw new Error(`Unexpected request: ${path}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    renderAt('/exhibitions/1/edit')

    await userEvent.click(await screen.findByRole('link', { name: 'Preview and unpublish to edit' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Unpublish exhibition' }))
    await userEvent.click(screen.getByRole('button', { name: 'Confirm unpublish' }))
    await screen.findByText('Exhibition unpublished. Curatorial editing is available again.')
    await userEvent.click(within(screen.getByRole('navigation', { name: 'Exhibition workflow' }))
      .getByRole('link', { name: 'Metadata' }))

    expect(await screen.findByLabelText(/title/i)).toHaveValue('Lines of Light')
    expect(screen.getByRole('button', { name: 'Save metadata' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Delete exhibition' })).toBeEnabled()
    expect(screen.queryByRole('heading', { name: 'Published metadata' })).not.toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Current exhibition' })).getByText('Draft'))
      .toBeInTheDocument()
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
    expect(screen.queryByRole('link', { name: 'Continue to artworks' })).not.toBeInTheDocument()
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
    expect(document.title).toBe('Loading exhibition metadata | Curatium')
    const title = await screen.findByLabelText(/title/i)
    expect(title).toHaveValue('Lines of Light')
    expect(document.title).toBe('Metadata — Lines of Light | Curatium')
    await userEvent.clear(title)
    await userEvent.type(title, 'Client title')
    expect(document.title).toBe('Metadata — Lines of Light | Curatium')
    await userEvent.click(screen.getByRole('button', { name: 'Save metadata' }))

    expect(await screen.findByText('Metadata saved.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Continue to artworks' })).toHaveAttribute('href', '/exhibitions/1/artworks')
    expect(screen.getByLabelText(/title/i)).toHaveValue('Server-normalized title')
    expect(document.title).toBe('Metadata — Server-normalized title | Curatium')
    expect(screen.getByRole('heading', { name: 'Server-normalized title', level: 1 })).toBeInTheDocument()
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
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
    await userEvent.click(screen.getByRole('link', { name: 'Artworks' }))
    expect(await screen.findByLabelText('Search terms')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Lines of Light', level: 1 })).toBeInTheDocument()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()

    await act(async () => { await appRouter.navigate('/exhibitions/1/edit') })
    const reloadedTitle = await screen.findByLabelText(/title/i)
    await userEvent.clear(reloadedTitle)
    await userEvent.type(reloadedTitle, '  Exact dirty title  ')
    await userEvent.click(screen.getByRole('link', { name: 'Preview & publish' }))
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    expect(window.location.pathname).toBe('/exhibitions/1/edit')

    await userEvent.click(screen.getByRole('button', { name: 'Discard changes' }))
    expect(await screen.findByRole('button', { name: 'Publish exhibition' })).toBeInTheDocument()
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
    await userEvent.click(screen.getByRole('link', { name: 'Preview & publish' }))
    expect(await screen.findByRole('button', { name: 'Publish exhibition' })).toBeInTheDocument()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()

    await act(async () => { await appRouter.navigate('/exhibitions/1/edit') })
    const titleAfterReturn = await screen.findByLabelText(/title/i)
    await userEvent.clear(titleAfterReturn)
    await userEvent.type(titleAfterReturn, 'Failed update')
    await userEvent.click(screen.getByRole('button', { name: 'Save metadata' }))
    await screen.findByText('Please try again.')
    expect(screen.queryByRole('link', { name: 'Continue to artworks' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('link', { name: 'Preview & publish' }))
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
    await userEvent.click(screen.getByRole('link', { name: 'Preview & publish' }))
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()

    await act(async () => { resolveSave?.(respond(detail({ title: 'Saved title' }))) })

    expect(await screen.findByRole('button', { name: 'Publish exhibition' })).toBeInTheDocument()
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
    await userEvent.click(screen.getByRole('link', { name: 'Preview & publish' }))

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
    const preview = screen.getByRole('link', { name: 'Preview & publish' })
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
    await userEvent.click(screen.getByRole('link', { name: 'Preview & publish' }))
    await userEvent.click(screen.getByRole('button', { name: 'Discard changes' }))

    expect(await screen.findByRole('button', { name: 'Publish exhibition' })).toBeInTheDocument()
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
    expect(screen.getByRole('heading', { name: 'Second exhibition', level: 1 })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'First exhibition', level: 1 })).not.toBeInTheDocument()
  })

  it('reconciles a metadata conflict to committed published values', async () => {
    const committedPublished = detail({
      title: 'Committed published title',
      summary: 'Committed published summary',
      introduction: 'Committed published introduction',
      status: 'PUBLISHED',
      publishedAt: '2026-08-04T09:00:00Z',
    })
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(respond(detail()))
      .mockResolvedValueOnce(respond(error(
        'PUBLISHED_EXHIBITION_READ_ONLY',
        'Published exhibitions cannot be changed.',
        409,
      ), 409))
      .mockResolvedValueOnce(respond(committedPublished))
    vi.stubGlobal('fetch', fetchMock)
    renderAt('/exhibitions/1/edit')

    const title = await screen.findByLabelText(/title/i)
    await userEvent.clear(title)
    await userEvent.type(title, 'Change attempted')
    await userEvent.click(screen.getByRole('button', { name: 'Save metadata' }))

    const reconciliationStatus = await screen.findByText(/attempted change was not saved because this exhibition is now published/i)
    expect(reconciliationStatus).toHaveFocus()
    expect(document.activeElement).not.toBe(document.body)
    expect(screen.queryByLabelText(/title/i)).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Committed published title', level: 1 })).toBeInTheDocument()
    expect(screen.getByText('Committed published summary')).toBeInTheDocument()
    expect(screen.getByText('Committed published introduction')).toBeInTheDocument()
    expect(screen.queryByDisplayValue('Change attempted')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete exhibition' })).not.toBeInTheDocument()
    const context = screen.getByRole('region', { name: 'Current exhibition' })
    expect(within(context).queryByText('Committed published title')).not.toBeInTheDocument()
    expect(within(context).getByText('Published')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Preview and unpublish to edit' })).toHaveAttribute('href', '/exhibitions/1/preview')
    expect(document.title).toBe('Metadata — Committed published title | Curatium')
  })

  it('labels failed metadata reconciliation and installs committed values after retry', async () => {
    const committedPublished = detail({
      title: 'Recovered published title',
      status: 'PUBLISHED',
      publishedAt: '2026-08-04T09:00:00Z',
    })
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(respond(detail()))
      .mockResolvedValueOnce(respond(error(
        'PUBLISHED_EXHIBITION_READ_ONLY',
        'Published exhibitions cannot be changed.',
        409,
      ), 409))
      .mockRejectedValueOnce(new TypeError('Connection lost'))
      .mockResolvedValueOnce(respond(committedPublished))
    vi.stubGlobal('fetch', fetchMock)
    renderAt('/exhibitions/1/edit')

    const title = await screen.findByLabelText(/title/i)
    await userEvent.clear(title)
    await userEvent.type(title, 'Rejected local title')
    await userEvent.click(screen.getByRole('button', { name: 'Save metadata' }))

    expect(await screen.findByText(/displayed information may be stale or unsaved/i)).toBeInTheDocument()
    expect(title).toHaveValue('Rejected local title')
    expect(title).toBeDisabled()
    const retryButton = screen.getByRole('button', { name: 'Retry loading committed version' })
    expect(retryButton).toHaveFocus()
    expect(document.activeElement).not.toBe(document.body)
    await userEvent.click(retryButton)

    expect(await screen.findByRole('heading', { name: 'Recovered published title', level: 1 })).toBeInTheDocument()
    expect(screen.queryByLabelText(/title/i)).not.toBeInTheDocument()
    expect(screen.queryByDisplayValue('Rejected local title')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Retry loading committed version' })).not.toBeInTheDocument()
    expect(screen.getByText(/committed published version is shown below/i)).toHaveFocus()
  })

  it('does not steal metadata reconciliation focus when the curator moves elsewhere', async () => {
    let resolveReconciliation: ((response: Response) => void) | undefined
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(respond(detail()))
      .mockResolvedValueOnce(respond(error(
        'PUBLISHED_EXHIBITION_READ_ONLY',
        'Published exhibitions cannot be changed.',
        409,
      ), 409))
      .mockImplementationOnce(() => new Promise<Response>((resolve) => {
        resolveReconciliation = resolve
      }))
    vi.stubGlobal('fetch', fetchMock)
    renderAt('/exhibitions/1/edit')

    const title = await screen.findByLabelText(/title/i)
    await userEvent.clear(title)
    await userEvent.type(title, 'Rejected local title')
    await userEvent.click(screen.getByRole('button', { name: 'Save metadata' }))
    await screen.findByText(/loading the committed published version/i)

    const previewLink = screen.getByRole('link', { name: 'Preview & publish' })
    previewLink.focus()
    expect(previewLink).toHaveFocus()
    resolveReconciliation?.(respond(detail({
      title: 'Committed title',
      status: 'PUBLISHED',
      publishedAt: '2026-08-04T09:00:00Z',
    })))

    await screen.findByRole('heading', { name: 'Committed title', level: 1 })
    expect(previewLink).toHaveFocus()
    expect(document.activeElement).not.toBe(document.body)
  })

  it('ignores a late reconciliation response after changing exhibition routes', async () => {
    let reconciliationSignal: AbortSignal | undefined
    let resolveReconciliation: ((response: Response) => void) | undefined
    let firstLoadComplete = false
    const fetchMock = vi.fn((path: string, options?: RequestInit) => {
      if (path === '/api/exhibitions/1' && options?.method === 'PUT') {
        return Promise.resolve(respond(error('PUBLISHED_EXHIBITION_READ_ONLY', 'Read only.', 409), 409))
      }
      if (path === '/api/exhibitions/1' && !firstLoadComplete) {
        firstLoadComplete = true
        return Promise.resolve(respond(detail({ id: 1, title: 'First exhibition' })))
      }
      if (path === '/api/exhibitions/1') {
        reconciliationSignal = options?.signal as AbortSignal
        return new Promise<Response>((resolve) => { resolveReconciliation = resolve })
      }
      if (path === '/api/exhibitions/2') {
        return Promise.resolve(respond(detail({ id: 2, title: 'Second exhibition' })))
      }
      throw new Error(`Unexpected request: ${path}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    renderAt('/exhibitions/1/edit')

    const title = await screen.findByLabelText(/title/i)
    await userEvent.clear(title)
    await userEvent.type(title, 'Rejected first-exhibition draft')
    await userEvent.click(screen.getByRole('button', { name: 'Save metadata' }))
    expect(await screen.findByText(/loading the committed published version/i)).toBeInTheDocument()

    const routeChange = appRouter.navigate('/exhibitions/2/edit')
    expect(await screen.findByRole('alertdialog')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Discard changes' }))
    await routeChange

    expect(await screen.findByDisplayValue('Second exhibition')).toBeInTheDocument()
    expect(reconciliationSignal?.aborted).toBe(true)
    resolveReconciliation?.(respond(detail({
      id: 1,
      title: 'Late published first exhibition',
      status: 'PUBLISHED',
      publishedAt: '2026-08-04T09:00:00Z',
    })))
    await act(async () => { await Promise.resolve() })
    expect(screen.getByDisplayValue('Second exhibition')).toBeInTheDocument()
    expect(screen.queryByDisplayValue('Late published first exhibition')).not.toBeInTheDocument()
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
    const confirmation = screen.getByRole('dialog', { name: 'Delete draft exhibition: Lines of Light?' })
    expect(confirmation).toHaveAttribute('aria-modal', 'false')
    expect(confirmation).toHaveAccessibleDescription('Delete this draft exhibition? This cannot be undone.')
    expect(screen.getByRole('button', { name: 'Confirm deletion' })).toHaveFocus()
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

    expect(screen.getByRole('button', { name: 'Delete exhibition' })).toHaveFocus()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('cancels deletion with Escape and restores the exact trigger', async () => {
    const fetchMock = vi.fn().mockResolvedValue(respond(detail()))
    vi.stubGlobal('fetch', fetchMock)
    renderAt('/exhibitions/1/edit')

    await screen.findByLabelText(/title/i)
    const deleteButton = screen.getByRole('button', { name: 'Delete exhibition' })
    await userEvent.click(deleteButton)
    const confirmation = screen.getByRole('dialog', { name: 'Delete draft exhibition: Lines of Light?' })
    await userEvent.keyboard('{Escape}')

    expect(confirmation).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete exhibition' })).toHaveFocus()
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
    expect(screen.getByRole('dialog', { name: 'Delete draft exhibition: Lines of Light?' })).toBeInTheDocument()
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

    expect(screen.getByRole('dialog', { name: 'Delete draft exhibition: Lines of Light?' }))
      .toHaveAttribute('aria-busy', 'true')
    expect(confirm).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Keep exhibition' })).toBeDisabled()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('reconciles a published deletion conflict as read-only', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(respond(detail()))
      .mockResolvedValueOnce(respond(error(
        'PUBLISHED_EXHIBITION_READ_ONLY',
        'Published exhibitions cannot be deleted.',
        409,
      ), 409))
      .mockResolvedValueOnce(respond(detail({
        title: 'Published committed exhibition',
        status: 'PUBLISHED',
        publishedAt: '2026-08-04T09:00:00Z',
      })))
    vi.stubGlobal('fetch', fetchMock)
    renderAt('/exhibitions/1/edit')

    await screen.findByLabelText(/title/i)
    await userEvent.click(screen.getByRole('button', { name: 'Delete exhibition' }))
    await userEvent.click(screen.getByRole('button', { name: 'Confirm deletion' }))

    expect(await screen.findByText(/attempted change was not saved because this exhibition is now published/i)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Published committed exhibition', level: 1 })).toBeInTheDocument()
    expect(screen.queryByLabelText(/title/i)).not.toBeInTheDocument()
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
