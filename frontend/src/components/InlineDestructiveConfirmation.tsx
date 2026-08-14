import { useEffect, useId, useRef } from 'react'

export function InlineDestructiveConfirmation({
  className,
  name,
  description,
  confirmLabel,
  pendingLabel,
  cancelLabel,
  confirmAccessibleName,
  cancelAccessibleName,
  pending,
  onConfirm,
  onCancel,
}: {
  className: string
  name: string
  description: string
  confirmLabel: string
  pendingLabel: string
  cancelLabel: string
  confirmAccessibleName?: string
  cancelAccessibleName?: string
  pending: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  const descriptionId = useId()
  const confirmButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    confirmButtonRef.current?.focus({ preventScroll: true })
  }, [])

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'Escape' || pending) return
    event.preventDefault()
    event.stopPropagation()
    onCancel()
  }

  return (
    <div
      className={className}
      role="dialog"
      aria-modal="false"
      aria-label={name}
      aria-describedby={descriptionId}
      aria-busy={pending || undefined}
      onKeyDown={handleKeyDown}
    >
      <p id={descriptionId}>{description}</p>
      <button
        ref={confirmButtonRef}
        className="button button-danger"
        type="button"
        disabled={pending}
        aria-label={confirmAccessibleName}
        onClick={onConfirm}
      >
        {pending ? pendingLabel : confirmLabel}
      </button>
      <button
        className="button button-secondary"
        type="button"
        disabled={pending}
        aria-label={cancelAccessibleName}
        onClick={onCancel}
      >
        {cancelLabel}
      </button>
    </div>
  )
}
