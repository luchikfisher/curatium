export function supportsWebGL(): boolean {
  if (typeof window === 'undefined' || typeof document === 'undefined') return false
  if (!window.WebGLRenderingContext && !window.WebGL2RenderingContext) return false
  try {
    const canvas = document.createElement('canvas')
    return Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl'))
  } catch {
    return false
  }
}

export function watchWebGLContextLoss(canvas: HTMLCanvasElement, onContextLost: () => void) {
  const handleContextLost = (event: Event) => {
    event.preventDefault()
    onContextLost()
  }
  canvas.addEventListener('webglcontextlost', handleContextLost)
  return () => canvas.removeEventListener('webglcontextlost', handleContextLost)
}
