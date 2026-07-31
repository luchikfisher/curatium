import { apiRequest } from '../../api/client'
import type {
  ArtworkSource,
  ExhibitionArtwork,
  ExhibitionDetail,
  ExhibitionItem,
  ExhibitionMetadata,
  ExhibitionStatus,
  ExhibitionSummary,
  MuseumArtworkSearchPage,
  MuseumArtworkSearchResult,
  PublicExhibitionArtwork,
  PublicExhibitionDetail,
  PublicExhibitionItem,
} from './types'
import { FrontendError } from '../../api/errors'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function parseSummary(value: unknown): ExhibitionSummary {
  if (
    !isRecord(value) ||
    typeof value.id !== 'number' ||
    typeof value.title !== 'string' ||
    !(value.status === 'DRAFT' || value.status === 'PUBLISHED') ||
    typeof value.artworkCount !== 'number' ||
    typeof value.updatedAt !== 'string'
  ) {
    throw new TypeError('Invalid exhibition summary')
  }
  return {
    id: value.id,
    title: value.title,
    summary: parseNullableString(value.summary),
    status: value.status as ExhibitionStatus,
    coverImageUrl: parseNullableString(value.coverImageUrl),
    artworkCount: value.artworkCount,
    updatedAt: value.updatedAt,
  }
}

function parseSummaries(value: unknown): ExhibitionSummary[] {
  if (!Array.isArray(value)) throw new TypeError('Expected an array')
  return value.map(parseSummary)
}

function parseNullableString(value: unknown): string | null {
  if (value === undefined || value === null) return null
  if (typeof value === 'string') return value
  throw new TypeError('Invalid nullable string')
}

function parseNullableTimestamp(value: unknown): string | null {
  if (value === undefined || value === null) return null
  if (
    typeof value === 'string' &&
    /(?:Z|[+-]\d{2}:\d{2})$/.test(value) &&
    !Number.isNaN(Date.parse(value))
  ) {
    return value
  }
  throw new TypeError('Invalid nullable timestamp')
}

function parseNullableNumber(value: unknown): number | null {
  if (value === undefined || value === null) return null
  if (typeof value === 'number') return value
  throw new TypeError('Invalid nullable number')
}

function isArtworkSource(value: unknown): value is ArtworkSource {
  return value === 'ART_INSTITUTE_OF_CHICAGO' || value === 'CLEVELAND_MUSEUM_OF_ART'
}

function parseArtwork(value: unknown): ExhibitionArtwork {
  if (
    !isRecord(value) ||
    typeof value.id !== 'number' ||
    !isArtworkSource(value.source) ||
    typeof value.externalId !== 'string' ||
    typeof value.title !== 'string' ||
    typeof value.thumbnailUrl !== 'string' ||
    typeof value.imageUrl !== 'string' ||
    typeof value.publicDomain !== 'boolean'
  ) {
    throw new TypeError('Invalid exhibition artwork')
  }
  return {
    id: value.id,
    source: value.source,
    externalId: value.externalId,
    title: value.title,
    artistDisplay: parseNullableString(value.artistDisplay),
    dateDisplay: parseNullableString(value.dateDisplay),
    mediumDisplay: parseNullableString(value.mediumDisplay),
    thumbnailUrl: value.thumbnailUrl,
    imageUrl: value.imageUrl,
    sourceUrl: parseNullableString(value.sourceUrl),
    creditLine: parseNullableString(value.creditLine),
    publicDomain: value.publicDomain,
  }
}

function parseItem(value: unknown): ExhibitionItem {
  if (
    !isRecord(value) ||
    typeof value.id !== 'number' ||
    typeof value.position !== 'number'
  ) {
    throw new TypeError('Invalid exhibition item')
  }
  return {
    id: value.id,
    artwork: parseArtwork(value.artwork),
    position: value.position,
    curatorialNote: parseNullableString(value.curatorialNote),
  }
}

function parseItems(value: unknown): ExhibitionItem[] {
  if (!Array.isArray(value)) throw new TypeError('Expected an array of exhibition items')
  return value.map(parseItem)
}

function parseMuseumArtwork(value: unknown): MuseumArtworkSearchResult {
  if (
    !isRecord(value) ||
    !isArtworkSource(value.source) ||
    typeof value.externalId !== 'string' ||
    typeof value.title !== 'string' ||
    typeof value.publicDomain !== 'boolean'
  ) {
    throw new TypeError('Invalid museum artwork')
  }
  return {
    source: value.source,
    externalId: value.externalId,
    title: value.title,
    artistDisplay: parseNullableString(value.artistDisplay),
    dateDisplay: parseNullableString(value.dateDisplay),
    mediumDisplay: parseNullableString(value.mediumDisplay),
    thumbnailUrl: parseNullableString(value.thumbnailUrl),
    imageUrl: parseNullableString(value.imageUrl),
    sourceUrl: parseNullableString(value.sourceUrl),
    creditLine: parseNullableString(value.creditLine),
    publicDomain: value.publicDomain,
  }
}

function parseMuseumArtworkSearchPage(value: unknown): MuseumArtworkSearchPage {
  if (
    !isRecord(value) ||
    !Array.isArray(value.items) ||
    typeof value.page !== 'number' ||
    typeof value.pageSize !== 'number' ||
    typeof value.hasNextPage !== 'boolean'
  ) {
    throw new TypeError('Invalid museum artwork search page')
  }
  return {
    items: value.items.map(parseMuseumArtwork),
    page: value.page,
    pageSize: value.pageSize,
    hasNextPage: value.hasNextPage,
  }
}

function parseDetail(value: unknown): ExhibitionDetail {
  if (
    !isRecord(value) ||
    typeof value.id !== 'number' ||
    typeof value.title !== 'string' ||
    !(value.status === 'DRAFT' || value.status === 'PUBLISHED') ||
    !Array.isArray(value.items) ||
    typeof value.createdAt !== 'string' ||
    typeof value.updatedAt !== 'string'
  ) {
    throw new TypeError('Invalid exhibition detail')
  }
  return {
    id: value.id,
    title: value.title,
    summary: parseNullableString(value.summary),
    introduction: parseNullableString(value.introduction),
    status: value.status,
    publishedAt: parseNullableTimestamp(value.publishedAt),
    coverArtworkId: parseNullableNumber(value.coverArtworkId),
    items: value.items.map(parseItem),
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  }
}

function parsePublicArtwork(value: unknown): PublicExhibitionArtwork {
  if (
    !isRecord(value) ||
    typeof value.id !== 'number' ||
    typeof value.title !== 'string' ||
    typeof value.imageUrl !== 'string'
  ) {
    throw new TypeError('Invalid public exhibition artwork')
  }
  return {
    id: value.id,
    title: value.title,
    artistDisplay: parseNullableString(value.artistDisplay),
    dateDisplay: parseNullableString(value.dateDisplay),
    mediumDisplay: parseNullableString(value.mediumDisplay),
    imageUrl: value.imageUrl,
    sourceUrl: parseNullableString(value.sourceUrl),
    creditLine: parseNullableString(value.creditLine),
  }
}

function parsePublicItem(value: unknown): PublicExhibitionItem {
  if (
    !isRecord(value) ||
    typeof value.id !== 'number' ||
    typeof value.position !== 'number'
  ) {
    throw new TypeError('Invalid public exhibition item')
  }
  return {
    id: value.id,
    position: value.position,
    curatorialNote: parseNullableString(value.curatorialNote),
    artwork: parsePublicArtwork(value.artwork),
  }
}

function parsePublicDetail(value: unknown): PublicExhibitionDetail {
  if (
    !isRecord(value) ||
    typeof value.id !== 'number' ||
    typeof value.title !== 'string' ||
    !Array.isArray(value.items)
  ) {
    throw new TypeError('Invalid public exhibition detail')
  }
  return {
    id: value.id,
    title: value.title,
    summary: parseNullableString(value.summary),
    introduction: parseNullableString(value.introduction),
    publishedAt: parseNullableTimestamp(value.publishedAt),
    coverArtworkId: parseNullableNumber(value.coverArtworkId),
    items: value.items.map(parsePublicItem),
  }
}

async function getSummaries(
  path: string,
  signal?: AbortSignal,
): Promise<ExhibitionSummary[]> {
  return (await apiRequest(path, { signal }, parseSummaries)) ?? []
}

export function listCuratorExhibitions(
  signal?: AbortSignal,
): Promise<ExhibitionSummary[]> {
  return getSummaries('/api/exhibitions', signal)
}

export function listPublicExhibitions(
  signal?: AbortSignal,
): Promise<ExhibitionSummary[]> {
  return getSummaries('/api/public/exhibitions', signal)
}

async function requestDetail(
  path: string,
  options: RequestInit,
): Promise<ExhibitionDetail> {
  const detail = await apiRequest(path, options, parseDetail)
  if (detail === undefined) {
    throw new FrontendError(
      'The server returned an empty exhibition response.',
      'malformed',
      204,
    )
  }
  return detail
}

export function getExhibition(
  exhibitionId: number,
  signal?: AbortSignal,
): Promise<ExhibitionDetail> {
  return requestDetail(
    `/api/exhibitions/${exhibitionId}`,
    { signal },
  )
}

export async function getPublicExhibition(
  exhibitionId: number,
  signal?: AbortSignal,
): Promise<PublicExhibitionDetail> {
  const exhibition = await apiRequest(
    `/api/public/exhibitions/${exhibitionId}`,
    { signal },
    parsePublicDetail,
  )
  if (exhibition === undefined) {
    throw new FrontendError(
      'The server returned an empty public exhibition response.',
      'malformed',
      204,
    )
  }
  return exhibition
}

function metadataRequest(
  method: 'POST' | 'PUT',
  path: string,
  metadata: ExhibitionMetadata,
  signal?: AbortSignal,
): Promise<ExhibitionDetail> {
  return requestDetail(
    path,
    {
      method,
      signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(metadata),
    },
  )
}

export function createExhibition(
  metadata: ExhibitionMetadata,
  signal?: AbortSignal,
): Promise<ExhibitionDetail> {
  return metadataRequest('POST', '/api/exhibitions', metadata, signal)
}

export function updateExhibition(
  exhibitionId: number,
  metadata: ExhibitionMetadata,
  signal?: AbortSignal,
): Promise<ExhibitionDetail> {
  return metadataRequest('PUT', `/api/exhibitions/${exhibitionId}`, metadata, signal)
}

function publicationRequest(
  exhibitionId: number,
  action: 'publish' | 'unpublish',
  signal?: AbortSignal,
): Promise<ExhibitionDetail> {
  return requestDetail(
    `/api/exhibitions/${exhibitionId}/${action}`,
    { method: 'POST', signal },
  )
}

export function publishExhibition(
  exhibitionId: number,
  signal?: AbortSignal,
): Promise<ExhibitionDetail> {
  return publicationRequest(exhibitionId, 'publish', signal)
}

export function unpublishExhibition(
  exhibitionId: number,
  signal?: AbortSignal,
): Promise<ExhibitionDetail> {
  return publicationRequest(exhibitionId, 'unpublish', signal)
}

export function selectExhibitionCover(
  exhibitionId: number,
  artworkId: number,
  signal?: AbortSignal,
): Promise<ExhibitionDetail> {
  return requestDetail(
    `/api/exhibitions/${exhibitionId}/cover`,
    {
      method: 'PUT',
      signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ artworkId }),
    },
  )
}

export function clearExhibitionCover(
  exhibitionId: number,
  signal?: AbortSignal,
): Promise<ExhibitionDetail> {
  return requestDetail(
    `/api/exhibitions/${exhibitionId}/cover`,
    { method: 'DELETE', signal },
  )
}

export async function searchMuseumArtworks(
  query: string,
  page = 1,
  size = 20,
  signal?: AbortSignal,
): Promise<MuseumArtworkSearchPage> {
  const parameters = new URLSearchParams({
    q: query,
    page: String(page),
    size: String(size),
  })
  const result = await apiRequest(
    `/api/museum/artworks?${parameters.toString()}`,
    { signal },
    parseMuseumArtworkSearchPage,
  )
  if (result === undefined) {
    throw new FrontendError(
      'The server returned an empty museum search response.',
      'malformed',
      204,
    )
  }
  return result
}

export async function addExhibitionArtwork(
  exhibitionId: number,
  artwork: Pick<MuseumArtworkSearchResult, 'source' | 'externalId'>,
  signal?: AbortSignal,
): Promise<ExhibitionItem> {
  const item = await apiRequest(
    `/api/exhibitions/${exhibitionId}/items`,
    {
      method: 'POST',
      signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: artwork.source, externalId: artwork.externalId }),
    },
    parseItem,
  )
  if (item === undefined) {
    throw new FrontendError(
      'The server returned an empty added-artwork response.',
      'malformed',
      204,
    )
  }
  return item
}

export async function updateExhibitionItemNote(
  exhibitionId: number,
  itemId: number,
  curatorialNote: string | null,
  signal?: AbortSignal,
): Promise<ExhibitionItem> {
  const item = await apiRequest(
    `/api/exhibitions/${exhibitionId}/items/${itemId}`,
    {
      method: 'PUT',
      signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ curatorialNote }),
    },
    parseItem,
  )
  if (item === undefined) {
    throw new FrontendError(
      'The server returned an empty curatorial-note response.',
      'malformed',
      204,
    )
  }
  return item
}

export async function moveExhibitionItem(
  exhibitionId: number,
  itemId: number,
  direction: 'up' | 'down',
  signal?: AbortSignal,
): Promise<ExhibitionItem[]> {
  const items = await apiRequest(
    `/api/exhibitions/${exhibitionId}/items/${itemId}/move-${direction}`,
    { method: 'POST', signal },
    parseItems,
  )
  if (items === undefined) {
    throw new FrontendError(
      'The server returned an empty item-order response.',
      'malformed',
      204,
    )
  }
  return items
}

export async function removeExhibitionItem(
  exhibitionId: number,
  itemId: number,
  signal?: AbortSignal,
): Promise<void> {
  await apiRequest(
    `/api/exhibitions/${exhibitionId}/items/${itemId}`,
    { method: 'DELETE', signal },
  )
}

export async function deleteDraftExhibition(
  exhibitionId: number,
  signal?: AbortSignal,
): Promise<void> {
  await apiRequest(`/api/exhibitions/${exhibitionId}`, { method: 'DELETE', signal })
}
