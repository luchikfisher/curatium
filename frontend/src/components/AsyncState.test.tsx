import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ErrorState, LoadingState, type LoadingGeometry } from './AsyncState'

const geometries: LoadingGeometry[] = [
  'exhibition-grid',
  'curator-list',
  'metadata',
  'artworks',
  'preview',
  'public-exhibition',
]

afterEach(cleanup)

describe('reserved loading geometry', () => {
  it.each(geometries)('keeps one accessible status and hides the %s geometry', (geometry) => {
    const { container } = render(<LoadingState label="Loading surface…" geometry={geometry} />)

    expect(screen.getAllByRole('status')).toHaveLength(1)
    expect(screen.getByRole('status')).toHaveTextContent('Loading surface…')
    const reservedGeometry = container.querySelector('.loading-geometry')
    expect(reservedGeometry).toHaveAttribute('aria-hidden', 'true')
    expect(reservedGeometry?.querySelector('[aria-live]')).not.toBeInTheDocument()
    expect(reservedGeometry?.querySelector('button, a, input, textarea, select')).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument()
  })

  it('uses the loaded exhibition grid contract for list-route skeleton columns', () => {
    const { container } = render(<LoadingState label="Loading exhibitions…" geometry="exhibition-grid" />)

    const grid = container.querySelector('.loading-geometry--exhibition-grid')
    expect(grid).toHaveClass('exhibition-grid')
    expect(grid?.querySelectorAll('.loading-card')).toHaveLength(2)
  })

  it('uses the compact management-list contract for curator skeleton rows', () => {
    const { container } = render(<LoadingState label="Loading exhibitions…" geometry="curator-list" />)

    const list = container.querySelector('.loading-geometry--curator-list')
    expect(list).toHaveClass('curator-exhibition-list')
    expect(list?.querySelectorAll('.loading-curator-row')).toHaveLength(2)
  })

  it('removes reserved geometry for loaded and error states without duplicating semantics', () => {
    const retry = vi.fn()
    const { container, rerender } = render(
      <LoadingState label="Loading exhibition…" geometry="public-exhibition" />,
    )

    expect(screen.getAllByRole('status')).toHaveLength(1)
    rerender(<main><h1>Loaded exhibition</h1></main>)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(container.querySelector('.loading-geometry')).not.toBeInTheDocument()

    rerender(<ErrorState error={new Error('Failed')} onRetry={retry} />)
    expect(screen.getAllByRole('alert')).toHaveLength(1)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(container.querySelector('.loading-geometry')).not.toBeInTheDocument()
  })
})
