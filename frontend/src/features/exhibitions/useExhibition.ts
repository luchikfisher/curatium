import { useCallback, useEffect, useState } from 'react'
import type { FrontendError } from '../../api/errors'
import type { ExhibitionDetail } from './types'

interface ExhibitionQuery {
  data: ExhibitionDetail | null
  error: FrontendError | Error | null
  retry: () => void
}

export function useExhibition(
  exhibitionId: number | null,
  load: (exhibitionId: number, signal: AbortSignal) => Promise<ExhibitionDetail>,
): ExhibitionQuery {
  const [data, setData] = useState<ExhibitionDetail | null>(null)
  const [error, setError] = useState<FrontendError | Error | null>(null)
  const [attempt, setAttempt] = useState(0)

  const retry = useCallback(() => {
    setData(null)
    setError(null)
    setAttempt((value) => value + 1)
  }, [])

  useEffect(() => {
    if (exhibitionId === null) return
    const controller = new AbortController()
    load(exhibitionId, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setData(result)
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted && !isAbortError(reason)) {
          setError(reason instanceof Error ? reason : new Error('Unknown error'))
        }
      })
    return () => controller.abort()
  }, [attempt, exhibitionId, load])

  return { data, error, retry }
}

function isAbortError(reason: unknown): boolean {
  return reason instanceof DOMException && reason.name === 'AbortError'
}
