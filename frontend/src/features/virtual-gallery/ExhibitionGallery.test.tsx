import { useEffect, type ReactNode } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ExhibitionGallery, GalleryErrorBoundary } from './ExhibitionGallery'
import * as webgl from './webgl'
import type { GalleryExhibition } from './types'

type CanvasSession = {
  onContextLost?: () => void
  onCreated?: () => void
  onTextureReady?: (artworkId: number, url: string, attempt: number) => void
  onTextureUnavailable?: (artworkId: number, url: string, attempt: number) => void
}

const canvasState = vi.hoisted(() => ({
  sceneFailure: false,
  rendererFailure: false,
  renderScene: false,
  rendererFactoryCalls: 0,
  cleanupCalls: 0,
  sessions: new Map<number, CanvasSession>(),
}))

const textureState = vi.hoisted(() => ({
  failedUrls: new Set<string>(),
  calls: new Map<string, number>(),
  clearCalls: [] as string[],
}))

const testTexture = {
  image: { width: 800, height: 600 },
  clone() {
    return {
      ...this,
      dispose: () => undefined,
    }
  },
}

vi.mock('@react-three/drei', () => {
  const useTexture = (url: string) => {
    textureState.calls.set(url, (textureState.calls.get(url) ?? 0) + 1)
    if (textureState.failedUrls.has(url)) throw new Error(`Texture unavailable: ${url}`)
    return testTexture
  }
  useTexture.clear = (url: string) => {
    textureState.clearCalls.push(url)
  }
  return { useTexture }
})

vi.mock('@react-three/fiber', () => ({
  Canvas: ({
    children,
    gl,
    onCreated,
    'data-gallery-attempt': attempt,
  }: {
    children: ReactNode & { props?: {
      onContextLost?: () => void
      onTextureReady?: (artworkId: number, url: string, attempt: number) => void
      onTextureUnavailable?: (artworkId: number, url: string, attempt: number) => void
    } }
    gl?: (defaultProps: { canvas: HTMLCanvasElement }) => unknown
    onCreated?: () => void
    'data-gallery-attempt'?: number
  }) => {
    if (canvasState.sceneFailure) throw new Error('Scene initialization failed')
    const currentAttempt = attempt ?? -1
    const rendererFails = canvasState.rendererFailure
    canvasState.sessions.set(currentAttempt, {
      onContextLost: children.props?.onContextLost,
      onCreated,
      onTextureReady: children.props?.onTextureReady,
      onTextureUnavailable: children.props?.onTextureUnavailable,
    })

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
        {canvasState.renderScene ? children : null}
      </div>
    )
  },
  useFrame: vi.fn(),
  useThree: (selector?: (state: {
    camera: {
      position: { copy: () => void; lerp: () => void; distanceToSquared: () => number }
      lookAt: () => void
      updateProjectionMatrix: () => void
    }
    invalidate: () => void
    gl: { domElement: HTMLCanvasElement }
  }) => unknown) => selector?.({
    camera: {
      position: { copy: () => undefined, lerp: () => undefined, distanceToSquared: () => 0 },
      lookAt: () => undefined,
      updateProjectionMatrix: () => undefined,
    },
    invalidate: () => undefined,
    gl: { domElement: document.createElement('canvas') },
  }),
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

function artworkExhibition(imageUrls: readonly string[]): GalleryExhibition {
  return {
    ...exhibition,
    items: imageUrls.map((imageUrl, index) => ({
      id: index + 11,
      position: index + 1,
      artwork: { id: index + 101, title: `Artwork ${index + 1}`, imageUrl },
    })),
  }
}

function textureGalleryElement(selectedExhibition: GalleryExhibition) {
  return (
    <ExhibitionGallery
      exhibition={selectedExhibition}
      headingLevel={1}
      fallback={<p>Standard exhibition content</p>}
      exitAction={<a href="/">Exit to exhibitions</a>}
    />
  )
}

function renderTextureGallery(imageUrls: readonly string[]) {
  return render(textureGalleryElement(artworkExhibition(imageUrls)))
}

function textureAttempt(artworkId: number, attempt: number) {
  return document.querySelector(`group[name="artwork-texture-${artworkId}-attempt-${attempt}"]`)
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
  canvasState.renderScene = false
  canvasState.rendererFactoryCalls = 0
  canvasState.cleanupCalls = 0
  canvasState.sessions.clear()
  textureState.failedUrls.clear()
  textureState.calls.clear()
  textureState.clearCalls.length = 0
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

describe('ExhibitionGallery texture recovery', () => {
  const firstUrl = '/api/artwork-images/cleveland/first/display'
  const secondUrl = '/api/artwork-images/cleveland/second/display'
  const thirdUrl = '/api/artwork-images/cleveland/third/display'
  const fourthUrl = '/api/artwork-images/cleveland/fourth/display'

  function enableTextureScene() {
    vi.spyOn(webgl, 'supportsWebGL').mockReturnValue(true)
    canvasState.renderScene = true
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
  }

  async function waitForUnavailableCount(count: number) {
    const copy = count === 1
      ? '1 artwork image is unavailable in the 3D gallery.'
      : `${count} artwork images are unavailable in the 3D gallery.`
    await waitFor(() => expect(screen.getByRole('region', { name: 'Unavailable artwork images' })).toHaveTextContent(copy))
  }

  it('keeps other slots and navigation usable when one texture fails', async () => {
    enableTextureScene()
    textureState.failedUrls.add(firstUrl)
    renderTextureGallery([firstUrl, secondUrl, thirdUrl, fourthUrl])

    await waitForUnavailableCount(1)
    markRendererReady()
    fireEvent.click(screen.getByRole('button', { name: 'Begin tour' }))

    expect(document.querySelectorAll('group[name^="artwork-slot-"]')).toHaveLength(4)
    expect(document.querySelectorAll('group[name="artwork-placeholder"]')).toHaveLength(1)
    expect(document.querySelector('group[name="textured-artwork-102"]')).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Artwork navigation' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Next artwork' })).toBeEnabled()
  })

  it('isolates multiple and all texture failures without degrading the renderer', async () => {
    enableTextureScene()
    textureState.failedUrls.add(firstUrl)
    textureState.failedUrls.add(secondUrl)
    const multipleView = renderTextureGallery([firstUrl, secondUrl, thirdUrl, fourthUrl])

    await waitForUnavailableCount(2)
    expect(screen.getByTestId('gallery-canvas')).toBeInTheDocument()
    expect(document.querySelectorAll('group[name="artwork-placeholder"]')).toHaveLength(2)
    multipleView.unmount()

    textureState.failedUrls.add(thirdUrl)
    textureState.failedUrls.add(fourthUrl)
    renderTextureGallery([firstUrl, secondUrl, thirdUrl, fourthUrl])

    await waitForUnavailableCount(4)
    markRendererReady()
    fireEvent.click(screen.getByRole('button', { name: 'Begin tour' }))
    expect(screen.getByRole('navigation', { name: 'Artwork navigation' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Next artwork' })).toBeEnabled()
    expect(screen.getByTestId('gallery-canvas')).toBeInTheDocument()
  })

  it('retries only failed URLs and remounts only their texture boundaries', async () => {
    enableTextureScene()
    textureState.failedUrls.add(firstUrl)
    renderTextureGallery([firstUrl, secondUrl])

    await waitForUnavailableCount(1)
    expect(textureAttempt(101, 0)).toBeInTheDocument()
    expect(textureAttempt(102, 0)).toBeInTheDocument()
    textureState.failedUrls.delete(firstUrl)

    fireEvent.click(screen.getByRole('button', { name: 'Retry unavailable images' }))

    await waitFor(() => expect(screen.queryByRole('region', { name: 'Unavailable artwork images' })).not.toBeInTheDocument())
    expect(textureState.clearCalls).toEqual([firstUrl])
    expect(document.querySelector('group[name="textured-artwork-101"]')).toBeInTheDocument()
    expect(textureAttempt(101, 1)).toBeInTheDocument()
    expect(textureAttempt(102, 0)).toBeInTheDocument()
    expect(textureAttempt(102, 1)).not.toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Gallery test' })).toHaveFocus()
  })

  it('keeps a repeated texture failure retryable and supports keyboard retry after the image recovers', async () => {
    enableTextureScene()
    textureState.failedUrls.add(firstUrl)
    renderTextureGallery([firstUrl, secondUrl])

    await waitForUnavailableCount(1)
    const retry = screen.getByRole('button', { name: 'Retry unavailable images' })
    retry.focus()
    await userEvent.keyboard('{Enter}')
    await waitForUnavailableCount(1)
    expect(textureState.clearCalls).toEqual([firstUrl])

    textureState.failedUrls.delete(firstUrl)
    fireEvent.click(screen.getByRole('button', { name: 'Retry unavailable images' }))
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Unavailable artwork images' })).not.toBeInTheDocument())
    expect(textureState.clearCalls).toEqual([firstUrl, firstUrl])
  })

  it('deduplicates cache invalidation for artwork records sharing one failed URL', async () => {
    enableTextureScene()
    textureState.failedUrls.add(firstUrl)
    renderTextureGallery([firstUrl, firstUrl, secondUrl])

    await waitForUnavailableCount(2)
    textureState.failedUrls.delete(firstUrl)
    fireEvent.click(screen.getByRole('button', { name: 'Retry unavailable images' }))

    await waitFor(() => expect(screen.queryByRole('region', { name: 'Unavailable artwork images' })).not.toBeInTheDocument())
    expect(textureState.clearCalls).toEqual([firstUrl])
    expect(document.querySelectorAll('group[name="textured-artwork-101"], group[name="textured-artwork-102"]')).toHaveLength(2)
    expect(textureAttempt(101, 1)).toBeInTheDocument()
    expect(textureAttempt(102, 1)).toBeInTheDocument()
    expect(textureAttempt(103, 0)).toBeInTheDocument()
    expect(textureAttempt(103, 1)).not.toBeInTheDocument()
  })

  it('creates fresh texture state when the same artwork receives a replacement image URL', async () => {
    enableTextureScene()
    textureState.failedUrls.add(firstUrl)
    const initialExhibition = artworkExhibition([firstUrl])
    const view = render(textureGalleryElement(initialExhibition))

    await waitForUnavailableCount(1)
    textureState.failedUrls.delete(firstUrl)
    const replacementExhibition = artworkExhibition([secondUrl])
    view.rerender(textureGalleryElement(replacementExhibition))

    await waitFor(() => expect(screen.queryByRole('region', { name: 'Unavailable artwork images' })).not.toBeInTheDocument())
    expect(document.querySelector('group[name="textured-artwork-101"]')).toBeInTheDocument()
    expect(textureAttempt(101, 0)).toBeInTheDocument()
    expect(textureState.clearCalls).toEqual([])
  })

  it('clears only the current URL when retrying after an image URL replacement', async () => {
    enableTextureScene()
    textureState.failedUrls.add(firstUrl)
    const view = render(textureGalleryElement(artworkExhibition([firstUrl])))
    await waitForUnavailableCount(1)

    textureState.failedUrls.delete(firstUrl)
    textureState.failedUrls.add(secondUrl)
    view.rerender(textureGalleryElement(artworkExhibition([secondUrl])))
    await waitForUnavailableCount(1)
    textureState.failedUrls.delete(secondUrl)
    fireEvent.click(screen.getByRole('button', { name: 'Retry unavailable images' }))

    await waitFor(() => expect(screen.queryByRole('region', { name: 'Unavailable artwork images' })).not.toBeInTheDocument())
    expect(textureState.clearCalls).toEqual([secondUrl])
    expect(textureAttempt(101, 1)).toBeInTheDocument()
  })

  it('ignores stale success and failure callbacks from older texture attempts', async () => {
    enableTextureScene()
    textureState.failedUrls.add(firstUrl)
    renderTextureGallery([firstUrl])
    const callbacks = canvasSession(0)
    await waitForUnavailableCount(1)

    fireEvent.click(screen.getByRole('button', { name: 'Retry unavailable images' }))
    await waitFor(() => expect(textureAttempt(101, 1)).toBeInTheDocument())
    act(() => callbacks.onTextureReady?.(101, firstUrl, 0))
    expect(screen.getByRole('region', { name: 'Unavailable artwork images' })).toBeInTheDocument()
    expect(textureAttempt(101, 1)).toBeInTheDocument()

    textureState.failedUrls.delete(firstUrl)
    fireEvent.click(screen.getByRole('button', { name: 'Retry unavailable images' }))
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Unavailable artwork images' })).not.toBeInTheDocument())
    expect(textureAttempt(101, 2)).toBeInTheDocument()
    act(() => callbacks.onTextureUnavailable?.(101, firstUrl, 1))
    expect(screen.queryByRole('region', { name: 'Unavailable artwork images' })).not.toBeInTheDocument()
    expect(textureAttempt(101, 2)).toBeInTheDocument()
  })

  it('discards unavailable state when an artwork is removed', async () => {
    enableTextureScene()
    textureState.failedUrls.add(secondUrl)
    const view = render(textureGalleryElement(artworkExhibition([firstUrl, secondUrl])))
    await waitForUnavailableCount(1)

    textureState.failedUrls.delete(secondUrl)
    view.rerender(textureGalleryElement(artworkExhibition([firstUrl])))

    await waitFor(() => expect(screen.queryByRole('region', { name: 'Unavailable artwork images' })).not.toBeInTheDocument())
    expect(textureAttempt(101, 0)).toBeInTheDocument()
    expect(document.querySelector('group[name="artwork-slot-102"]')).not.toBeInTheDocument()
    expect(textureState.clearCalls).toEqual([])
  })

  it('starts a fresh texture session when artwork positions are reordered', async () => {
    enableTextureScene()
    textureState.failedUrls.add(firstUrl)
    const initialExhibition = artworkExhibition([firstUrl, secondUrl])
    const view = render(textureGalleryElement(initialExhibition))
    await waitForUnavailableCount(1)

    textureState.failedUrls.delete(firstUrl)
    const reorderedExhibition = {
      ...initialExhibition,
      items: [
        { ...initialExhibition.items[0], position: 2 },
        { ...initialExhibition.items[1], position: 1 },
      ],
    }
    view.rerender(textureGalleryElement(reorderedExhibition))

    await waitFor(() => expect(screen.queryByRole('region', { name: 'Unavailable artwork images' })).not.toBeInTheDocument())
    expect(textureAttempt(101, 0)).toBeInTheDocument()
    expect(textureAttempt(102, 0)).toBeInTheDocument()
    expect(textureAttempt(101, 1)).not.toBeInTheDocument()
    expect(textureState.clearCalls).toEqual([])
  })

  it('uses the same unavailable-image action for public and curator gallery fallbacks', async () => {
    enableTextureScene()
    textureState.failedUrls.add(firstUrl)
    const publicView = renderTextureGallery([firstUrl])

    await waitForUnavailableCount(1)
    expect(screen.getByRole('button', { name: 'Retry unavailable images' })).toBeInTheDocument()
    publicView.unmount()

    render(
      <ExhibitionGallery
        exhibition={artworkExhibition([firstUrl])}
        headingLevel={2}
        fallback={<p>Curator standard preview</p>}
        exitAction={<a href="/edit">Return to exhibition editor</a>}
      />,
    )
    await waitForUnavailableCount(1)
    expect(screen.getByRole('button', { name: 'Retry unavailable images' })).toBeInTheDocument()
  })
})
