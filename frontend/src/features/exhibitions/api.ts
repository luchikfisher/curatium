import { apiRequest } from '../../api/client'
import type {
  ExhibitionArtwork,
  ExhibitionDetail,
  ExhibitionItem,
  ExhibitionMetadata,
  ExhibitionStatus,
  ExhibitionSummary,
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

function parseNullableNumber(value: unknown): number | null {
  if (value === undefined || value === null) return null
  if (typeof value === 'number') return value
  throw new TypeError('Invalid nullable number')
}

function parseArtwork(value: unknown): ExhibitionArtwork {
  if (
    !isRecord(value) ||
    typeof value.id !== 'number' ||
    value.source !== 'ART_INSTITUTE_OF_CHICAGO' ||
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
    coverArtworkId: parseNullableNumber(value.coverArtworkId),
    items: value.items.map(parseItem),
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
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

export async function deleteDraftExhibition(
  exhibitionId: number,
  signal?: AbortSignal,
): Promise<void> {
  await apiRequest(`/api/exhibitions/${exhibitionId}`, { method: 'DELETE', signal })
}
