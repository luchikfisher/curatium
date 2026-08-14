import { useEffect, useRef, useState } from 'react'
import { ValidationSummary, type ValidationFeedback } from '../../components/ValidationSummary'
import type { ExhibitionMetadata } from './types'
import { metadataLimit, type MetadataFieldErrors, validateExhibitionMetadata } from './metadataValidation'

type MetadataField = keyof ExhibitionMetadata

export function ExhibitionMetadataForm({
  metadata,
  fieldErrors,
  submitting,
  readOnly = false,
  submitLabel,
  onChange,
  onSubmit,
  onClientValidationFailure,
}: {
  metadata: ExhibitionMetadata
  fieldErrors: MetadataFieldErrors
  submitting: boolean
  readOnly?: boolean
  submitLabel: string
  onChange: (field: MetadataField, value: string) => void
  onSubmit: () => void
  onClientValidationFailure: (errors: MetadataFieldErrors) => void
}) {
  const formRef = useRef<HTMLFormElement>(null)
  const validationAttempt = useRef(0)
  const focusedValidationAttempt = useRef(0)
  const [validationFeedback, setValidationFeedback] = useState<ValidationFeedback | null>(null)

  useEffect(() => {
    if (
      !validationFeedback
      || focusedValidationAttempt.current === validationFeedback.attempt
    ) {
      return
    }
    const invalidControl = formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')
    if (!invalidControl) return
    focusedValidationAttempt.current = validationFeedback.attempt
    invalidControl.focus({ preventScroll: true })
  }, [fieldErrors, validationFeedback])

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const errors = validateExhibitionMetadata(metadata)
    if (Object.keys(errors).length > 0) {
      onClientValidationFailure(errors)
      validationAttempt.current += 1
      setValidationFeedback({
        attempt: validationAttempt.current,
        message: Object.keys(errors).length === 1
          ? 'Exhibition metadata was not submitted. Correct the highlighted field.'
          : `Exhibition metadata was not submitted. Correct the ${Object.keys(errors).length} highlighted fields.`,
      })
      return
    }
    setValidationFeedback(null)
    onSubmit()
  }

  function change(field: MetadataField, value: string) {
    setValidationFeedback(null)
    onChange(field, value)
  }

  return (
    <form ref={formRef} className="exhibition-form" onSubmit={submit} noValidate>
      <ValidationSummary feedback={validationFeedback} />
      <FormField
        field="title"
        label="Title"
        value={metadata.title}
        error={fieldErrors.title}
        disabled={readOnly || submitting}
        required
        maxLength={metadataLimit('title')}
        onChange={change}
      />
      <FormField
        field="summary"
        label="Summary"
        value={metadata.summary}
        error={fieldErrors.summary}
        disabled={readOnly || submitting}
        maxLength={metadataLimit('summary')}
        onChange={change}
      />
      <FormField
        field="introduction"
        label="Introduction"
        value={metadata.introduction}
        error={fieldErrors.introduction}
        disabled={readOnly || submitting}
        maxLength={metadataLimit('introduction')}
        multiline
        onChange={change}
      />
      {!readOnly && (
        <button className="button" type="submit" disabled={submitting}>
          {submitting ? 'Saving…' : submitLabel}
        </button>
      )}
    </form>
  )
}

function FormField({
  field,
  label,
  value,
  error,
  disabled,
  required = false,
  maxLength,
  multiline = false,
  onChange,
}: {
  field: MetadataField
  label: string
  value: string
  error?: string
  disabled: boolean
  required?: boolean
  maxLength: number
  multiline?: boolean
  onChange: (field: MetadataField, value: string) => void
}) {
  const errorId = `${field}-error`
  const control = {
    id: field,
    name: field,
    value,
    disabled,
    maxLength,
    'aria-invalid': Boolean(error),
    'aria-describedby': error ? errorId : undefined,
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      onChange(field, event.target.value),
  }

  return (
    <div className="form-field">
      <label htmlFor={field}>
        {label}
        {required && <span aria-hidden="true"> *</span>}
      </label>
      {multiline ? <textarea rows={8} {...control} /> : <input type="text" required={required} {...control} />}
      {error && <p className="field-error" id={errorId}>{error}</p>}
    </div>
  )
}
