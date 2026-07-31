import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiRequest } from './client'
import { FrontendError } from './errors'

afterEach(() => vi.unstubAllGlobals())

describe('apiRequest', () => {
  it('parses a successful JSON response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ title: 'A quiet room' }), { status: 200 })))
    await expect(apiRequest('/api/example', {}, (value) => {
      if (typeof value !== 'object' || value === null || !('title' in value) || typeof value.title !== 'string') throw new TypeError('Invalid title')
      return value.title
    })).resolves.toBe('A quiet room')
  })

  it('supports successful responses without a body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })))
    await expect(apiRequest('/api/example', { method: 'DELETE' })).resolves.toBeUndefined()
  })

  it('maps a structured ApiErrorResponse', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      code: 'VALIDATION_ERROR',
      message: 'The request contains invalid values.',
      fieldErrors: [{ field: 'title', message: 'Title is required.' }],
      timestamp: '2026-07-18T12:00:00Z',
    }), { status: 400 })))
    const error = await apiRequest('/api/example').catch((reason: unknown) => reason)
    expect(error).toBeInstanceOf(FrontendError)
    expect(error).toMatchObject({
      kind: 'api',
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'The request contains invalid values.',
      fieldErrors: [{ field: 'title', message: 'Title is required.' }],
    })
  })

  it('maps network failures without inventing an HTTP status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    const error = await apiRequest('/api/example').catch((reason: unknown) => reason)
    expect(error).toMatchObject({ kind: 'network', status: undefined })
  })

  it('preserves a supplied abort signal for fetch', async () => {
    const controller = new AbortController()
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await apiRequest('/api/example', { signal: controller.signal })

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/example',
      expect.objectContaining({ signal: controller.signal }),
    )
  })

  it('maps invalid successful JSON to a malformed response error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{', { status: 200 })))

    const error = await apiRequest('/api/example').catch((reason: unknown) => reason)

    expect(error).toMatchObject({ kind: 'malformed', status: 200 })
  })

  it('maps malformed non-success JSON to a malformed response error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{', { status: 503 })))

    const error = await apiRequest('/api/example').catch((reason: unknown) => reason)

    expect(error).toMatchObject({ kind: 'malformed', status: 503 })
  })

  it('rejects contract-invalid non-success JSON as malformed while preserving its status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      code: 'MUSEUM_SERVICE_UNAVAILABLE',
      message: 'The museum service is temporarily unavailable.',
      fieldErrors: [],
    }), { status: 503 })))

    const error = await apiRequest('/api/example').catch((reason: unknown) => reason)

    expect(error).toBeInstanceOf(FrontendError)
    expect(error).toMatchObject({ kind: 'malformed', status: 503, code: undefined, fieldErrors: [] })
  })

  it('preserves aborted requests so callers can ignore expected cancellation', async () => {
    const abortError = new DOMException('Aborted', 'AbortError')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(abortError))

    await expect(apiRequest('/api/example')).rejects.toBe(abortError)
  })
})
