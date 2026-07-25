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
