import { lazy, Suspense, type ReactNode } from 'react'
import type { GalleryExhibition } from './types'

const ExhibitionGallery = lazy(async () => {
  const module = await import('./ExhibitionGallery')
  return { default: module.ExhibitionGallery }
})

export function LazyExhibitionGallery({
  exhibition,
  fallback,
  headingLevel,
  exitAction,
}: {
  exhibition: GalleryExhibition
  fallback: ReactNode
  headingLevel?: 1 | 2
  exitAction: ReactNode
}) {
  return (
    <Suspense fallback={fallback}>
      <ExhibitionGallery exhibition={exhibition} fallback={fallback} headingLevel={headingLevel} exitAction={exitAction} />
    </Suspense>
  )
}
