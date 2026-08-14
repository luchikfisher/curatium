import { lazy, Suspense, type ReactNode, type Ref, useCallback, useEffect, useLayoutEffect, useRef } from 'react'
import { useRouteFocusTarget } from '../route-orientation/useRouteFocusTarget'
import type { GalleryExhibition } from './types'

const ExhibitionGallery = lazy(async () => {
  const module = await import('./ExhibitionGallery')
  return { default: module.ExhibitionGallery }
})

export function LazyExhibitionGallery({
  exhibition,
  fallback,
  rendererLoadingFallback,
  headingLevel,
  exitAction,
}: {
  exhibition: GalleryExhibition
  fallback: ReactNode
  rendererLoadingFallback?: ReactNode
  headingLevel?: 1 | 2
  exitAction: ReactNode
}) {
  const galleryShellRef = useRef<HTMLDivElement>(null)
  const lazyFallbackRef = useRef<HTMLDivElement>(null)
  const lazyFallbackHadFocusRef = useRef(false)
  useRouteFocusTarget(galleryShellRef)

  useEffect(() => {
    const trackFocusedArea = () => {
      const fallback = lazyFallbackRef.current
      if (fallback) lazyFallbackHadFocusRef.current = fallback.contains(document.activeElement)
    }
    document.addEventListener('focusin', trackFocusedArea)
    return () => document.removeEventListener('focusin', trackFocusedArea)
  }, [])

  const handleLazyGalleryResolved = useCallback(() => {
    if (lazyFallbackHadFocusRef.current && document.activeElement === document.body) {
      galleryShellRef.current?.focus()
    }
    lazyFallbackHadFocusRef.current = false
  }, [])

  return (
    <div ref={galleryShellRef} className="gallery-experience-shell" role="region" aria-label="Exhibition gallery experience" tabIndex={-1}>
      <Suspense fallback={(
        <GalleryChunkLoading
          ref={lazyFallbackRef}
          exhibitionId={exhibition.id}
          fallback={fallback}
          exitAction={exitAction}
        />
      )}>
        <ResolvedExhibitionGallery
          exhibition={exhibition}
          fallback={fallback}
          rendererLoadingFallback={rendererLoadingFallback}
          headingLevel={headingLevel}
          exitAction={exitAction}
          onResolved={handleLazyGalleryResolved}
        />
      </Suspense>
    </div>
  )
}

export function GalleryChunkLoading({
  exhibitionId,
  fallback,
  exitAction,
  ref,
}: {
  exhibitionId: number
  fallback: ReactNode
  exitAction: ReactNode
  ref?: Ref<HTMLDivElement>
}) {
  const headingId = `gallery-chunk-loading-${exhibitionId}`
  return (
    <div ref={ref} className="gallery-chunk-loading">
      <section className="gallery-chunk-loading__status" aria-labelledby={headingId}>
        <p className="eyebrow">Virtual gallery</p>
        <h2 id={headingId}>Preparing the 3D gallery</h2>
        <p role="status" aria-live="polite" aria-atomic="true">
          Loading the 3D gallery… The standard gallery remains available while it loads.
        </p>
        <div className="virtual-gallery__actions">{exitAction}</div>
      </section>
      <div className="gallery-loading-standard" role="region" aria-label="Standard gallery available while the 3D gallery loads">
        {fallback}
      </div>
    </div>
  )
}

function ResolvedExhibitionGallery({
  exhibition,
  fallback,
  rendererLoadingFallback,
  headingLevel,
  exitAction,
  onResolved,
}: {
  exhibition: GalleryExhibition
  fallback: ReactNode
  rendererLoadingFallback?: ReactNode
  headingLevel?: 1 | 2
  exitAction: ReactNode
  onResolved: () => void
}) {
  useLayoutEffect(onResolved, [onResolved])
  return <ExhibitionGallery exhibition={exhibition} fallback={fallback} rendererLoadingFallback={rendererLoadingFallback} headingLevel={headingLevel} exitAction={exitAction} />
}
