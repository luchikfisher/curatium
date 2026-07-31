import { Component, Suspense, type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Text, useTexture } from '@react-three/drei'
import { DoubleSide, SRGBColorSpace, type Texture, Vector3 } from 'three'
import { ENTRY_CAMERA_POSITION, ENTRY_CAMERA_TARGET } from './geometry'
import { assignArtworkSlots, fitArtwork } from './slots'
import type { GalleryArtwork, GalleryExhibition, GalleryViewpoint, SlottedArtwork } from './types'
import { supportsWebGL, watchWebGLContextLoss } from './webgl'
import { GalleryNavigation } from './GalleryNavigation'
import { gallerySessionKey } from './session'
import { cameraTransitionFactor, viewpointForSlot } from './viewpoints'

export function ExhibitionGallery({
  exhibition,
  fallback,
  headingLevel = 2,
}: {
  exhibition: GalleryExhibition
  fallback: ReactNode
  headingLevel?: 1 | 2
}) {
  return <GalleryInstance key={gallerySessionKey(exhibition)} exhibition={exhibition} fallback={fallback} headingLevel={headingLevel} />
}

function GalleryInstance({
  exhibition,
  fallback,
  headingLevel = 2,
}: {
  exhibition: GalleryExhibition
  fallback: ReactNode
  headingLevel?: 1 | 2
}) {
  const [showStandardGallery, setShowStandardGallery] = useState(() => !supportsWebGL())
  const assignments = useMemo(() => assignArtworkSlots(exhibition.items), [exhibition.items])
  const [selectedIndex, setSelectedIndex] = useState(() => assignments.length > 0 ? 0 : -1)
  const currentSelectedIndex = selectedIndex >= 0 && selectedIndex < assignments.length
    ? selectedIndex
    : assignments.length > 0 ? 0 : -1
  const viewpoint = viewpointForSlot(currentSelectedIndex)
  const reducedMotion = useReducedMotion()

  if (showStandardGallery) return <>{fallback}</>

  const Heading = headingLevel === 1 ? 'h1' : 'h2'
  return (
    <section className="virtual-gallery" aria-labelledby={`virtual-gallery-${exhibition.id}`}>
      <div className="virtual-gallery__header">
        <p className="eyebrow">Virtual gallery</p>
        <Heading id={`virtual-gallery-${exhibition.id}`}>{exhibition.title}</Heading>
        <p>Explore the exhibition in its curated order.</p>
        <button className="text-link" type="button" onClick={() => setShowStandardGallery(true)}>
          View as standard gallery
        </button>
      </div>
      <GalleryErrorBoundary resetKey={exhibition.id} fallback={fallback}>
        <Canvas
          className="virtual-gallery__canvas"
          camera={{ fov: 52, position: ENTRY_CAMERA_POSITION }}
          dpr={[1, 1.5]}
          frameloop="demand"
        >
          <GalleryScene
            assignments={assignments}
            viewpoint={viewpoint}
            reducedMotion={reducedMotion}
            onContextLost={() => setShowStandardGallery(true)}
          />
        </Canvas>
      </GalleryErrorBoundary>
      <GalleryNavigation assignments={assignments} selectedIndex={currentSelectedIndex} onSelect={setSelectedIndex} />
    </section>
  )
}

export class GalleryErrorBoundary extends Component<{
  children: ReactNode
  fallback: ReactNode
  resetKey: number
}, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidUpdate(previousProps: Readonly<{ resetKey: number }>) {
    if (previousProps.resetKey !== this.props.resetKey && this.state.failed) {
      this.setState({ failed: false })
    }
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

function GalleryScene({
  assignments,
  viewpoint,
  reducedMotion,
  onContextLost,
}: {
  assignments: readonly SlottedArtwork[]
  viewpoint: GalleryViewpoint | null
  reducedMotion: boolean
  onContextLost: () => void
}) {
  return (
    <>
      <color attach="background" args={['#e7e4dc']} />
      <ambientLight intensity={1.65} />
      <directionalLight position={[2, 5.5, 3]} intensity={1.75} />
      <CameraDirector viewpoint={viewpoint} reducedMotion={reducedMotion} />
      <ContextLossWatcher onContextLost={onContextLost} />
      <GalleryRoom />
      {assignments.map((assignment) => <GalleryArtworkSlot key={assignment.item.id} assignment={assignment} />)}
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

function GalleryArtworkSlot({ assignment }: { assignment: SlottedArtwork }) {
  return (
    <group position={assignment.slot.position} rotation={assignment.slot.rotation}>
      <TextureErrorBoundary fallback={<ArtworkPlaceholder artwork={assignment.item.artwork} />}>
        <Suspense fallback={<ArtworkPlaceholder artwork={assignment.item.artwork} />}>
          <TexturedArtwork artwork={assignment.item.artwork} />
        </Suspense>
      </TextureErrorBoundary>
    </group>
  )
}

function TexturedArtwork({ artwork }: { artwork: GalleryArtwork }) {
  const texture = useTexture(artwork.imageUrl)
  const displayTexture = useMemo(() => {
    const clonedTexture = texture.clone()
    clonedTexture.colorSpace = SRGBColorSpace
    clonedTexture.needsUpdate = true
    return clonedTexture
  }, [texture])
  useEffect(() => () => displayTexture.dispose(), [displayTexture])
  const { width, height } = fitArtwork(aspectFor(texture))
  return (
    <group>
      <mesh position={[0, 0, -0.025]}><planeGeometry args={[width + 0.13, height + 0.13]} /><meshStandardMaterial color="#393630" /></mesh>
      <mesh><planeGeometry args={[width, height]} /><meshBasicMaterial map={displayTexture} toneMapped={false} /></mesh>
    </group>
  )
}

function ArtworkPlaceholder({ artwork }: { artwork: GalleryArtwork }) {
  const { width, height } = fitArtwork(1)
  return (
    <group>
      <mesh position={[0, 0, -0.025]}><planeGeometry args={[width + 0.13, height + 0.13]} /><meshStandardMaterial color="#393630" /></mesh>
      <mesh><planeGeometry args={[width, height]} /><meshStandardMaterial color="#b9b4a9" /></mesh>
      <Text position={[0, 0, 0.01]} maxWidth={width - 0.35} fontSize={0.22} color="#3d3932" textAlign="center" anchorX="center" anchorY="middle">
        {artwork.title}
      </Text>
    </group>
  )
}

function aspectFor(texture: Texture): number {
  const image = texture.image as { width?: number; height?: number }
  return image.width && image.height ? image.width / image.height : 1
}

class TextureErrorBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}
