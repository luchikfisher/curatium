export type ExhibitionStatus = 'DRAFT' | 'PUBLISHED'

export interface ExhibitionSummary {
  id: number
  title: string
  summary: string | null
  status: ExhibitionStatus
  coverImageUrl: string | null
  artworkCount: number
  updatedAt: string
}

export interface ExhibitionMetadata {
  title: string
  summary: string
  introduction: string
}

export type ArtworkSource = 'ART_INSTITUTE_OF_CHICAGO'

export interface ExhibitionArtwork {
  id: number
  source: ArtworkSource
  externalId: string
  title: string
  artistDisplay: string | null
  dateDisplay: string | null
  mediumDisplay: string | null
  thumbnailUrl: string
  imageUrl: string
  sourceUrl: string | null
  creditLine: string | null
  publicDomain: boolean
}

export interface ExhibitionItem {
  id: number
  artwork: ExhibitionArtwork
  position: number
  curatorialNote: string | null
}

export interface ExhibitionDetail {
  id: number
  title: string
  summary: string | null
  introduction: string | null
  status: ExhibitionStatus
  coverArtworkId: number | null
  items: ExhibitionItem[]
  createdAt: string
  updatedAt: string
}

export interface MuseumArtworkSearchResult {
  source: ArtworkSource
  externalId: string
  title: string
  artistDisplay: string | null
  dateDisplay: string | null
  mediumDisplay: string | null
  thumbnailUrl: string | null
  imageUrl: string | null
  sourceUrl: string | null
  creditLine: string | null
  publicDomain: boolean
}

export interface MuseumArtworkSearchPage {
  items: MuseumArtworkSearchResult[]
  page: number
  pageSize: number
  hasNextPage: boolean
}
