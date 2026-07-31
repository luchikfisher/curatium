import type { GalleryViewpoint } from './types'

export const GALLERY_VIEWPOINTS: readonly GalleryViewpoint[] = [
  { position: [-3.5, 3.1, 4.5], target: [-6.88, 3.1, 4.5] },
  { position: [-3.5, 3.1, 0], target: [-6.88, 3.1, 0] },
  { position: [-3.5, 3.1, -4.5], target: [-6.88, 3.1, -4.5] },
  { position: [-2.7, 3.1, -5.5], target: [-2.7, 3.1, -8.88] },
  { position: [2.7, 3.1, -5.5], target: [2.7, 3.1, -8.88] },
  { position: [3.5, 3.1, -4.5], target: [6.88, 3.1, -4.5] },
  { position: [3.5, 3.1, 0], target: [6.88, 3.1, 0] },
  { position: [3.5, 3.1, 4.5], target: [6.88, 3.1, 4.5] },
  { position: [-2.7, 3.1, 5.5], target: [-2.7, 3.1, 8.88] },
  { position: [2.7, 3.1, 5.5], target: [2.7, 3.1, 8.88] },
]

export function viewpointForSlot(slotIndex: number): GalleryViewpoint | null {
  return GALLERY_VIEWPOINTS[slotIndex] ?? null
}

export function cameraTransitionFactor(reducedMotion: boolean, delta: number): number {
  return reducedMotion ? 1 : Math.min(1, Math.max(0, delta) * 6)
}
