import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ArtworkImage } from './ArtworkImage'

describe('ArtworkImage', () => {
  afterEach(cleanup)

  it.each(['thumbnail', 'cover', 'artwork'] as const)(
    'preserves the %s role through loading, failure, retry, success, and source replacement',
    (visualRole) => {
      const firstSource = `/api/artwork-images/art-institute/${visualRole}-first/display`
      const nextSource = `/api/artwork-images/art-institute/${visualRole}-next/display`
      const { container, rerender } = render(
        <ArtworkImage src={firstSource} visualRole={visualRole} alt={`${visualRole} work`} />,
      )

      const frame = container.querySelector('.artwork-image')
      expect(frame).toHaveClass(`artwork-image--${visualRole}`, 'artwork-image--loading')

      const firstImage = screen.getByRole('img', { name: `${visualRole} work` })
      fireEvent.error(firstImage)
      expect(frame).toHaveClass(`artwork-image--${visualRole}`, 'artwork-image--failed')

      fireEvent.click(screen.getByRole('button', { name: `Retry image: ${visualRole} work` }))
      const retriedImage = screen.getByRole('img', { name: `${visualRole} work` })
      expect(retriedImage).not.toBe(firstImage)
      expect(frame).toHaveClass(`artwork-image--${visualRole}`, 'artwork-image--loading')

      fireEvent.load(retriedImage)
      expect(frame).toHaveClass(`artwork-image--${visualRole}`, 'artwork-image--loaded')

      rerender(<ArtworkImage src={nextSource} visualRole={visualRole} alt={`${visualRole} work`} />)
      expect(frame).toHaveClass(`artwork-image--${visualRole}`, 'artwork-image--loading')
      expect(screen.getByRole('img', { name: `${visualRole} work` })).toHaveAttribute('src', nextSource)
    },
  )

  it.each(['thumbnail', 'cover', 'artwork'] as const)(
    'preserves the %s role for a missing source',
    (visualRole) => {
      const { container } = render(
        <ArtworkImage src={null} visualRole={visualRole} alt={`Missing ${visualRole}`} />,
      )

      expect(container.querySelector('.artwork-image')).toHaveClass(
        `artwork-image--${visualRole}`,
        'artwork-image--failed',
      )
    },
  )

  it('renders a successful informative image and removes the loading placeholder', () => {
    render(<ArtworkImage src="/api/artwork-images/art-institute/11111111-1111-1111-1111-111111111111/display" visualRole="artwork" alt="Nocturne" />)

    const image = screen.getByRole('img', { name: 'Nocturne' })
    expect(image).toHaveAttribute('src', '/api/artwork-images/art-institute/11111111-1111-1111-1111-111111111111/display')
    expect(screen.getByText('Loading artwork image')).toBeInTheDocument()
    fireEvent.load(image)
    expect(screen.queryByText('Loading artwork image')).not.toBeInTheDocument()
  })

  it('shows the deliberate informative fallback after an image failure', () => {
    render(<ArtworkImage src="/api/artwork-images/art-institute/unavailable/display" visualRole="artwork" alt="Unavailable work" />)

    fireEvent.error(screen.getByRole('img', { name: 'Unavailable work' }))
    expect(screen.getByRole('group', { name: 'Artwork image unavailable: Unavailable work' })).toBeInTheDocument()
    expect(screen.getByText('Artwork image unavailable')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retry image: Unavailable work' })).toBeInTheDocument()
  })

  it('shows an informative missing source without a retry action', () => {
    render(<ArtworkImage src={null} visualRole="artwork" alt="Missing work" />)

    expect(screen.getByRole('group', { name: 'Artwork image unavailable: Missing work' })).toBeInTheDocument()
    expect(screen.getByText('Artwork image unavailable')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /retry image/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('keeps a decorative missing source hidden without a retry action', () => {
    const { container } = render(<ArtworkImage src={undefined} visualRole="cover" decorative />)

    expect(container.querySelector('.artwork-image--failed')).toBeInTheDocument()
    expect(screen.queryByRole('group')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /retry image/i })).not.toBeInTheDocument()
  })

  it('retries the unchanged source by remounting the image and can then load successfully', () => {
    const source = '/api/artwork-images/art-institute/recoverable/display'
    render(<ArtworkImage src={source} visualRole="artwork" alt="Recoverable work" />)

    const failedImage = screen.getByRole('img', { name: 'Recoverable work' })
    fireEvent.error(failedImage)
    fireEvent.click(screen.getByRole('button', { name: 'Retry image: Recoverable work' }))

    const retriedImage = screen.getByRole('img', { name: 'Recoverable work' })
    expect(retriedImage).toHaveAttribute('src', source)
    expect(retriedImage).not.toBe(failedImage)
    expect(screen.getByText('Loading artwork image')).toBeInTheDocument()
    fireEvent.load(retriedImage)
    expect(screen.queryByText('Loading artwork image')).not.toBeInTheDocument()
  })

  it('keeps a repeated failure recoverable', () => {
    render(<ArtworkImage src="/api/artwork-images/art-institute/repeated/display" visualRole="artwork" alt="Repeated work" />)

    fireEvent.error(screen.getByRole('img', { name: 'Repeated work' }))
    fireEvent.click(screen.getByRole('button', { name: 'Retry image: Repeated work' }))
    fireEvent.error(screen.getByRole('img', { name: 'Repeated work' }))

    expect(screen.getByRole('group', { name: 'Artwork image unavailable: Repeated work' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retry image: Repeated work' })).toBeInTheDocument()
  })

  it('resets a failed image when its source changes', () => {
    const { rerender } = render(<ArtworkImage src="/api/artwork-images/art-institute/failed/display" visualRole="artwork" alt="Changing work" />)

    fireEvent.error(screen.getByRole('img', { name: 'Changing work' }))
    rerender(<ArtworkImage src="/api/artwork-images/art-institute/recovered/display" visualRole="artwork" alt="Changing work" />)

    expect(screen.getByRole('img', { name: 'Changing work' })).toHaveAttribute(
      'src',
      '/api/artwork-images/art-institute/recovered/display',
    )
    expect(screen.queryByRole('img', { name: 'Artwork image unavailable: Changing work' })).not.toBeInTheDocument()
  })

  it('renders normally when a missing source later becomes valid', () => {
    const source = '/api/artwork-images/art-institute/recovered/display'
    const { rerender } = render(<ArtworkImage src={null} visualRole="artwork" alt="Restored work" />)

    rerender(<ArtworkImage src={source} visualRole="artwork" alt="Restored work" />)

    expect(screen.getByRole('img', { name: 'Restored work' })).toHaveAttribute('src', source)
    expect(screen.getByText('Loading artwork image')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /retry image/i })).not.toBeInTheDocument()
  })

  it('keeps decorative artwork hidden from assistive technology without exposing a retry action', () => {
    const { container } = render(
      <ArtworkImage
        src="/api/artwork-images/art-institute/11111111-1111-1111-1111-111111111111/thumbnail"
        visualRole="thumbnail"
        decorative
        loading="lazy"
      />,
    )

    const image = container.querySelector('img')
    expect(image).toHaveAttribute('alt', '')
    expect(image).toHaveAttribute('loading', 'lazy')
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    fireEvent.error(image!)
    expect(screen.queryByRole('button', { name: /retry image/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('group')).not.toBeInTheDocument()
  })
})
