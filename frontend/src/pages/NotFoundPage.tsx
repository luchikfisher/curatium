import { Link } from 'react-router-dom'

export function NotFoundPage() {
  return (
    <section className="page-heading placeholder-page">
      <p className="eyebrow">404</p>
      <h1>Page not found</h1>
      <p className="lede">
        The page may have moved, or the address may be incorrect.
      </p>
      <Link className="button button-secondary" to="/">
        Return to the catalogue
      </Link>
    </section>
  )
}
