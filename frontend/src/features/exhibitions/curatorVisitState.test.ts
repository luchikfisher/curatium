import { describe, expect, it } from 'vitest'
import { createCuratorVisitState, curatorReturnTarget } from './curatorVisitState'

describe('curator visit route state', () => {
  it('creates and accepts only the exact return target for the same exhibition', () => {
    const state = createCuratorVisitState(42)
    expect(state).toEqual({
      curatorExhibitionId: 42,
      curatorReturnTo: '/exhibitions/42/preview',
    })
    expect(curatorReturnTarget(state, 42)).toBe('/exhibitions/42/preview')
  })

  it.each([
    null,
    'invalid',
    {},
    { curatorExhibitionId: 2, curatorReturnTo: '/exhibitions/1/preview' },
    { curatorExhibitionId: 1, curatorReturnTo: '/exhibitions/2/preview' },
    { curatorExhibitionId: 1, curatorReturnTo: 'https://example.com/' },
  ])('ignores malformed, mismatched, or arbitrary route state', (state) => {
    expect(curatorReturnTarget(state, 1)).toBeNull()
  })
})
