import { isFrontendError, type FrontendError } from '../../api/errors'
import type { MetadataFieldErrors } from './metadataValidation'

export function applyMetadataRequestError(
  reason: unknown,
  setFieldErrors: (errors: MetadataFieldErrors) => void,
  setError: (error: FrontendError | Error) => void,
) {
  const error = reason instanceof Error ? reason : new Error('Unknown error')
  if (isFrontendError(error) && error.fieldErrors.length > 0) {
    const fields: MetadataFieldErrors = {}
    for (const fieldError of error.fieldErrors) {
      if (fieldError.field === 'title' || fieldError.field === 'summary' || fieldError.field === 'introduction') {
        fields[fieldError.field] = fieldError.message
      }
    }
    setFieldErrors(fields)
  }
  setError(error)
}
