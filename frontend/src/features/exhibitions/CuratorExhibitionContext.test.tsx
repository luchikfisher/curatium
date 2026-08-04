import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import {
  CuratorExhibitionContext,
  type CuratorWorkflowStep,
} from './CuratorExhibitionContext'

afterEach(cleanup)

describe('CuratorExhibitionContext', () => {
  it.each<{
    activeStep: CuratorWorkflowStep
    currentLabel: string
  }>([
    { activeStep: 'metadata', currentLabel: 'Metadata' },
    { activeStep: 'artworks', currentLabel: 'Artworks' },
    { activeStep: 'preview', currentLabel: 'Preview & publish' },
  ])('uses identical ordered workflow links with $currentLabel current', ({ activeStep, currentLabel }) => {
    render(
      <MemoryRouter>
        <CuratorExhibitionContext
          exhibition={{ id: 42, title: 'Authoritative exhibition', status: 'DRAFT' }}
          activeStep={activeStep}
        />
      </MemoryRouter>,
    )

    const navigation = screen.getByRole('navigation', { name: 'Exhibition workflow' })
    const links = within(navigation).getAllByRole('link')
    expect(links.map((link) => link.textContent)).toEqual([
      'Metadata',
      'Artworks',
      'Preview & publish',
      'All exhibitions',
    ])
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/exhibitions/42/edit',
      '/exhibitions/42/artworks',
      '/exhibitions/42/preview',
      '/exhibitions',
    ])
    expect(within(navigation).getByRole('link', { name: currentLabel })).toHaveAttribute('aria-current', 'page')
    expect(within(navigation).getAllByRole('link').filter((link) => link.hasAttribute('aria-current'))).toHaveLength(1)
  })

  it('shows authoritative identity as static Draft or Published context', () => {
    const view = render(
      <MemoryRouter>
        <CuratorExhibitionContext
          exhibition={{ id: 8, title: 'Committed title', status: 'DRAFT' }}
          activeStep="metadata"
        />
      </MemoryRouter>,
    )

    const context = screen.getByRole('region', { name: 'Current exhibition' })
    expect(within(context).getByText('Committed title')).not.toHaveAttribute('tabindex')
    expect(within(context).getByText('Draft')).toBeInTheDocument()

    view.rerender(
      <MemoryRouter>
        <CuratorExhibitionContext
          exhibition={{ id: 8, title: 'Published committed title', status: 'PUBLISHED' }}
          activeStep="preview"
        />
      </MemoryRouter>,
    )
    expect(within(context).getByText('Published committed title')).toBeInTheDocument()
    expect(within(context).getByText('Published')).not.toHaveAttribute('tabindex')
  })
})
