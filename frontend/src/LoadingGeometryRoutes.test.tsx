import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'

function renderAt(path: string) {
  window.history.pushState({}, '', path)
  window.dispatchEvent(new PopStateEvent('popstate'))
  return render(<App />)
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('route loading geometry', () => {
  it('reserves the public card grid on /', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})))
    const { container } = renderAt('/')

    expect(screen.getAllByRole('status')).toHaveLength(1)
    expect(screen.getByRole('status')).toHaveTextContent('Loading exhibitions…')
    const geometry = container.querySelector('.loading-geometry--exhibition-grid')
    expect(geometry).toHaveClass('exhibition-grid')
    expect(geometry).toHaveAttribute('aria-hidden', 'true')
  })

  it('reserves the compact curator management list on /exhibitions', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})))
    const { container } = renderAt('/exhibitions')

    expect(screen.getAllByRole('status')).toHaveLength(1)
    expect(screen.getByRole('status')).toHaveTextContent('Loading your exhibitions…')
    const geometry = container.querySelector('.loading-geometry--curator-list')
    expect(geometry).toHaveClass('curator-exhibition-list')
    expect(geometry).toHaveAttribute('aria-hidden', 'true')
    expect(geometry?.querySelectorAll('.loading-curator-row')).toHaveLength(2)
  })

  it.each([
    ['/exhibitions/1/edit', 'Loading exhibition metadata…', 'metadata'],
    ['/exhibitions/1/artworks', 'Loading exhibition artworks…', 'artworks'],
    ['/exhibitions/1/preview', 'Loading curator preview…', 'preview'],
    ['/visit/1', 'Loading exhibition…', 'public-exhibition'],
  ])('reserves the dominant route shell on %s without a synthetic H1', (path, label, geometry) => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})))
    const { container } = renderAt(path)

    expect(screen.getAllByRole('status')).toHaveLength(1)
    expect(screen.getByRole('status')).toHaveTextContent(label)
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument()
    const reservedGeometry = container.querySelector(`.loading-route-shell--${geometry}`)
    expect(reservedGeometry).toHaveAttribute('aria-hidden', 'true')
    expect(reservedGeometry?.querySelector('[aria-live]')).not.toBeInTheDocument()
  })
})
