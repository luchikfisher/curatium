import { describe, expect, it } from 'vitest'
import { ROOM_BOUNDS } from './geometry'
import { GALLERY_SLOTS } from './slots'
import { cameraTransitionFactor, GALLERY_VIEWPOINTS, viewpointForSlot } from './viewpoints'

describe('gallery viewpoints', () => {
  it('provides one deterministic viewpoint for every explicit artwork slot', () => {
    expect(GALLERY_VIEWPOINTS).toHaveLength(GALLERY_SLOTS.length)
    GALLERY_SLOTS.forEach((slot, index) => {
      const viewpoint = viewpointForSlot(index)
      expect(viewpoint?.target).toEqual(slot.position)
      expect(viewpoint?.position[0]).toBeGreaterThan(ROOM_BOUNDS.left)
      expect(viewpoint?.position[0]).toBeLessThan(ROOM_BOUNDS.right)
      expect(viewpoint?.position[1]).toBeGreaterThan(ROOM_BOUNDS.floor)
      expect(viewpoint?.position[1]).toBeLessThan(ROOM_BOUNDS.ceiling)
      expect(viewpoint?.position[2]).toBeGreaterThan(ROOM_BOUNDS.front)
      expect(viewpoint?.position[2]).toBeLessThan(ROOM_BOUNDS.rear)

      if (slot.wall === 'left') expect(viewpoint?.position[0]).toBeGreaterThan(slot.position[0])
      if (slot.wall === 'front') expect(viewpoint?.position[2]).toBeGreaterThan(slot.position[2])
      if (slot.wall === 'right') expect(viewpoint?.position[0]).toBeLessThan(slot.position[0])
      if (slot.wall === 'rear') expect(viewpoint?.position[2]).toBeLessThan(slot.position[2])
    })
  })

  it('uses a brief transition normally and an immediate change for reduced motion', () => {
    expect(cameraTransitionFactor(false, 0.1)).toBeCloseTo(0.6)
    expect(cameraTransitionFactor(true, 0.1)).toBe(1)
  })
})
