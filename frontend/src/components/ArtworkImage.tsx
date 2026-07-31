import { useState } from 'react'

type ArtworkImageProps = {
  src: string | null | undefined
  alt?: string
  decorative?: boolean
  className?: string
  loading?: 'eager' | 'lazy'
}

export function ArtworkImage({
  src,
  alt = 'Artwork image',
  decorative = false,
  className,
  loading = 'eager',
}: ArtworkImageProps) {
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null)
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  const [retryKey, setRetryKey] = useState(0)
  const hasSource = Boolean(src)
  const failed = hasSource && failedSrc === src
  const unavailable = !hasSource || failed
  const loaded = hasSource && loadedSrc === src && !unavailable
  const placeholderLabel = `Artwork image unavailable: ${alt}`
  const state = unavailable ? 'failed' : loaded ? 'loaded' : 'loading'
  const classes = ['artwork-image', `artwork-image--${state}`, className].filter(Boolean).join(' ')

  const retry = () => {
    setLoadedSrc(null)
    setFailedSrc(null)
    setRetryKey((current) => current + 1)
  }

  return (
    <span
      className={classes}
      data-state={state}
      aria-hidden={decorative || undefined}
      role={!decorative && unavailable ? 'group' : undefined}
      aria-label={!decorative && unavailable ? placeholderLabel : undefined}
    >
      {!unavailable && src && (
        <img
          key={`${src}-${retryKey}`}
          src={src}
          alt={decorative ? '' : alt}
          loading={loading}
          onLoad={() => setLoadedSrc(src)}
          onError={() => setFailedSrc(src)}
        />
      )}
      {!loaded && (
        <span className="artwork-image__placeholder" aria-hidden={failed && !decorative ? undefined : true}>
          <span className="artwork-image__placeholder-content" aria-hidden="true">
            <span className="artwork-image__placeholder-mark" />
            <span>{unavailable ? 'Artwork image unavailable' : 'Loading artwork image'}</span>
          </span>
          {failed && !decorative && (
            <button className="artwork-image__retry" type="button" onClick={retry} aria-label={`Retry image: ${alt}`}>
              Retry image
            </button>
          )}
        </span>
      )}
    </span>
  )
}
