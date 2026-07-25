import { Link, useParams } from 'react-router-dom'

interface PlaceholderPageProps {
  eyebrow: string
  title: string
  description: string
  backTo: string
}

export function PlaceholderPage({
  eyebrow,
  title,
  description,
  backTo,
}: PlaceholderPageProps) {
  const { id } = useParams()
  return (
    <section className="page-heading placeholder-page">
      <p className="eyebrow">{eyebrow}</p>
      <h1>{title}</h1>
      {id && <p className="route-context">Exhibition {id}</p>}
      <p className="lede">{description}</p>
      <Link className="button button-secondary" to={backTo}>
        Go back
      </Link>
    </section>
  )
}
