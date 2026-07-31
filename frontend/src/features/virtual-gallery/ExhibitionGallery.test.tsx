import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ExhibitionGallery, GalleryErrorBoundary } from './ExhibitionGallery'
import type { GalleryExhibition } from './types'

const exhibition: GalleryExhibition = {
  id: 1,
  title: 'Gallery test',
  items: [],
}

function BrokenScene(): never {
  throw new Error('Scene initialization failed')
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('ExhibitionGallery', () => {
  it('uses the standard HTML fallback when WebGL is unavailable', () => {
    render(<ExhibitionGallery exhibition={exhibition} headingLevel={1} fallback={<p>Standard exhibition content</p>} />)
    expect(screen.getByText('Standard exhibition content')).toBeInTheDocument()
  })

  it('uses its fallback when scene initialization throws', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    render(
      <GalleryErrorBoundary resetKey={1} fallback={<p>Standard exhibition content</p>}>
        <BrokenScene />
      </GalleryErrorBoundary>,
    )
    expect(screen.getByText('Standard exhibition content')).toBeInTheDocument()
  })

  it('resets a failed scene boundary for a new exhibition route', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const { rerender } = render(
      <GalleryErrorBoundary resetKey={1} fallback={<p>Standard exhibition content</p>}>
        <BrokenScene />
      </GalleryErrorBoundary>,
    )
    rerender(
      <GalleryErrorBoundary resetKey={2} fallback={<p>Standard exhibition content</p>}>
        <p>New exhibition scene</p>
      </GalleryErrorBoundary>,
    )
    expect(screen.getByText('New exhibition scene')).toBeInTheDocument()
  })
})
