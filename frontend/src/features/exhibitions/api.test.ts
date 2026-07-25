import { afterEach, describe, expect, it, vi } from 'vitest'
import { createExhibition, getExhibition, listCuratorExhibitions, updateExhibition } from './api'

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

describe('exhibition detail requests', () => {
  it('rejects an empty successful detail response as malformed', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })))

    const error = await getExhibition(1).catch((reason: unknown) => reason)

    expect(error).toMatchObject({ kind: 'malformed', status: 204 })
  })

  it('rejects empty create and update responses as malformed', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)
    const metadata = { title: 'A quiet room', summary: '', introduction: '' }

    await expect(createExhibition(metadata)).rejects.toMatchObject({ kind: 'malformed', status: 204 })
    await expect(updateExhibition(1, metadata)).rejects.toMatchObject({ kind: 'malformed', status: 204 })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('parses the backend item shape and rejects invalid artwork fields', async () => {
    const validDetail = {
      id: 1,
      title: 'Lines of Light',
      summary: null,
      introduction: null,
      status: 'DRAFT',
      coverArtworkId: 4,
      items: [{
        id: 7,
        position: 1,
        curatorialNote: null,
        artwork: {
          id: 4,
          source: 'ART_INSTITUTE_OF_CHICAGO',
          externalId: '154235',
          title: 'Nocturne',
          artistDisplay: null,
          dateDisplay: null,
          mediumDisplay: null,
          thumbnailUrl: 'https://images.example/thumbnail.jpg',
          imageUrl: 'https://images.example/full.jpg',
          sourceUrl: null,
          creditLine: null,
          publicDomain: true,
        },
      }],
      createdAt: '2026-07-18T12:00:00Z',
      updatedAt: '2026-07-18T12:00:00Z',
    }
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(validDetail), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        ...validDetail,
        items: [{ ...validDetail.items[0], artwork: { ...validDetail.items[0].artwork, thumbnailUrl: null } }],
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        ...validDetail,
        items: [{ ...validDetail.items[0], artwork: { ...validDetail.items[0].artwork, source: 'UNKNOWN_SOURCE' } }],
      }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(getExhibition(1)).resolves.toMatchObject({
      coverArtworkId: 4,
      items: [{ artwork: { source: 'ART_INSTITUTE_OF_CHICAGO' } }],
    })
    await expect(getExhibition(1)).rejects.toMatchObject({ kind: 'malformed', status: 200 })
    await expect(getExhibition(1)).rejects.toMatchObject({ kind: 'malformed', status: 200 })
  })
})
