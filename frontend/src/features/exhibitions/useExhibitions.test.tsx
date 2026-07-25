import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ExhibitionSummary } from './types'
import { useExhibitions } from './useExhibitions'

const latestExhibition: ExhibitionSummary = {
  id: 2,
  title: 'Latest exhibition',
  summary: null,
  status: 'PUBLISHED',
  coverImageUrl: null,
  artworkCount: 1,
  updatedAt: '2026-07-18T12:00:00Z',
}

function Probe({ load }: { load: (signal: AbortSignal) => Promise<ExhibitionSummary[]> }) {
  const { data, error, retry } = useExhibitions(load)
  return (
    <>
      <button type="button" onClick={retry}>Retry</button>
      {error && <p role="alert">{error.message}</p>}
      {data?.map((exhibition) => <p key={exhibition.id}>{exhibition.title}</p>)}
    </>
  )
}

describe('useExhibitions', () => {
  it('aborts the superseded request and commits only the latest result', async () => {
    let firstSignal: AbortSignal | undefined
    const load = vi.fn((signal: AbortSignal) => {
      if (!firstSignal) {
        firstSignal = signal
        return new Promise<ExhibitionSummary[]>((_, reject) => {
          signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
        })
      }
      return Promise.resolve([latestExhibition])
    })
    render(<Probe load={load} />)

    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))

    expect(firstSignal?.aborted).toBe(true)
    expect(await screen.findByText('Latest exhibition')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2))
  })
})
