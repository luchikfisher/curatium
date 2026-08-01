import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { GalleryExhibition } from './types'

vi.mock('./ExhibitionGallery', () => ({
  ExhibitionGallery: ({ exhibition }: { exhibition: GalleryExhibition }) => (
    <section aria-label="Loaded virtual gallery"><h2>{exhibition.title}</h2></section>
  ),
}))

import { GalleryChunkLoading, LazyExhibitionGallery } from './LazyExhibitionGallery'

const exhibition: GalleryExhibition = {
  id: 41,
  title: 'Lazy gallery test',
  items: [],
}

afterEach(cleanup)

describe('LazyExhibitionGallery', () => {
  it('keeps standard content operable in a distinct accessible state until the 3D chunk resolves', async () => {
    const useStandardContent = vi.fn()
    render(
      <LazyExhibitionGallery
        exhibition={exhibition}
        fallback={<button type="button" onClick={useStandardContent}>Use standard content</button>}
        exitAction={<a href="/">Exit to exhibitions</a>}
      />,
    )

    const loadingStatus = screen.getByRole('status')
    const galleryShell = screen.getByRole('region', { name: 'Exhibition gallery experience' })
    expect(loadingStatus).toHaveTextContent('Loading the 3D gallery…')
    expect(galleryShell).toHaveFocus()
    expect(screen.getByRole('heading', { name: 'Preparing the 3D gallery' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Showing the standard gallery' })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Viewing the standard gallery' })).not.toBeInTheDocument()
    const standardContentControl = screen.getByRole('button', { name: 'Use standard content' })
    fireEvent.click(standardContentControl)
    expect(useStandardContent).toHaveBeenCalledOnce()
    expect(screen.getByRole('link', { name: 'Exit to exhibitions' })).toBeInTheDocument()
    standardContentControl.focus()
    expect(standardContentControl).toHaveFocus()

    expect(await screen.findByRole('region', { name: 'Loaded virtual gallery' })).toHaveTextContent('Lazy gallery test')
    expect(screen.queryByText('Loading the 3D gallery…', { exact: false })).not.toBeInTheDocument()
    expect(galleryShell).toHaveFocus()
    expect(document.activeElement).not.toBe(document.body)
  })

  it('uses the same loading terminology for public and curator route content', () => {
    const publicView = render(
      <GalleryChunkLoading
        exhibitionId={1}
        fallback={<p>Public standard exhibition</p>}
        exitAction={<a href="/">Exit to exhibitions</a>}
      />,
    )
    const publicCopy = screen.getByRole('status').textContent
    expect(screen.getByRole('region', { name: 'Standard gallery available while the 3D gallery loads' })).toHaveTextContent('Public standard exhibition')
    publicView.unmount()

    render(
      <GalleryChunkLoading
        exhibitionId={2}
        fallback={<p>Curator standard preview</p>}
        exitAction={<a href="/exhibitions/2/edit">Return to exhibition editor</a>}
      />,
    )
    expect(screen.getByRole('status')).toHaveTextContent(publicCopy ?? '')
    expect(screen.getByRole('region', { name: 'Standard gallery available while the 3D gallery loads' })).toHaveTextContent('Curator standard preview')
    expect(screen.getByRole('link', { name: 'Return to exhibition editor' })).toBeInTheDocument()
  })
})
