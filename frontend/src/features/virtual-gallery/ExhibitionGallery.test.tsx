import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ExhibitionGallery, GalleryErrorBoundary } from './ExhibitionGallery'
import * as webgl from './webgl'
import type { GalleryExhibition } from './types'

const canvasState = vi.hoisted(() => ({ shouldFail: false }))

vi.mock('@react-three/fiber', () => ({
  Canvas: () => {
    if (canvasState.shouldFail) throw new Error('Scene initialization failed')
    return <div data-testid="gallery-canvas" />
  },
  useFrame: vi.fn(),
  useThree: vi.fn(),
}))

const exhibition: GalleryExhibition = {
  id: 1,
  title: 'Gallery test',
  summary: 'A gallery summary.',
  introduction: 'A gallery introduction.',
  items: [{ id: 11, position: 1, artwork: { id: 101, title: 'First artwork', imageUrl: 'https://images.example/first.jpg' } }],
}

function BrokenScene(): never {
  throw new Error('Scene initialization failed')
}

afterEach(() => {
  cleanup()
  canvasState.shouldFail = false
  vi.restoreAllMocks()
})

describe('ExhibitionGallery', () => {
  it('uses the standard HTML fallback when WebGL is unavailable', () => {
    render(
      <ExhibitionGallery
        exhibition={exhibition}
        headingLevel={1}
        fallback={<p>Standard exhibition content</p>}
        exitAction={<a href="/">Exit to exhibitions</a>}
      />,
    )
    expect(screen.getByText('Standard exhibition content')).toBeInTheDocument()
  })

  it('shows the introduction and does not select an artwork until the tour begins', () => {
    vi.spyOn(webgl, 'supportsWebGL').mockReturnValue(true)
    render(
      <ExhibitionGallery
        exhibition={exhibition}
        headingLevel={1}
        fallback={<p>Standard exhibition content</p>}
        exitAction={<a href="/">Exit to exhibitions</a>}
      />,
    )

    expect(screen.getByText('A gallery summary.')).toBeInTheDocument()
    expect(screen.getByText('A gallery introduction.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Begin tour' })).toBeEnabled()
    expect(screen.queryByRole('navigation', { name: 'Artwork navigation' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Previous artwork' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Begin tour' }))

    expect(screen.queryByText('A gallery introduction.')).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Artwork 1 of 1: First artwork')
    expect(screen.getByRole('navigation', { name: 'Artwork navigation' })).toBeInTheDocument()
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
    canvasState.shouldFail = true

    render(
      <ExhibitionGallery
        exhibition={exhibition}
        headingLevel={1}
        fallback={<p>Standard exhibition content</p>}
        exitAction={<a href="/">Exit to exhibitions</a>}
      />,
    )

    expect(screen.getByText('Standard exhibition content')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Gallery test' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Begin tour' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'View as standard gallery' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Exit to exhibitions' })).not.toBeInTheDocument()
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
