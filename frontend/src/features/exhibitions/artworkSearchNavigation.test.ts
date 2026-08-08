import { describe, expect, it } from 'vitest'
import {
  createArtworkSearchReturnState,
  createArtworkSearchString,
  parseArtworkSearchUrl,
  readArtworkSearchReturnTarget,
} from './artworkSearchNavigation'

describe('artwork search URL state', () => {
  it('parses and canonicalizes a valid query and page', () => {
    expect(parseArtworkSearchUrl('?q=%20night+sky%20&page=3')).toEqual({
      query: 'night sky',
      page: 3,
      canonicalSearch: '?q=night+sky&page=3',
      searchable: true,
    })
  })

  it('omits default or missing page one', () => {
    expect(parseArtworkSearchUrl('?q=night').canonicalSearch).toBe('?q=night')
    expect(parseArtworkSearchUrl('?q=night&page=1').canonicalSearch).toBe('?q=night')
  })

  it.each(['', '0', '-1', '1.5', 'page', '10001', '999999999999999999999'])(
    'normalizes invalid page %j to page one',
    (page) => {
      const state = parseArtworkSearchUrl(`?q=night&page=${encodeURIComponent(page)}`)
      expect(state.page).toBe(1)
      expect(state.canonicalSearch).toBe('?q=night')
    },
  )

  it('drops blank and unsupported query values with their page', () => {
    expect(parseArtworkSearchUrl('?q=%20%20&page=4')).toEqual({
      query: '',
      page: 1,
      canonicalSearch: '',
      searchable: false,
    })
    expect(parseArtworkSearchUrl('?q=x&page=4').canonicalSearch).toBe('')
    expect(parseArtworkSearchUrl(`?q=${'x'.repeat(101)}&page=4`).canonicalSearch).toBe('')
  })

  it('keeps direct entry without parameters in the empty-search state', () => {
    expect(parseArtworkSearchUrl('')).toEqual({
      query: '',
      page: 1,
      canonicalSearch: '',
      searchable: false,
    })
  })

  it('creates canonical search strings', () => {
    expect(createArtworkSearchString('  night sky  ', 1)).toBe('?q=night+sky')
    expect(createArtworkSearchString('night sky', 2)).toBe('?q=night+sky&page=2')
    expect(createArtworkSearchString('', 2)).toBe('')
  })

  it('round-trips only a validated same-exhibition preview return state', () => {
    const state = createArtworkSearchReturnState(7, 'night sky', 2)
    expect(readArtworkSearchReturnTarget(state, 7))
      .toBe('/exhibitions/7/artworks?q=night+sky&page=2')
    expect(readArtworkSearchReturnTarget(state, 8)).toBeNull()
    expect(readArtworkSearchReturnTarget({ artworkSearchReturn: {
      exhibitionId: 7,
      query: ' night sky ',
      page: 2,
    } }, 7)).toBeNull()
    expect(readArtworkSearchReturnTarget({ artworkSearchReturn: {
      exhibitionId: 7,
      query: 'night sky',
      page: -1,
    } }, 7)).toBeNull()
  })
})
