import type { GalleryItem, GallerySlot, SlottedArtwork } from './types'

export const MAX_GALLERY_ARTWORKS = 10
export const MAX_ARTWORK_WIDTH = 3.3
export const MAX_ARTWORK_HEIGHT = 3.7

export const GALLERY_SLOTS: readonly GallerySlot[] = [
  { wall: 'left', position: [-6.88, 3.1, 4.5], rotation: [0, Math.PI / 2, 0] },
  { wall: 'left', position: [-6.88, 3.1, 0], rotation: [0, Math.PI / 2, 0] },
  { wall: 'left', position: [-6.88, 3.1, -4.5], rotation: [0, Math.PI / 2, 0] },
  { wall: 'front', position: [-2.7, 3.1, -8.88], rotation: [0, 0, 0] },
  { wall: 'front', position: [2.7, 3.1, -8.88], rotation: [0, 0, 0] },
  { wall: 'right', position: [6.88, 3.1, -4.5], rotation: [0, -Math.PI / 2, 0] },
  { wall: 'right', position: [6.88, 3.1, 0], rotation: [0, -Math.PI / 2, 0] },
  { wall: 'right', position: [6.88, 3.1, 4.5], rotation: [0, -Math.PI / 2, 0] },
  { wall: 'rear', position: [-2.7, 3.1, 8.88], rotation: [0, Math.PI, 0] },
  { wall: 'rear', position: [2.7, 3.1, 8.88], rotation: [0, Math.PI, 0] },
]

export function assignArtworkSlots(items: readonly GalleryItem[]): SlottedArtwork[] {
  return [...items]
    .sort((first, second) => first.position - second.position)
    .slice(0, MAX_GALLERY_ARTWORKS)
    .map((item, index) => ({ item, slot: GALLERY_SLOTS[index] }))
}

export function fitArtwork(aspectRatio: number): { width: number; height: number } {
  const safeAspectRatio = Number.isFinite(aspectRatio) && aspectRatio > 0 ? aspectRatio : 1
  if (safeAspectRatio >= MAX_ARTWORK_WIDTH / MAX_ARTWORK_HEIGHT) {
    return { width: MAX_ARTWORK_WIDTH, height: MAX_ARTWORK_WIDTH / safeAspectRatio }
  }
  return { width: MAX_ARTWORK_HEIGHT * safeAspectRatio, height: MAX_ARTWORK_HEIGHT }
}
