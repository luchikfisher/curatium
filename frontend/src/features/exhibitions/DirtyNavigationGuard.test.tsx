import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import {
  createMemoryRouter,
  Link,
  RouterProvider,
  useLocation,
  useNavigate,
} from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import { DirtyNavigationConfirmation } from './DirtyNavigationGuard'
import { useDirtyNavigation } from './useDirtyNavigation'

function GuardedEditor() {
  const [draft, setDraft] = useState('')
  const navigation = useDirtyNavigation(draft !== '')
  const navigate = useNavigate()
  return (
    <main id="main-content" tabIndex={-1}>
      <h1>Guarded editor</h1>
      <label htmlFor="guard-draft">Draft</label>
      <input id="guard-draft" value={draft} onChange={(event) => setDraft(event.target.value)} />
      <Link to="/next">Leave editor</Link>
      <button
        type="button"
        onClick={() => {
          navigation.allowNextNavigation('/next')
          navigate('/after')
        }}
      >
        Attempt differently approved navigation
      </button>
      <DirtyNavigationConfirmation navigation={navigation} />
    </main>
  )
}

function Destination({ name }: { name: string }) {
  const location = useLocation()
  return (
    <main id="main-content" tabIndex={-1}>
      <h1>{name}</h1>
      <p>{location.pathname}</p>
    </main>
  )
}

function renderGuarded(initialEntries = ['/edit'], initialIndex = initialEntries.length - 1) {
  const router = createMemoryRouter([
    { path: '/before', element: <Destination name="Before" /> },
    { path: '/edit', element: <GuardedEditor /> },
    { path: '/next', element: <Destination name="Next" /> },
    { path: '/after', element: <Destination name="After" /> },
  ], { initialEntries, initialIndex })
  return { router, ...render(<RouterProvider router={router} />) }
}

afterEach(cleanup)

describe('dirty navigation guard', () => {
  it('allows clean link navigation immediately', async () => {
    renderGuarded()

    await userEvent.click(screen.getByRole('link', { name: 'Leave editor' }))

    expect(await screen.findByRole('heading', { name: 'Next' })).toBeInTheDocument()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('blocks a dirty link, focuses the confirmation, and Stay restores exact draft and focus', async () => {
    renderGuarded()
    const draft = screen.getByLabelText('Draft')
    await userEvent.type(draft, '  Exact unsaved text  ')
    const leave = screen.getByRole('link', { name: 'Leave editor' })

    await userEvent.click(leave)

    expect(screen.getByRole('alertdialog', { name: 'Discard unsaved changes?' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Stay' })).toHaveFocus()
    await userEvent.click(screen.getByRole('button', { name: 'Stay' }))
    await waitFor(() => expect(leave).toHaveFocus())
    expect(draft).toHaveValue('  Exact unsaved text  ')
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('discards once, completes the blocked destination, and keeps meaningful focus', async () => {
    const { router } = renderGuarded()
    await userEvent.type(screen.getByLabelText('Draft'), 'Unsaved')
    await userEvent.click(screen.getByRole('link', { name: 'Leave editor' }))

    await userEvent.click(screen.getByRole('button', { name: 'Discard changes' }))

    expect(await screen.findByRole('heading', { name: 'Next' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/next')
    await waitFor(() => expect(screen.getByRole('main')).toHaveFocus())
  })

  it('retains the first blocked destination when a later navigation is attempted', async () => {
    const { router } = renderGuarded()
    await userEvent.type(screen.getByLabelText('Draft'), 'Unsaved')

    const firstNavigation = router.navigate('/next')
    expect(await screen.findByRole('alertdialog')).toBeInTheDocument()
    const laterNavigation = router.navigate('/after')

    expect(screen.getByRole('alertdialog', { name: 'Discard unsaved changes?' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Discard changes' }))

    await firstNavigation
    await laterNavigation
    expect(await screen.findByRole('heading', { name: 'Next' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/next')
    await waitFor(() => expect(screen.getByRole('main')).toHaveFocus())
  })

  it('does not let an approved navigation bypass a different destination', async () => {
    renderGuarded()
    await userEvent.type(screen.getByLabelText('Draft'), 'Unsaved')

    await userEvent.click(screen.getByRole('button', { name: 'Attempt differently approved navigation' }))

    expect(screen.getByRole('alertdialog', { name: 'Discard unsaved changes?' })).toBeInTheDocument()
  })

  it('blocks Back and Forward through router-managed history', async () => {
    const { router } = renderGuarded(['/before', '/edit', '/after'], 1)
    await userEvent.type(screen.getByLabelText('Draft'), 'Unsaved')

    const backNavigation = router.navigate(-1)
    expect(await screen.findByRole('alertdialog')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Stay' }))
    await backNavigation
    expect(router.state.location.pathname).toBe('/edit')

    const forwardNavigation = router.navigate(1)
    expect(await screen.findByRole('alertdialog')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Discard changes' }))
    await forwardNavigation
    expect(await screen.findByRole('heading', { name: 'After' })).toBeInTheDocument()
  })

  it('uses a conditional beforeunload listener and removes it when clean and unmounted', async () => {
    const rendered = renderGuarded()
    const cleanEvent = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(cleanEvent)
    expect(cleanEvent.defaultPrevented).toBe(false)

    const draft = screen.getByLabelText('Draft')
    await userEvent.type(draft, 'Unsaved')
    const dirtyEvent = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(dirtyEvent)
    expect(dirtyEvent.defaultPrevented).toBe(true)

    await userEvent.clear(draft)
    const cleanedEvent = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(cleanedEvent)
    expect(cleanedEvent.defaultPrevented).toBe(false)

    await userEvent.type(draft, 'Unsaved again')
    rendered.unmount()
    const unmountedEvent = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(unmountedEvent)
    expect(unmountedEvent.defaultPrevented).toBe(false)
  })

  it('keeps keyboard focus inside the confirmation and Escape performs Stay', async () => {
    renderGuarded()
    await userEvent.type(screen.getByLabelText('Draft'), 'Unsaved')
    const leave = screen.getByRole('link', { name: 'Leave editor' })
    await userEvent.click(leave)

    await userEvent.tab({ shift: true })
    expect(screen.getByRole('button', { name: 'Discard changes' })).toHaveFocus()
    await userEvent.tab()
    expect(screen.getByRole('button', { name: 'Stay' })).toHaveFocus()
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(leave).toHaveFocus())
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })
})
