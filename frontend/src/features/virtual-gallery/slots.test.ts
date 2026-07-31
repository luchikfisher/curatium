import { describe, expect, it } from 'vitest'
import { assignArtworkSlots, fitArtwork, GALLERY_SLOTS } from './slots'
import type { GalleryItem } from './types'

function item(position: number): GalleryItem {
  return {
    id: position + 10,
    position,
    artwork: { id: position + 100, title: `Artwork ${position}`, imageUrl: `https://images.example/${position}.jpg` },
  }
}

describe('virtual gallery slots', () => {
  it('assigns a single artwork to the first fixed left-wall slot', () => {
    const [assignment] = assignArtworkSlots([item(1)])
    expect(assignment).toEqual({ item: item(1), slot: GALLERY_SLOTS[0] })
  })

  it('sorts several artworks by their committed curator positions before assigning slots', () => {
    const assignments = assignArtworkSlots([item(3), item(1), item(2)])
    expect(assignments.map(({ item: artworkItem }) => artworkItem.position)).toEqual([1, 2, 3])
    expect(assignments.map(({ slot }) => slot.wall)).toEqual(['left', 'left', 'left'])
  })

  it('maps all ten supported artworks to the complete explicit slot table', () => {
    const assignments = assignArtworkSlots([10, 3, 7, 1, 9, 5, 2, 8, 4, 6].map(item))
    expect(assignments.map(({ item: artworkItem }) => artworkItem.position)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    expect(assignments.map(({ slot }) => slot)).toEqual(GALLERY_SLOTS)
  })

  it('fits landscape, portrait, and square images without changing their aspect ratios', () => {
    expect(fitArtwork(2)).toEqual({ width: 3.3, height: 1.65 })
    expect(fitArtwork(0.5)).toEqual({ width: 1.85, height: 3.7 })
    expect(fitArtwork(1)).toEqual({ width: 3.3, height: 3.3 })
  })
})
