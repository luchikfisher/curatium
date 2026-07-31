import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ExhibitionGallery, GalleryErrorBoundary } from './ExhibitionGallery'
import * as webgl from './webgl'
import type { GalleryExhibition } from './types'

vi.mock('@react-three/fiber', () => ({
  Canvas: () => {
    throw new Error('Scene initialization failed')
  },
  useFrame: vi.fn(),
  useThree: vi.fn(),
}))

const exhibition: GalleryExhibition = {
  id: 1,
  title: 'Gallery test',
  items: [{ id: 11, position: 1, artwork: { id: 101, title: 'First artwork', imageUrl: 'https://images.example/first.jpg' } }],
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

  it('removes navigation and keyboard controls when the gallery scene fails', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.spyOn(webgl, 'supportsWebGL').mockReturnValue(true)

    render(<ExhibitionGallery exhibition={exhibition} headingLevel={1} fallback={<p>Standard exhibition content</p>} />)

    expect(screen.getByText('Standard exhibition content')).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Artwork navigation' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Previous artwork' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Next artwork' })).not.toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'ArrowRight' })
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
