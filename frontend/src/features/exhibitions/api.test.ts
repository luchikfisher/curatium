import { afterEach, describe, expect, it, vi } from 'vitest'
import { listCuratorExhibitions } from './api'

afterEach(() => vi.unstubAllGlobals())

describe('listCuratorExhibitions', () => {
  it('rejects a valid JSON response that does not match the exhibition-list contract', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify([
            {
              id: 1,
              title: 'Lines of Light',
              summary: 'A study of light and form.',
              status: 'PUBLISHED',
              coverImageUrl: null,
              artworkCount: '3',
              updatedAt: '2026-07-18T12:00:00Z',
            },
          ]),
          { status: 200 },
        ),
      ),
    )

    const error = await listCuratorExhibitions().catch((reason: unknown) => reason)

    expect(error).toMatchObject({ kind: 'malformed', status: 200 })
  })
})
