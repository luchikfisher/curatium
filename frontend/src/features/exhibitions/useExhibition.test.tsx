import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useExhibition } from './useExhibition'
import type { ExhibitionDetail } from './types'

const detail: ExhibitionDetail = {
  id: 2,
  title: 'Latest exhibition',
  summary: null,
  introduction: null,
  status: 'DRAFT',
  publishedAt: null,
  coverArtworkId: null,
  items: [],
  createdAt: '2026-07-18T12:00:00Z',
  updatedAt: '2026-07-18T12:00:00Z',
}

function Probe({ exhibitionId, load }: {
  exhibitionId: number
  load: (id: number, signal: AbortSignal) => Promise<ExhibitionDetail>
}) {
  const { data } = useExhibition(exhibitionId, load)
  return data && <p>{data.title}</p>
}

describe('useExhibition', () => {
  it('aborts a stale detail request and commits the current exhibition only', async () => {
    let firstSignal: AbortSignal | undefined
    const load = vi.fn((id: number, signal: AbortSignal) => {
      if (id === 1) {
        firstSignal = signal
        return new Promise<ExhibitionDetail>((_, reject) => {
          signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
        })
      }
      return Promise.resolve(detail)
    })
    const { rerender } = render(<Probe exhibitionId={1} load={load} />)

    rerender(<Probe exhibitionId={2} load={load} />)

    expect(firstSignal?.aborted).toBe(true)
    expect(await screen.findByText('Latest exhibition')).toBeInTheDocument()
    expect(load).toHaveBeenCalledTimes(2)
  })
})
