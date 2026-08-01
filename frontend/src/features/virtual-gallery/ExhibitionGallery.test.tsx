import { useEffect } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ExhibitionGallery, GalleryErrorBoundary } from './ExhibitionGallery'
import * as webgl from './webgl'
import type { GalleryExhibition } from './types'

type CanvasSession = {
  onContextLost?: () => void
  onCreated?: () => void
}

const canvasState = vi.hoisted(() => ({
  sceneFailure: false,
  rendererFailure: false,
  rendererFactoryCalls: 0,
  cleanupCalls: 0,
  sessions: new Map<number, CanvasSession>(),
}))

vi.mock('@react-three/fiber', () => ({
  Canvas: ({
    children,
    gl,
    onCreated,
    'data-gallery-attempt': attempt,
  }: {
    children: { props?: { onContextLost?: () => void } }
    gl?: (defaultProps: { canvas: HTMLCanvasElement }) => unknown
    onCreated?: () => void
    'data-gallery-attempt'?: number
  }) => {
    if (canvasState.sceneFailure) throw new Error('Scene initialization failed')
    const currentAttempt = attempt ?? -1
    const rendererFails = canvasState.rendererFailure
    canvasState.sessions.set(currentAttempt, { onContextLost: children.props?.onContextLost, onCreated })

    useEffect(() => {
      if (rendererFails && gl) {
        queueMicrotask(() => {
          canvasState.rendererFactoryCalls += 1
          gl({ canvas: document.createElement('canvas') })
          onCreated?.()
        })
      }
      return () => {
        canvasState.cleanupCalls += 1
      }
    }, [gl, onCreated, rendererFails])

    return (
      <div data-testid="gallery-canvas" data-gallery-attempt={attempt}>
        <button type="button" onClick={onCreated}>Renderer ready</button>
        <button type="button" onClick={children.props?.onContextLost}>Lose renderer context</button>
      </div>
    )
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

function renderGallery(fallback = <p>Standard exhibition content</p>) {
  return render(
    <ExhibitionGallery
      exhibition={exhibition}
      headingLevel={1}
      fallback={fallback}
      exitAction={<a href="/">Exit to exhibitions</a>}
    />,
  )
}

function markRendererReady() {
  fireEvent.click(screen.getByRole('button', { name: 'Renderer ready' }))
}

function recoveryPanel() {
  return screen.getByRole('region', { name: 'Showing the standard gallery' })
}

function canvasSession(attempt: number): CanvasSession {
  const session = canvasState.sessions.get(attempt)
  if (!session) throw new Error(`Missing renderer attempt ${attempt}`)
  return session
}

afterEach(() => {
  cleanup()
  canvasState.sceneFailure = false
  canvasState.rendererFailure = false
  canvasState.rendererFactoryCalls = 0
  canvasState.cleanupCalls = 0
  canvasState.sessions.clear()
  vi.restoreAllMocks()
})

describe('ExhibitionGallery renderer recovery', () => {
  it('uses the standard HTML fallback with an explicit reason when WebGL is unavailable', () => {
    vi.spyOn(webgl, 'supportsWebGL').mockReturnValue(false)
    renderGallery()

    expect(recoveryPanel()).toHaveTextContent('3D gallery is unavailable in this browser.')
    expect(screen.getByText('Standard exhibition content')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try 3D again' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Continue in standard view' })).toBeInTheDocument()
    expect(screen.queryByTestId('gallery-canvas')).not.toBeInTheDocument()
  })

  it('moves from loading to ready only after renderer creation', () => {
    vi.spyOn(webgl, 'supportsWebGL').mockReturnValue(true)
    renderGallery()

    expect(screen.getByText('Preparing the 3D gallery…')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Begin tour' })).not.toBeInTheDocument()

    markRendererReady()

    expect(screen.queryByText('Preparing the 3D gallery…')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Begin tour' })).toBeEnabled()
  })

  it('consumes an asynchronous renderer bootstrap failure without an unhandled rejection', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.spyOn(webgl, 'supportsWebGL').mockReturnValue(true)
    canvasState.rendererFailure = true
    const unhandledRejection = vi.fn((event: PromiseRejectionEvent) => event.preventDefault())
    window.addEventListener('unhandledrejection', unhandledRejection)
    renderGallery()

    await waitFor(() => expect(recoveryPanel()).toHaveTextContent('The 3D gallery could not start.'))
    expect(screen.getByText('Standard exhibition content')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Begin tour' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'View as standard gallery' })).not.toBeInTheDocument()
    expect(recoveryPanel()).toHaveFocus()
    expect(unhandledRejection).not.toHaveBeenCalled()
    window.removeEventListener('unhandledrejection', unhandledRejection)
  })

  it('moves from ready to a recoverable context-loss state and focuses the recovery panel', () => {
    vi.spyOn(webgl, 'supportsWebGL').mockReturnValue(true)
    renderGallery()
    markRendererReady()

    const contextButton = screen.getByRole('button', { name: 'Lose renderer context' })
    contextButton.focus()
    fireEvent.click(contextButton)

    expect(recoveryPanel()).toHaveTextContent('The 3D gallery stopped responding.')
    expect(screen.getByText('Standard exhibition content')).toBeInTheDocument()
    expect(recoveryPanel()).toHaveFocus()
  })

  it('reports a scene error to the parent recovery state', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.spyOn(webgl, 'supportsWebGL').mockReturnValue(true)
    canvasState.sceneFailure = true
    renderGallery()

    await waitFor(() => expect(recoveryPanel()).toHaveTextContent('We could not render the 3D gallery.'))
    expect(screen.getByText('Standard exhibition content')).toBeInTheDocument()
    await waitFor(() => expect(recoveryPanel()).toHaveFocus())
  })

  it('retries with a fresh renderer attempt, cleans up the old session, and keeps focus in the gallery', () => {
    vi.spyOn(webgl, 'supportsWebGL').mockReturnValue(true)
    renderGallery()
    expect(screen.getByTestId('gallery-canvas')).toHaveAttribute('data-gallery-attempt', '0')

    fireEvent.click(screen.getByRole('button', { name: 'Lose renderer context' }))
    fireEvent.click(screen.getByRole('button', { name: 'Try 3D again' }))

    expect(screen.getByText('Trying the 3D gallery again…')).toBeInTheDocument()
    expect(screen.getByTestId('gallery-canvas')).toHaveAttribute('data-gallery-attempt', '1')
    expect(canvasState.cleanupCalls).toBe(1)
    expect(screen.getByRole('region', { name: 'Gallery test' })).toHaveFocus()
    markRendererReady()

    expect(screen.getByRole('button', { name: 'Begin tour' })).toBeEnabled()
  })

  it('ignores stale callbacks from a retired renderer attempt', () => {
    vi.spyOn(webgl, 'supportsWebGL').mockReturnValue(true)
    renderGallery()
    const firstAttempt = canvasSession(0)
    firstAttempt.onCreated?.()

    fireEvent.click(screen.getByRole('button', { name: 'Lose renderer context' }))
    fireEvent.click(screen.getByRole('button', { name: 'Try 3D again' }))
    const secondAttempt = canvasSession(1)

    firstAttempt.onCreated?.()
    firstAttempt.onContextLost?.()
    expect(screen.getByText('Trying the 3D gallery again…')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Begin tour' })).not.toBeInTheDocument()

    act(() => secondAttempt.onCreated?.())
    expect(screen.getByRole('button', { name: 'Begin tour' })).toBeEnabled()
  })

  it('keeps a repeated renderer failure recoverable without automatic retry loops', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.spyOn(webgl, 'supportsWebGL').mockReturnValue(true)
    canvasState.rendererFailure = true
    renderGallery()

    await waitFor(() => expect(recoveryPanel()).toHaveTextContent('The 3D gallery could not start.'))
    expect(canvasState.rendererFactoryCalls).toBe(1)

    fireEvent.click(screen.getByRole('button', { name: 'Try 3D again' }))
    await waitFor(() => expect(canvasState.rendererFactoryCalls).toBe(2))
    expect(recoveryPanel()).toHaveTextContent('The 3D gallery could not start.')
    expect(screen.getByRole('button', { name: 'Try 3D again' })).toBeInTheDocument()

    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(canvasState.rendererFactoryCalls).toBe(2)
  })

  it('keeps deliberate standard mode distinct and moves focus to the standard-mode panel', () => {
    vi.spyOn(webgl, 'supportsWebGL').mockReturnValue(true)
    renderGallery()
    markRendererReady()

    fireEvent.click(screen.getByRole('button', { name: 'View as standard gallery' }))

    expect(screen.getByRole('region', { name: 'Viewing the standard gallery' })).toHaveFocus()
    expect(screen.queryByRole('region', { name: 'Showing the standard gallery' })).not.toBeInTheDocument()
    expect(screen.getByText('Standard exhibition content')).toBeInTheDocument()
    expect(document.activeElement).not.toBe(document.body)
  })

  it('does not promote a loading attempt to ready when standard mode is selected', () => {
    vi.spyOn(webgl, 'supportsWebGL').mockReturnValue(true)
    renderGallery()
    const loadingAttempt = canvasSession(0)

    fireEvent.click(screen.getByRole('button', { name: 'View as standard gallery' }))
    loadingAttempt.onCreated?.()

    expect(screen.getByRole('region', { name: 'Viewing the standard gallery' })).toHaveFocus()
    expect(screen.queryByRole('button', { name: 'Begin tour' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Try 3D again' }))
    expect(screen.getByText('Trying the 3D gallery again…')).toBeInTheDocument()
  })

  it('uses the same recovery labels with public and curator fallback content', () => {
    vi.spyOn(webgl, 'supportsWebGL').mockReturnValue(false)
    const publicView = renderGallery(<p>Public standard exhibition</p>)
    expect(recoveryPanel()).toHaveTextContent('3D gallery is unavailable in this browser.')
    expect(screen.getByRole('button', { name: 'Try 3D again' })).toBeInTheDocument()
    publicView.unmount()

    renderGallery(<p>Curator standard preview</p>)
    expect(recoveryPanel()).toHaveTextContent('3D gallery is unavailable in this browser.')
    expect(screen.getByRole('button', { name: 'Continue in standard view' })).toBeInTheDocument()
  })

  it('keeps the gallery boundary reset behavior for a new route key', () => {
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
