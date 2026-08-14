import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { RouteOrientationProvider } from '../features/route-orientation/RouteOrientationProvider'

export function AppLayout() {
  const { pathname } = useLocation()
  const visiting = pathname === '/' || pathname.startsWith('/visit/')

  return (
    <RouteOrientationProvider>
      <div className="app-shell">
        <a className="skip-link" href="#main-content">
          Skip to content
        </a>
        <header className="site-header">
          <NavLink className="wordmark" to="/" aria-label="Curatium home">
            Curatium
          </NavLink>
          <nav aria-label="Primary navigation">
            <Link
              to="/"
              aria-current={visiting ? 'page' : undefined}
              className={visiting ? 'active' : undefined}
            >
              Visit
            </Link>
            <NavLink to="/exhibitions">Curate</NavLink>
          </nav>
        </header>
        <main id="main-content" tabIndex={-1}>
          <Outlet />
        </main>
        <footer className="site-footer">
          <p>A quiet place to curate and encounter art.</p>
        </footer>
      </div>
    </RouteOrientationProvider>
  )
}
