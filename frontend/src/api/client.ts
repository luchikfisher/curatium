import {
  FrontendError,
  type ApiErrorResponse,
  type ApiFieldError,
} from './errors'

type JsonParser<T> = (value: unknown) => T

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function parseFieldErrors(value: unknown): ApiFieldError[] | undefined {
  if (!Array.isArray(value)) return undefined
  const parsed: ApiFieldError[] = []
  for (const item of value) {
    if (
      !isRecord(item) ||
      typeof item.field !== 'string' ||
      typeof item.message !== 'string'
    ) {
      return undefined
    }
    parsed.push({ field: item.field, message: item.message })
  }
  return parsed
}

function parseApiError(value: unknown): ApiErrorResponse | undefined {
  if (
    !isRecord(value) ||
    typeof value.code !== 'string' ||
    typeof value.message !== 'string' ||
    typeof value.timestamp !== 'string'
  ) {
    return undefined
  }
  const fieldErrors = parseFieldErrors(value.fieldErrors)
  if (!fieldErrors) return undefined
  return {
    code: value.code,
    message: value.message,
    fieldErrors,
    timestamp: value.timestamp,
  }
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch (cause) {
    throw new FrontendError(
      'The server returned an unreadable response.',
      'malformed',
      response.status,
      undefined,
      [],
      undefined,
      { cause },
    )
  }
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
  parser?: JsonParser<T>,
): Promise<T | undefined> {
  let response: Response
  try {
    response = await fetch(path, {
      ...options,
      headers: {
        Accept: 'application/json',
        ...options.headers,
      },
    })
  } catch (cause) {
    throw new FrontendError(
      'Curatium could not reach the server. Check your connection and try again.',
      'network',
      undefined,
      undefined,
      [],
      undefined,
      { cause },
    )
  }

  if (!response.ok) {
    const body = await readJson(response)
    const apiError = parseApiError(body)
    if (!apiError) {
      throw new FrontendError(
        'The server returned an unexpected error response.',
        'malformed',
        response.status,
      )
    }
    throw new FrontendError(
      apiError.message,
      'api',
      response.status,
      apiError.code,
      apiError.fieldErrors,
      apiError.timestamp,
    )
  }

  if (response.status === 204) return undefined
  const body = await readJson(response)
  if (!parser) return body as T
  try {
    return parser(body)
  } catch (cause) {
    throw new FrontendError(
      'The server returned data Curatium could not understand.',
      'malformed',
      response.status,
      undefined,
      [],
      undefined,
      { cause },
    )
  }
}
