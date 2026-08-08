const MINIMUM_QUERY_LENGTH = 2
const MAXIMUM_QUERY_LENGTH = 100
const MAXIMUM_PAGE = 10_000

export interface ArtworkSearchUrlState {
  query: string
  page: number
  canonicalSearch: string
  searchable: boolean
}

interface ArtworkSearchReturnState {
  artworkSearchReturn: {
    exhibitionId: number
    query: string
    page: number
  }
}

export function parseArtworkSearchUrl(search: string): ArtworkSearchUrlState {
  const parameters = new URLSearchParams(search)
  const query = normalizeQuery(parameters.get('q') ?? '')
  const page = query ? normalizePage(parameters.get('page')) : 1

  return {
    query,
    page,
    canonicalSearch: createArtworkSearchString(query, page),
    searchable: query.length >= MINIMUM_QUERY_LENGTH,
  }
}

export function createArtworkSearchString(query: string, page: number): string {
  const normalizedQuery = normalizeQuery(query)
  if (!normalizedQuery) return ''

  const parameters = new URLSearchParams({ q: normalizedQuery })
  const normalizedPage = normalizePage(String(page))
  if (normalizedPage > 1) parameters.set('page', String(normalizedPage))
  return `?${parameters.toString()}`
}

export function createArtworkSearchReturnState(
  exhibitionId: number,
  query: string,
  page: number,
): ArtworkSearchReturnState | undefined {
  const normalizedQuery = normalizeQuery(query)
  if (!normalizedQuery) return undefined
  return {
    artworkSearchReturn: {
      exhibitionId,
      query: normalizedQuery,
      page: normalizePage(String(page)),
    },
  }
}

export function readArtworkSearchReturnTarget(
  state: unknown,
  exhibitionId: number,
): string | null {
  if (!isRecord(state) || !isRecord(state.artworkSearchReturn)) return null
  const candidate = state.artworkSearchReturn
  if (
    candidate.exhibitionId !== exhibitionId
    || typeof candidate.query !== 'string'
    || typeof candidate.page !== 'number'
    || !Number.isInteger(candidate.page)
  ) {
    return null
  }

  const query = normalizeQuery(candidate.query)
  if (query !== candidate.query || query.length < MINIMUM_QUERY_LENGTH) return null
  const page = normalizePage(String(candidate.page))
  if (page !== candidate.page) return null

  return `/exhibitions/${exhibitionId}/artworks${createArtworkSearchString(query, page)}`
}

function normalizeQuery(value: string): string {
  const normalized = value.trim()
  return normalized.length >= MINIMUM_QUERY_LENGTH && normalized.length <= MAXIMUM_QUERY_LENGTH
    ? normalized
    : ''
}

function normalizePage(value: string | null): number {
  if (!value || !/^[1-9]\d*$/.test(value)) return 1
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed <= MAXIMUM_PAGE ? parsed : 1
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
