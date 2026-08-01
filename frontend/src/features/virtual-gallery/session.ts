import type { GalleryExhibition } from './types'

export function gallerySessionKey(exhibition: GalleryExhibition): string {
  const orderedItemSignature = [...exhibition.items]
    .sort((first, second) => first.position - second.position || first.id - second.id)
    .map((item) => JSON.stringify([item.id, item.position, item.artwork.imageUrl]))
    .join('|')
  return `${exhibition.id}:${orderedItemSignature}`
}
