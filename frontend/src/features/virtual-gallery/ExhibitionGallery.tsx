import { Component, Suspense, type ReactNode, useEffect, useMemo, useState } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { Text, useTexture } from '@react-three/drei'
import { DoubleSide, SRGBColorSpace, type Texture } from 'three'
import { ENTRY_CAMERA_POSITION, ENTRY_CAMERA_TARGET } from './geometry'
import { assignArtworkSlots, fitArtwork } from './slots'
import type { GalleryArtwork, GalleryExhibition, SlottedArtwork } from './types'
import { supportsWebGL, watchWebGLContextLoss } from './webgl'

export function ExhibitionGallery({
  exhibition,
  fallback,
  headingLevel = 2,
}: {
  exhibition: GalleryExhibition
  fallback: ReactNode
  headingLevel?: 1 | 2
}) {
  return <GalleryInstance key={exhibition.id} exhibition={exhibition} fallback={fallback} headingLevel={headingLevel} />
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
          <GalleryScene exhibition={exhibition} onContextLost={() => setShowStandardGallery(true)} />
        </Canvas>
      </GalleryErrorBoundary>
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

function GalleryScene({ exhibition, onContextLost }: { exhibition: GalleryExhibition; onContextLost: () => void }) {
  const slottedArtworks = assignArtworkSlots(exhibition.items)
  return (
    <>
      <color attach="background" args={['#e7e4dc']} />
      <ambientLight intensity={1.65} />
      <directionalLight position={[2, 5.5, 3]} intensity={1.75} />
      <EntryCamera />
      <ContextLossWatcher onContextLost={onContextLost} />
      <GalleryRoom />
      {slottedArtworks.map((assignment) => <GalleryArtworkSlot key={assignment.item.id} assignment={assignment} />)}
    </>
  )
}

function EntryCamera() {
  const camera = useThree((state) => state.camera)
  useEffect(() => {
    camera.lookAt(...ENTRY_CAMERA_TARGET)
    camera.updateProjectionMatrix()
  }, [camera])
  return null
}

function ContextLossWatcher({ onContextLost }: { onContextLost: () => void }) {
  const canvas = useThree((state) => state.gl.domElement)
  useEffect(() => watchWebGLContextLoss(canvas, onContextLost), [canvas, onContextLost])
  return null
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
