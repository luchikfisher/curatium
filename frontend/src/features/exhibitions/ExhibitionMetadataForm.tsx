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
  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const errors = validateExhibitionMetadata(metadata)
    if (Object.keys(errors).length > 0) {
      onClientValidationFailure(errors)
      return
    }
    onSubmit()
  }

  return (
    <form className="exhibition-form" onSubmit={submit} noValidate>
      <FormField
        field="title"
        label="Title"
        value={metadata.title}
        error={fieldErrors.title}
        disabled={readOnly || submitting}
        required
        maxLength={metadataLimit('title')}
        onChange={onChange}
      />
      <FormField
        field="summary"
        label="Summary"
        value={metadata.summary}
        error={fieldErrors.summary}
        disabled={readOnly || submitting}
        maxLength={metadataLimit('summary')}
        onChange={onChange}
      />
      <FormField
        field="introduction"
        label="Introduction"
        value={metadata.introduction}
        error={fieldErrors.introduction}
        disabled={readOnly || submitting}
        maxLength={metadataLimit('introduction')}
        multiline
        onChange={onChange}
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
