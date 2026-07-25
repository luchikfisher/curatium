import { NavLink, Outlet } from 'react-router-dom'

export function AppLayout() {
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <header className="site-header">
        <NavLink className="wordmark" to="/" aria-label="Curatium home">
          Curatium
        </NavLink>
        <nav aria-label="Primary navigation">
          <NavLink to="/" end>
            Visit
          </NavLink>
          <NavLink to="/exhibitions">Curate</NavLink>
        </nav>
      </header>
      <main id="main-content">
        <Outlet />
      </main>
      <footer className="site-footer">
        <p>A quiet place to curate and encounter art.</p>
      </footer>
    </div>
  )
}
