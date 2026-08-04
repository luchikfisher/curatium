export interface CuratorVisitState {
  curatorExhibitionId: number
  curatorReturnTo: string
}

export function createCuratorVisitState(exhibitionId: number): CuratorVisitState {
  return {
    curatorExhibitionId: exhibitionId,
    curatorReturnTo: `/exhibitions/${exhibitionId}/preview`,
  }
}

export function curatorReturnTarget(state: unknown, exhibitionId: number): string | null {
  if (typeof state !== 'object' || state === null) return null
  if (!('curatorExhibitionId' in state) || !('curatorReturnTo' in state)) return null
  const expectedTarget = `/exhibitions/${exhibitionId}/preview`
  return state.curatorExhibitionId === exhibitionId && state.curatorReturnTo === expectedTarget
    ? expectedTarget
    : null
}
