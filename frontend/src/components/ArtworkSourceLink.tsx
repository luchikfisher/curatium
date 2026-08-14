export function ArtworkSourceLink({
  href,
  descriptor,
  className = 'text-link',
}: {
  href: string
  descriptor: string
  className?: string
}) {
  return (
    <a
      className={className}
      href={href}
      target="_blank"
      rel="noreferrer"
      aria-label={`View source for ${descriptor} (opens in a new tab)`}
    >
      View artwork source
    </a>
  )
}
