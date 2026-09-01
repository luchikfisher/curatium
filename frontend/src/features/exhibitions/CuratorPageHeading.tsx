import { useRef } from 'react'
import { useRouteFocusTarget } from '../route-orientation/useRouteFocusTarget'

export function CuratorPageHeading({
  title,
  step,
  description,
  focusTarget = true,
}: {
  title: string
  step: string
  description?: string | null
  focusTarget?: boolean
}) {
  const headingRef = useRef<HTMLHeadingElement>(null)
  useRouteFocusTarget(headingRef, focusTarget)

  return (
    <div className="page-heading editor-heading curator-page-heading">
      <p className="eyebrow">{step}</p>
      <h1 ref={headingRef}>{title}</h1>
      {description && <p className="lede">{description}</p>}
    </div>
  )
}
