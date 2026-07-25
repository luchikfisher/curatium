import type { ExhibitionMetadata } from './types'

type MetadataField = keyof ExhibitionMetadata
export type MetadataFieldErrors = Partial<Record<MetadataField, string>>

const limits: Record<MetadataField, number> = {
  title: 150,
  summary: 300,
  introduction: 5000,
}

export function metadataLimit(field: MetadataField): number {
  return limits[field]
}

export function validateExhibitionMetadata(
  metadata: ExhibitionMetadata,
): MetadataFieldErrors {
  const errors: MetadataFieldErrors = {}
  if (!metadata.title.trim()) errors.title = 'Title is required.'
  if (metadata.title.trim().length > limits.title) {
    errors.title = 'Title must be at most 150 characters.'
  }
  if (metadata.summary.length > limits.summary) {
    errors.summary = 'Summary must be at most 300 characters.'
  }
  if (metadata.introduction.length > limits.introduction) {
    errors.introduction = 'Introduction must be at most 5,000 characters.'
  }
  return errors
}
