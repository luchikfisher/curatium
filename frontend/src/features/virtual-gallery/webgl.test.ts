import { describe, expect, it, vi } from 'vitest'
import { watchWebGLContextLoss } from './webgl'

describe('WebGL context cleanup', () => {
  it('removes the context-loss listener when a gallery route is cleaned up', () => {
    const canvas = document.createElement('canvas')
    const onContextLost = vi.fn()
    const stopWatching = watchWebGLContextLoss(canvas, onContextLost)

    canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }))
    expect(onContextLost).toHaveBeenCalledTimes(1)

    stopWatching()
    canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }))
    expect(onContextLost).toHaveBeenCalledTimes(1)
  })
})
