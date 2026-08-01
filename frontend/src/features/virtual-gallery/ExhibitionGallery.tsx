import { Component, Suspense, type ReactNode, type Ref, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useTexture } from '@react-three/drei'
import { DoubleSide, SRGBColorSpace, type Texture, Vector3, WebGLRenderer } from 'three'
import { ENTRY_CAMERA_POSITION, ENTRY_CAMERA_TARGET } from './geometry'
import { assignArtworkSlots, fitArtwork } from './slots'
import type { GalleryArtwork, GalleryExhibition, GalleryViewpoint, SlottedArtwork } from './types'
import { supportsWebGL, watchWebGLContextLoss } from './webgl'
import { GalleryInformationOverlay } from './GalleryInformationOverlay'
import { GalleryNavigation } from './GalleryNavigation'
import { gallerySessionKey } from './session'
import { cameraTransitionFactor, viewpointForSlot } from './viewpoints'

export type GalleryMode = 'virtual' | 'standard'

export type GalleryDegradationReason =
  | 'webgl-unavailable'
  | 'renderer-initialization-failed'
  | 'context-lost'
  | 'scene-error'

export type GalleryPhase =
  | { kind: 'loading'; attempt: number }
  | { kind: 'ready'; attempt: number }
  | { kind: 'retrying'; attempt: number }
  | { kind: 'degraded'; attempt: number; reason: GalleryDegradationReason }

type GalleryFocusTarget = 'recovery' | 'standard' | 'virtual'

export type ArtworkTextureStatus = 'loading' | 'ready' | 'unavailable'

type ArtworkTextureState = {
  status: ArtworkTextureStatus
  url: string
  attempt: number
}

function initialTextureStates(assignments: readonly SlottedArtwork[]): Record<number, ArtworkTextureState> {
  return Object.fromEntries(assignments.map(({ item }) => [item.artwork.id, {
    status: 'loading',
    url: item.artwork.imageUrl,
    attempt: 0,
  }]))
}

export function ExhibitionGallery({
  exhibition,
  fallback,
  headingLevel = 2,
  exitAction,
}: {
  exhibition: GalleryExhibition
  fallback: ReactNode
  headingLevel?: 1 | 2
  exitAction: ReactNode
}) {
  const sessionKey = gallerySessionKey(exhibition)
  return (
    <GalleryInstance
      key={sessionKey}
      sessionKey={sessionKey}
      exhibition={exhibition}
      fallback={fallback}
      headingLevel={headingLevel}
      exitAction={exitAction}
    />
  )
}

function GalleryInstance({
  sessionKey,
  exhibition,
  fallback,
  headingLevel = 2,
  exitAction,
}: {
  sessionKey: string
  exhibition: GalleryExhibition
  fallback: ReactNode
  headingLevel?: 1 | 2
  exitAction: ReactNode
}) {
  const [initialWebGLSupport] = useState(() => supportsWebGL())
  const [mode, setMode] = useState<GalleryMode>(() => initialWebGLSupport ? 'virtual' : 'standard')
  const [rendererAttempt, setRendererAttempt] = useState(0)
  const [phase, setPhase] = useState<GalleryPhase>(() => initialWebGLSupport
    ? { kind: 'loading', attempt: 0 }
    : { kind: 'degraded', attempt: 0, reason: 'webgl-unavailable' })
  const assignments = useMemo(() => assignArtworkSlots(exhibition.items), [exhibition.items])
  const [textureStates, setTextureStates] = useState<Record<number, ArtworkTextureState>>(() => initialTextureStates(assignments))
  const [textureRetryVersion, setTextureRetryVersion] = useState(0)
  const [tourStarted, setTourStarted] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const [informationOpen, setInformationOpen] = useState(false)
  const informationButtonRef = useRef<HTMLButtonElement>(null)
  const restoreInformationFocus = useRef(false)
  const activeAttemptRef = useRef(rendererAttempt)
  const virtualSessionActiveRef = useRef(initialWebGLSupport)
  const degradationReasonRef = useRef<GalleryDegradationReason | null>(
    initialWebGLSupport ? null : 'webgl-unavailable',
  )
  const requestedFocusRef = useRef<GalleryFocusTarget | null>(null)
  const recoveryRef = useRef<HTMLElement>(null)
  const standardModeRef = useRef<HTMLElement>(null)
  const standardContentRef = useRef<HTMLDivElement>(null)
  const virtualGalleryRef = useRef<HTMLElement>(null)
  const currentSelectedIndex = !tourStarted
    ? -1
    : selectedIndex >= 0 && selectedIndex < assignments.length
      ? selectedIndex
      : assignments.length > 0 ? 0 : -1
  const currentAssignment = assignments[currentSelectedIndex] ?? null
  const viewpoint = viewpointForSlot(currentSelectedIndex)
  const reducedMotion = useReducedMotion()
  const unavailableTextureStates = useMemo(
    () => Object.values(textureStates).filter((texture) => texture.status === 'unavailable'),
    [textureStates],
  )
  const unavailableTextureUrls = useMemo(
    () => [...new Set(unavailableTextureStates.map((texture) => texture.url))],
    [unavailableTextureStates],
  )

  useEffect(() => {
    if (!informationOpen && restoreInformationFocus.current) {
      informationButtonRef.current?.focus()
      restoreInformationFocus.current = false
    }
  }, [informationOpen])

  useEffect(() => {
    const requestedTarget = requestedFocusRef.current
    let movedFocus = false
    if (requestedTarget === 'recovery' && phase.kind === 'degraded') {
      recoveryRef.current?.focus()
      movedFocus = true
    }
    if (requestedTarget === 'standard' && mode === 'standard' && phase.kind !== 'degraded') {
      standardModeRef.current?.focus()
      movedFocus = true
    }
    if (requestedTarget === 'virtual' && mode === 'virtual') {
      virtualGalleryRef.current?.focus()
      movedFocus = true
    }
    if (movedFocus) requestedFocusRef.current = null
  }, [mode, phase, textureRetryVersion])

  const closeInformation = () => {
    restoreInformationFocus.current = true
    setInformationOpen(false)
  }

  const beginTour = () => {
    if (assignments.length === 0) return
    setSelectedIndex(0)
    setTourStarted(true)
  }

  const enterDegraded = useCallback((attempt: number, reason: GalleryDegradationReason, moveFocus: boolean) => {
    if (!virtualSessionActiveRef.current || attempt !== activeAttemptRef.current || degradationReasonRef.current !== null) return
    virtualSessionActiveRef.current = false
    degradationReasonRef.current = reason
    if (moveFocus) requestedFocusRef.current = 'recovery'
    setInformationOpen(false)
    setMode('standard')
    setPhase({ kind: 'degraded', attempt, reason })
  }, [])

  const markRendererReady = useCallback((attempt: number) => {
    if (!virtualSessionActiveRef.current || attempt !== activeAttemptRef.current) return
    setPhase((current) => {
      if (current.attempt !== attempt || (current.kind !== 'loading' && current.kind !== 'retrying')) return current
      return { kind: 'ready', attempt }
    })
  }, [])

  const retryThreeDimensionalGallery = useCallback(() => {
    if (!supportsWebGL()) {
      virtualSessionActiveRef.current = false
      degradationReasonRef.current = 'webgl-unavailable'
      requestedFocusRef.current = 'recovery'
      setMode('standard')
      setPhase((current) => ({ kind: 'degraded', attempt: current.attempt, reason: 'webgl-unavailable' }))
      return
    }

    const nextAttempt = activeAttemptRef.current + 1
    activeAttemptRef.current = nextAttempt
    virtualSessionActiveRef.current = true
    degradationReasonRef.current = null
    requestedFocusRef.current = 'virtual'
    setTourStarted(false)
    setSelectedIndex(-1)
    setInformationOpen(false)
    setRendererAttempt(nextAttempt)
    setPhase({ kind: 'retrying', attempt: nextAttempt })
    setMode('virtual')
  }, [])

  const showStandardGallery = useCallback(() => {
    virtualSessionActiveRef.current = false
    requestedFocusRef.current = 'standard'
    setMode('standard')
  }, [])

  const continueInStandardGallery = useCallback(() => {
    standardContentRef.current?.focus()
  }, [])

  const reportTextureReady = useCallback((artworkId: number, url: string, attempt: number) => {
    setTextureStates((current) => {
      const texture = current[artworkId]
      if (!texture || texture.url !== url || texture.attempt !== attempt || texture.status === 'ready') return current
      return { ...current, [artworkId]: { ...texture, status: 'ready' } }
    })
  }, [])

  const reportTextureUnavailable = useCallback((artworkId: number, url: string, attempt: number) => {
    setTextureStates((current) => {
      const texture = current[artworkId]
      if (!texture || texture.url !== url || texture.attempt !== attempt || texture.status === 'unavailable') return current
      return { ...current, [artworkId]: { ...texture, status: 'unavailable' } }
    })
  }, [])

  const retryUnavailableTextures = useCallback(() => {
    if (unavailableTextureUrls.length === 0) return
    unavailableTextureUrls.forEach((url) => useTexture.clear(url))
    requestedFocusRef.current = 'virtual'
    setTextureStates((current) => {
      let changed = false
      const next = { ...current }
      for (const [artworkId, texture] of Object.entries(current)) {
        if (texture.status !== 'unavailable') continue
        changed = true
        next[Number(artworkId)] = { ...texture, status: 'loading', attempt: texture.attempt + 1 }
      }
      return changed ? next : current
    })
    setTextureRetryVersion((version) => version + 1)
  }, [unavailableTextureUrls])

  if (mode === 'standard') {
    return (
      <>
        {phase.kind === 'degraded' ? (
          <GalleryRecoveryPanel
            ref={recoveryRef}
            reason={phase.reason}
            onRetry={retryThreeDimensionalGallery}
            onContinue={continueInStandardGallery}
          />
        ) : (
          <GalleryStandardModePanel ref={standardModeRef} onRetry={retryThreeDimensionalGallery} />
        )}
        <div ref={standardContentRef} tabIndex={-1} aria-label="Standard gallery content">
          {fallback}
        </div>
      </>
    )
  }

  const Heading = headingLevel === 1 ? 'h1' : 'h2'
  return (
    <GalleryErrorBoundary
      resetKey={`${sessionKey}:${rendererAttempt}`}
      onError={() => enterDegraded(rendererAttempt, 'scene-error', true)}
    >
      <section ref={virtualGalleryRef} className="virtual-gallery" tabIndex={-1} aria-labelledby={`virtual-gallery-${exhibition.id}`}>
        <div className="virtual-gallery__header">
          <p className="eyebrow">Virtual gallery</p>
          <Heading id={`virtual-gallery-${exhibition.id}`}>{exhibition.title}</Heading>
          <p>{tourStarted ? 'Explore the exhibition in its curated order.' : 'Begin with the curator’s introduction, then visit each artwork in order.'}</p>
          <div className="virtual-gallery__actions">
            <button className="text-link" type="button" onClick={showStandardGallery}>
              View as standard gallery
            </button>
            {exitAction}
          </div>
        </div>
        <div className="virtual-gallery__experience">
          <GalleryCanvasSession
            attempt={rendererAttempt}
            assignments={assignments}
            textureStates={textureStates}
            viewpoint={viewpoint}
            reducedMotion={reducedMotion}
            onRendererReady={markRendererReady}
            onDegraded={enterDegraded}
            onTextureReady={reportTextureReady}
            onTextureUnavailable={reportTextureUnavailable}
          />
          {phase.kind !== 'ready' && <GalleryLoadingState retrying={phase.kind === 'retrying'} />}
          {unavailableTextureStates.length > 0 && (
            <GalleryTextureRecovery
              unavailableCount={unavailableTextureStates.length}
              onRetry={retryUnavailableTextures}
            />
          )}
          {!tourStarted && phase.kind === 'ready' && (
            <GalleryIntroduction
              exhibition={exhibition}
              artworkCount={assignments.length}
              onBegin={beginTour}
            />
          )}
          {phase.kind === 'ready' && informationOpen && currentAssignment && (
            <GalleryInformationOverlay
              assignment={currentAssignment}
              itemIndex={currentSelectedIndex}
              itemCount={assignments.length}
              onClose={closeInformation}
            />
          )}
        </div>
        {phase.kind === 'ready' && tourStarted && (
          <GalleryNavigation
            assignments={assignments}
            selectedIndex={currentSelectedIndex}
            onSelect={setSelectedIndex}
            onOpenInformation={() => setInformationOpen(true)}
            informationOpen={informationOpen}
            informationButtonRef={informationButtonRef}
          />
        )}
      </section>
    </GalleryErrorBoundary>
  )
}

function GalleryCanvasSession({
  attempt,
  assignments,
  textureStates,
  viewpoint,
  reducedMotion,
  onRendererReady,
  onDegraded,
  onTextureReady,
  onTextureUnavailable,
}: {
  attempt: number
  assignments: readonly SlottedArtwork[]
  textureStates: Readonly<Record<number, ArtworkTextureState>>
  viewpoint: GalleryViewpoint | null
  reducedMotion: boolean
  onRendererReady: (attempt: number) => void
  onDegraded: (attempt: number, reason: GalleryDegradationReason, moveFocus: boolean) => void
  onTextureReady: (artworkId: number, url: string, attempt: number) => void
  onTextureUnavailable: (artworkId: number, url: string, attempt: number) => void
}) {
  const failedRendererAttemptRef = useRef<number | null>(null)

  return (
    <Canvas
      key={attempt}
      data-gallery-attempt={attempt}
      className="virtual-gallery__canvas"
      camera={{ fov: 52, position: ENTRY_CAMERA_POSITION }}
      dpr={[1, 1.5]}
      frameloop="demand"
      gl={(defaultProps) => {
        try {
          return new WebGLRenderer(defaultProps)
        } catch {
          failedRendererAttemptRef.current = attempt
          return createFailedRenderer(defaultProps.canvas)
        }
      }}
      onCreated={() => {
        if (failedRendererAttemptRef.current === attempt) {
          onDegraded(attempt, 'renderer-initialization-failed', true)
          return
        }
        onRendererReady(attempt)
      }}
    >
      <GalleryScene
        assignments={assignments}
        textureStates={textureStates}
        viewpoint={viewpoint}
        reducedMotion={reducedMotion}
        onContextLost={() => onDegraded(attempt, 'context-lost', true)}
        onTextureReady={onTextureReady}
        onTextureUnavailable={onTextureUnavailable}
      />
    </Canvas>
  )
}

function GalleryLoadingState({ retrying }: { retrying: boolean }) {
  return (
    <div className="gallery-loading-state" role="status" aria-live="polite">
      {retrying ? 'Trying the 3D gallery again…' : 'Preparing the 3D gallery…'}
    </div>
  )
}

function GalleryTextureRecovery({
  unavailableCount,
  onRetry,
}: {
  unavailableCount: number
  onRetry: () => void
}) {
  const countCopy = unavailableCount === 1
    ? '1 artwork image is unavailable in the 3D gallery.'
    : `${unavailableCount} artwork images are unavailable in the 3D gallery.`

  return (
    <section className="gallery-texture-recovery" aria-label="Unavailable artwork images">
      <p role="status" aria-live="polite" aria-atomic="true">{countCopy}</p>
      <button className="button button-secondary" type="button" onClick={onRetry}>
        Retry unavailable images
      </button>
    </section>
  )
}

const degradationCopy: Record<GalleryDegradationReason, string> = {
  'webgl-unavailable': '3D gallery is unavailable in this browser.',
  'renderer-initialization-failed': 'The 3D gallery could not start.',
  'context-lost': 'The 3D gallery stopped responding.',
  'scene-error': 'We could not render the 3D gallery.',
}

const GalleryRecoveryPanel = ({
  reason,
  onRetry,
  onContinue,
  ref,
}: {
  reason: GalleryDegradationReason
  onRetry: () => void
  onContinue: () => void
  ref: Ref<HTMLElement>
}) => (
  <section ref={ref} className="gallery-recovery" tabIndex={-1} aria-labelledby="gallery-recovery-heading">
    <p className="eyebrow">3D gallery</p>
    <h2 id="gallery-recovery-heading">Showing the standard gallery</h2>
    <p aria-live="polite">{degradationCopy[reason]}</p>
    <div className="gallery-recovery__actions">
      <button className="button" type="button" onClick={onRetry}>Try 3D again</button>
      <button className="button button-secondary" type="button" onClick={onContinue}>Continue in standard view</button>
    </div>
  </section>
)

function createFailedRenderer(canvas: unknown): WebGLRenderer {
  return {
    domElement: canvas as HTMLCanvasElement,
    dispose: () => undefined,
    forceContextLoss: () => undefined,
    render: () => undefined,
    setPixelRatio: () => undefined,
    setSize: () => undefined,
  } as unknown as WebGLRenderer
}

const GalleryStandardModePanel = ({ onRetry, ref }: { onRetry: () => void; ref: Ref<HTMLElement> }) => {
  return (
    <section ref={ref} className="gallery-recovery gallery-recovery--standard" tabIndex={-1} aria-labelledby="gallery-standard-heading">
      <p className="eyebrow">Standard gallery</p>
      <h2 id="gallery-standard-heading">Viewing the standard gallery</h2>
      <p>You can return to the 3D gallery at any time.</p>
      <div className="gallery-recovery__actions">
        <button className="button button-secondary" type="button" onClick={onRetry}>Try 3D again</button>
      </div>
    </section>
  )
}

function GalleryIntroduction({
  exhibition,
  artworkCount,
  onBegin,
}: {
  exhibition: GalleryExhibition
  artworkCount: number
  onBegin: () => void
}) {
  return (
    <section className="gallery-introduction" aria-labelledby={`gallery-introduction-${exhibition.id}`}>
      <p className="gallery-information__position">Exhibition introduction</p>
      <h2 id={`gallery-introduction-${exhibition.id}`}>About this exhibition</h2>
      {exhibition.summary
        ? <p className="gallery-introduction__summary">{exhibition.summary}</p>
        : <p className="gallery-information__empty-copy">No summary has been provided.</p>}
      {exhibition.introduction
        ? <p>{exhibition.introduction}</p>
        : <p className="gallery-information__empty-copy">No introduction has been provided.</p>}
      <button className="button" type="button" disabled={artworkCount === 0} onClick={onBegin}>
        Begin tour
      </button>
      {artworkCount === 0 && <p className="gallery-information__empty-copy">No artworks are available to tour.</p>}
    </section>
  )
}

export class GalleryErrorBoundary extends Component<{
  children: ReactNode
  resetKey: string | number
  fallback?: ReactNode
  onError?: (error: Error) => void
}, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidUpdate(previousProps: Readonly<{ resetKey: string | number }>) {
    if (previousProps.resetKey !== this.props.resetKey && this.state.failed) {
      this.setState({ failed: false })
    }
  }

  componentDidCatch(error: Error) {
    this.props.onError?.(error)
  }

  render() {
    return this.state.failed ? this.props.fallback ?? null : this.props.children
  }
}

function GalleryScene({
  assignments,
  textureStates,
  viewpoint,
  reducedMotion,
  onContextLost,
  onTextureReady,
  onTextureUnavailable,
}: {
  assignments: readonly SlottedArtwork[]
  textureStates: Readonly<Record<number, ArtworkTextureState>>
  viewpoint: GalleryViewpoint | null
  reducedMotion: boolean
  onContextLost: () => void
  onTextureReady: (artworkId: number, url: string, attempt: number) => void
  onTextureUnavailable: (artworkId: number, url: string, attempt: number) => void
}) {
  return (
    <>
      <color attach="background" args={['#e7e4dc']} />
      <ambientLight intensity={1.65} />
      <directionalLight position={[2, 5.5, 3]} intensity={1.75} />
      <CameraDirector viewpoint={viewpoint} reducedMotion={reducedMotion} />
      <ContextLossWatcher onContextLost={onContextLost} />
      <GalleryRoom />
      {assignments.map((assignment) => {
        const textureState = textureStates[assignment.item.artwork.id] ?? {
          status: 'loading' as const,
          url: assignment.item.artwork.imageUrl,
          attempt: 0,
        }
        return (
          <GalleryArtworkSlot
            key={assignment.item.id}
            assignment={assignment}
            textureState={textureState}
            onTextureReady={onTextureReady}
            onTextureUnavailable={onTextureUnavailable}
          />
        )
      })}
    </>
  )
}

function CameraDirector({ viewpoint, reducedMotion }: { viewpoint: GalleryViewpoint | null; reducedMotion: boolean }) {
  const camera = useThree((state) => state.camera)
  const invalidate = useThree((state) => state.invalidate)
  const currentTarget = useRef(new Vector3(...ENTRY_CAMERA_TARGET))
  const desiredPosition = useRef(new Vector3(...ENTRY_CAMERA_POSITION))
  const desiredTarget = useRef(new Vector3(...ENTRY_CAMERA_TARGET))

  useEffect(() => {
    desiredPosition.current.set(...(viewpoint?.position ?? ENTRY_CAMERA_POSITION))
    desiredTarget.current.set(...(viewpoint?.target ?? ENTRY_CAMERA_TARGET))
    if (reducedMotion) {
      camera.position.copy(desiredPosition.current)
      currentTarget.current.copy(desiredTarget.current)
      camera.lookAt(currentTarget.current)
      camera.updateProjectionMatrix()
    }
    invalidate()
  }, [camera, invalidate, reducedMotion, viewpoint])

  useFrame((_state, delta) => {
    const factor = cameraTransitionFactor(reducedMotion, delta)
    camera.position.lerp(desiredPosition.current, factor)
    currentTarget.current.lerp(desiredTarget.current, factor)
    camera.lookAt(currentTarget.current)
    if (!reducedMotion && (
      camera.position.distanceToSquared(desiredPosition.current) > 0.0001 ||
      currentTarget.current.distanceToSquared(desiredTarget.current) > 0.0001
    )) {
      invalidate()
    }
  })
  return null
}

function ContextLossWatcher({ onContextLost }: { onContextLost: () => void }) {
  const canvas = useThree((state) => state.gl.domElement)
  useEffect(() => watchWebGLContextLoss(canvas, onContextLost), [canvas, onContextLost])
  return null
}

function useReducedMotion() {
  const [reducedMotion, setReducedMotion] = useState(() => prefersReducedMotion())
  useEffect(() => {
    const query = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    if (!query) return
    const updatePreference = () => setReducedMotion(query.matches)
    query.addEventListener('change', updatePreference)
    return () => query.removeEventListener('change', updatePreference)
  }, [])
  return reducedMotion
}

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
}

function GalleryRoom() {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[14, 18]} /><meshStandardMaterial color="#d7d3ca" /></mesh>
      <mesh position={[0, 6, 0]} rotation={[Math.PI / 2, 0, 0]}><planeGeometry args={[14, 18]} /><meshStandardMaterial color="#f4f2ec" side={DoubleSide} /></mesh>
      <mesh position={[0, 3, -9]}><planeGeometry args={[14, 6]} /><meshStandardMaterial color="#f1efe9" side={DoubleSide} /></mesh>
      <mesh position={[0, 3, 9]} rotation={[0, Math.PI, 0]}><planeGeometry args={[14, 6]} /><meshStandardMaterial color="#f1efe9" side={DoubleSide} /></mesh>
      <mesh position={[-7, 3, 0]} rotation={[0, Math.PI / 2, 0]}><planeGeometry args={[18, 6]} /><meshStandardMaterial color="#ece9e1" side={DoubleSide} /></mesh>
      <mesh position={[7, 3, 0]} rotation={[0, -Math.PI / 2, 0]}><planeGeometry args={[18, 6]} /><meshStandardMaterial color="#ece9e1" side={DoubleSide} /></mesh>
    </group>
  )
}

function GalleryArtworkSlot({
  assignment,
  textureState,
  onTextureReady,
  onTextureUnavailable,
}: {
  assignment: SlottedArtwork
  textureState: ArtworkTextureState
  onTextureReady: (artworkId: number, url: string, attempt: number) => void
  onTextureUnavailable: (artworkId: number, url: string, attempt: number) => void
}) {
  const artwork = assignment.item.artwork
  const reportReady = useCallback(
    () => onTextureReady(artwork.id, artwork.imageUrl, textureState.attempt),
    [artwork.id, artwork.imageUrl, onTextureReady, textureState.attempt],
  )
  const reportUnavailable = useCallback(
    () => onTextureUnavailable(artwork.id, artwork.imageUrl, textureState.attempt),
    [artwork.id, artwork.imageUrl, onTextureUnavailable, textureState.attempt],
  )

  return (
    <group name={`artwork-slot-${artwork.id}`} position={assignment.slot.position} rotation={assignment.slot.rotation}>
      <group
        key={`${artwork.id}:${textureState.attempt}`}
        name={`artwork-texture-${artwork.id}-attempt-${textureState.attempt}`}
      >
        <TextureErrorBoundary
          fallback={<ArtworkPlaceholder />}
          onError={reportUnavailable}
        >
          <Suspense fallback={<ArtworkPlaceholder />}>
            <TexturedArtwork artwork={artwork} onReady={reportReady} />
          </Suspense>
        </TextureErrorBoundary>
      </group>
    </group>
  )
}

function TexturedArtwork({ artwork, onReady }: { artwork: GalleryArtwork; onReady: () => void }) {
  const texture = useTexture(artwork.imageUrl)
  const displayTexture = useMemo(() => {
    const clonedTexture = texture.clone()
    clonedTexture.colorSpace = SRGBColorSpace
    clonedTexture.needsUpdate = true
    return clonedTexture
  }, [texture])
  useEffect(() => () => displayTexture.dispose(), [displayTexture])
  useEffect(() => {
    onReady()
  }, [onReady])
  const { width, height } = fitArtwork(aspectFor(texture))
  return (
    <group name={`textured-artwork-${artwork.id}`}>
      <mesh position={[0, 0, -0.025]}><planeGeometry args={[width + 0.13, height + 0.13]} /><meshStandardMaterial color="#393630" /></mesh>
      <mesh><planeGeometry args={[width, height]} /><meshBasicMaterial map={displayTexture} toneMapped={false} /></mesh>
    </group>
  )
}

function ArtworkPlaceholder() {
  const { width, height } = fitArtwork(1)
  return (
    <group name="artwork-placeholder">
      <mesh position={[0, 0, -0.025]}><planeGeometry args={[width + 0.13, height + 0.13]} /><meshStandardMaterial color="#393630" /></mesh>
      <mesh><planeGeometry args={[width, height]} /><meshStandardMaterial color="#b9b4a9" /></mesh>
      <mesh position={[0, 0, 0.01]}><planeGeometry args={[width * 0.46, 0.08]} /><meshStandardMaterial color="#8c867a" /></mesh>
    </group>
  )
}

function aspectFor(texture: Texture): number {
  const image = texture.image as { width?: number; height?: number }
  return image.width && image.height ? image.width / image.height : 1
}

class TextureErrorBoundary extends Component<{
  children: ReactNode
  fallback: ReactNode
  onError: () => void
}, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch() {
    this.props.onError()
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}
