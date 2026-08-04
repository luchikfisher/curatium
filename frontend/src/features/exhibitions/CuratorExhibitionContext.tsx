import { Link } from 'react-router-dom'
import type { ExhibitionStatus } from './types'

export type CuratorWorkflowStep = 'metadata' | 'artworks' | 'preview'

interface CuratorExhibitionContextProps {
  exhibition: {
    id: number
    title: string
    status: ExhibitionStatus
  }
  activeStep: CuratorWorkflowStep
}

const workflowSteps: Array<{
  id: CuratorWorkflowStep
  label: string
  path: (exhibitionId: number) => string
}> = [
  { id: 'metadata', label: 'Metadata', path: (exhibitionId) => `/exhibitions/${exhibitionId}/edit` },
  { id: 'artworks', label: 'Artworks', path: (exhibitionId) => `/exhibitions/${exhibitionId}/artworks` },
  { id: 'preview', label: 'Preview & publish', path: (exhibitionId) => `/exhibitions/${exhibitionId}/preview` },
]

export function CuratorExhibitionContext({
  exhibition,
  activeStep,
}: CuratorExhibitionContextProps) {
  return (
    <section className="curator-context" aria-label="Current exhibition">
      <div className="curator-context__identity">
        <p className="curator-context__title">{exhibition.title}</p>
        <span className={`status status--${exhibition.status.toLowerCase()}`}>
          {exhibition.status === 'PUBLISHED' ? 'Published' : 'Draft'}
        </span>
      </div>
      <nav className="curator-context__navigation" aria-label="Exhibition workflow">
        {workflowSteps.map((step) => (
          <Link
            key={step.id}
            className="curator-context__link"
            to={step.path(exhibition.id)}
            aria-current={activeStep === step.id ? 'page' : undefined}
          >
            {step.label}
          </Link>
        ))}
        <Link className="curator-context__link curator-context__link--all" to="/exhibitions">
          All exhibitions
        </Link>
      </nav>
    </section>
  )
}

export function CuratorNextStep({
  message,
  to,
  label,
}: {
  message: string
  to: string
  label: string
}) {
  return (
    <div className="curator-next-step">
      <p role="status">{message}</p>
      <Link className="text-link" to={to}>{label}</Link>
    </div>
  )
}
