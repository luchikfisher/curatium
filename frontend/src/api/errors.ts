export interface ApiFieldError {
  field: string
  message: string
}

export interface ApiErrorResponse {
  code: string
  message: string
  fieldErrors: ApiFieldError[]
  timestamp: string
}

export type FrontendErrorKind = 'api' | 'network' | 'malformed'

export class FrontendError extends Error {
  readonly kind: FrontendErrorKind
  readonly status?: number
  readonly code?: string
  readonly fieldErrors: ApiFieldError[]
  readonly timestamp?: string

  constructor(
    message: string,
    kind: FrontendErrorKind,
    status?: number,
    code?: string,
    fieldErrors: ApiFieldError[] = [],
    timestamp?: string,
    options?: ErrorOptions,
  ) {
    super(message, options)
    this.name = 'FrontendError'
    this.kind = kind
    this.status = status
    this.code = code
    this.fieldErrors = fieldErrors
    this.timestamp = timestamp
  }
}

export function isFrontendError(error: unknown): error is FrontendError {
  return error instanceof FrontendError
}
