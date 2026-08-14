export interface ValidationFeedback {
  attempt: number
  message: string
}

export function ValidationSummary({ feedback }: { feedback: ValidationFeedback | null }) {
  if (!feedback) return null

  return (
    <p
      key={feedback.attempt}
      className="form-alert"
      role="alert"
      aria-atomic="true"
    >
      {feedback.message}
    </p>
  )
}
