import { describe, expect, it } from 'vitest'
import { ENTRY_CAMERA_POSITION, ROOM_BOUNDS } from './geometry'

describe('virtual gallery entry camera', () => {
  it('starts inside the room rather than behind the rear wall', () => {
    const [x, y, z] = ENTRY_CAMERA_POSITION
    expect(x).toBeGreaterThan(ROOM_BOUNDS.left)
    expect(x).toBeLessThan(ROOM_BOUNDS.right)
    expect(y).toBeGreaterThan(ROOM_BOUNDS.floor)
    expect(y).toBeLessThan(ROOM_BOUNDS.ceiling)
    expect(z).toBeGreaterThan(ROOM_BOUNDS.front)
    expect(z).toBeLessThan(ROOM_BOUNDS.rear)
  })
})
