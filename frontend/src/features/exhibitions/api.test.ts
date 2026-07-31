import { afterEach, describe, expect, it, vi } from 'vitest'
import { createExhibition, getExhibition, listCuratorExhibitions, searchMuseumArtworks, updateExhibition } from './api'

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

  it('normalizes omitted nullable summary fields to null', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify([{
      id: 1,
      title: 'Uncovered draft',
      status: 'DRAFT',
      artworkCount: 0,
      updatedAt: '2026-07-18T12:00:00Z',
    }]), { status: 200 })))

    await expect(listCuratorExhibitions()).resolves.toEqual([expect.objectContaining({
      summary: null,
      coverImageUrl: null,
    })])
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

  it('normalizes omitted nullable fields in a newly created draft', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      id: 8,
      title: 'New draft',
      status: 'DRAFT',
      items: [],
      createdAt: '2026-07-18T12:00:00Z',
      updatedAt: '2026-07-18T12:00:00Z',
    }), { status: 201 })))

    await expect(createExhibition({ title: 'New draft', summary: '', introduction: '' }))
      .resolves.toMatchObject({
        summary: null,
        introduction: null,
        coverArtworkId: null,
        publishedAt: null,
      })
  })

  it('normalizes omitted item and artwork fields, while rejecting invalid values', async () => {
    const validDetail = {
      id: 1,
      title: 'Lines of Light',
      summary: null,
      introduction: null,
      status: 'DRAFT',
      publishedAt: null,
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
    const omittedNullableDetail = {
      ...validDetail,
      summary: undefined,
      introduction: undefined,
      publishedAt: undefined,
      coverArtworkId: undefined,
      items: [{
        ...validDetail.items[0],
        curatorialNote: undefined,
        artwork: {
          ...validDetail.items[0].artwork,
          artistDisplay: undefined,
          dateDisplay: undefined,
          mediumDisplay: undefined,
          sourceUrl: undefined,
          creditLine: undefined,
        },
      }],
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
      .mockResolvedValueOnce(new Response(JSON.stringify(omittedNullableDetail), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ...validDetail, summary: 123 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ...validDetail, publishedAt: 123 }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(getExhibition(1)).resolves.toMatchObject({
      coverArtworkId: 4,
      items: [{ artwork: { source: 'ART_INSTITUTE_OF_CHICAGO' } }],
    })
    await expect(getExhibition(1)).rejects.toMatchObject({ kind: 'malformed', status: 200 })
    await expect(getExhibition(1)).rejects.toMatchObject({ kind: 'malformed', status: 200 })
    await expect(getExhibition(1)).resolves.toMatchObject({
      summary: null,
      introduction: null,
      publishedAt: null,
      coverArtworkId: null,
      items: [{
        curatorialNote: null,
        artwork: {
          artistDisplay: null,
          dateDisplay: null,
          mediumDisplay: null,
          sourceUrl: null,
          creditLine: null,
        },
      }],
    })
    await expect(getExhibition(1)).rejects.toMatchObject({ kind: 'malformed', status: 200 })
    await expect(getExhibition(1)).rejects.toMatchObject({ kind: 'malformed', status: 200 })
  })

  it('rejects an invalid publishedAt instant as malformed', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      id: 1,
      title: 'Malformed publication time',
      status: 'PUBLISHED',
      publishedAt: 'not-an-instant',
      items: [],
      createdAt: '2026-07-18T12:00:00Z',
      updatedAt: '2026-07-18T12:00:00Z',
    }), { status: 200 })))

    await expect(getExhibition(1)).rejects.toMatchObject({ kind: 'malformed', status: 200 })
  })
})

describe('museum search requests', () => {
  it('parses Cleveland search results with same-origin image URLs', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      items: [{
        source: 'CLEVELAND_MUSEUM_OF_ART',
        externalId: '1947.209',
        title: 'The Large Plane Trees',
        artistDisplay: 'Vincent van Gogh',
        dateDisplay: '1889',
        mediumDisplay: 'oil on fabric',
        thumbnailUrl: '/api/artwork-images/cleveland/1947.209/thumbnail',
        imageUrl: '/api/artwork-images/cleveland/1947.209/display',
        sourceUrl: 'https://clevelandart.org/art/1947.209',
        creditLine: null,
        publicDomain: true,
      }],
      page: 1,
      pageSize: 20,
      hasNextPage: false,
    }), { status: 200 })))

    await expect(searchMuseumArtworks('plane trees')).resolves.toEqual({
      items: [expect.objectContaining({
        source: 'CLEVELAND_MUSEUM_OF_ART',
        externalId: '1947.209',
        thumbnailUrl: '/api/artwork-images/cleveland/1947.209/thumbnail',
        imageUrl: '/api/artwork-images/cleveland/1947.209/display',
      })],
      page: 1,
      pageSize: 20,
      hasNextPage: false,
    })
  })
})
