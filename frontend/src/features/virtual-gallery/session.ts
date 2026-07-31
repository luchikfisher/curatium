import type { GalleryExhibition } from './types'

export function gallerySessionKey(exhibition: GalleryExhibition): string {
  const orderedItemSignature = [...exhibition.items]
    .sort((first, second) => first.position - second.position || first.id - second.id)
    .map((item) => `${item.id}:${item.position}`)
    .join('|')
  return `${exhibition.id}:${orderedItemSignature}`
}
