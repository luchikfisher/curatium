import { apiRequest } from '../../api/client'
import type { ExhibitionStatus, ExhibitionSummary } from './types'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function parseSummary(value: unknown): ExhibitionSummary {
  if (
    !isRecord(value) ||
    typeof value.id !== 'number' ||
    typeof value.title !== 'string' ||
    !(value.summary === null || typeof value.summary === 'string') ||
    !(value.status === 'DRAFT' || value.status === 'PUBLISHED') ||
    !(
      value.coverImageUrl === null ||
      typeof value.coverImageUrl === 'string'
    ) ||
    typeof value.artworkCount !== 'number' ||
    typeof value.updatedAt !== 'string'
  ) {
    throw new TypeError('Invalid exhibition summary')
  }
  return {
    id: value.id,
    title: value.title,
    summary: value.summary,
    status: value.status as ExhibitionStatus,
    coverImageUrl: value.coverImageUrl,
    artworkCount: value.artworkCount,
    updatedAt: value.updatedAt,
  }
}

function parseSummaries(value: unknown): ExhibitionSummary[] {
  if (!Array.isArray(value)) throw new TypeError('Expected an array')
  return value.map(parseSummary)
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
