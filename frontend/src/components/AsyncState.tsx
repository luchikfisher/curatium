import { isFrontendError } from '../api/errors'

export function LoadingState({ label }: { label: string }) {
  return (
    <div className="state-panel" role="status" aria-live="polite">
      <span className="loading-mark" aria-hidden="true" />
      <p>{label}</p>
    </div>
  )
}

export function EmptyState({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="state-panel">
      <h2>{title}</h2>
      <p>{children}</p>
    </section>
  )
}

export function ErrorState({
  error,
  onRetry,
}: {
  error: Error
  onRetry: () => void
}) {
  const recoverable = isFrontendError(error)
  return (
    <section className="state-panel" role="alert">
      <p className="eyebrow">Something went wrong</p>
      <h2>{recoverable ? 'We could not load this collection' : 'An unexpected problem occurred'}</h2>
      <p>
        {recoverable
          ? error.message
          : 'Please try again. If the problem continues, refresh the page.'}
      </p>
      <button className="button button-secondary" type="button" onClick={onRetry}>
        Try again
      </button>
    </section>
  )
}
