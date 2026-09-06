import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { MemoryRouter } from 'react-router'
import i18n from '@/i18n'
import { BottomNav } from './BottomNav'

beforeEach(async () => {
  await i18n.changeLanguage('en')
})

function renderNav() {
  return render(
    <MemoryRouter>
      <BottomNav />
    </MemoryRouter>,
  )
}

describe('BottomNav', () => {
  it('shows the fixed 5-item nav (Home/Fleet/Pile/Sample Handling/Report), with no extra items', () => {
    renderNav()
    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(5)
  })

  it('labels the Piles route "Pile" and the Samples route "Sample Handling" (Phase 18 §13)', () => {
    renderNav()
    expect(screen.getByRole('link', { name: 'Pile' })).toHaveAttribute('href', '/piles')
    expect(screen.getByRole('link', { name: 'Sample Handling' })).toHaveAttribute('href', '/samples')
  })

  it('no longer has a "More" nav item — its useful actions moved to Home/the Fleet page', () => {
    renderNav()
    expect(screen.queryByRole('link', { name: 'More' })).not.toBeInTheDocument()
  })

  it('does not add a separate "Sample Input" item — /samples remains the only sample-related route', () => {
    renderNav()
    expect(screen.queryByRole('link', { name: /Sample Input/ })).not.toBeInTheDocument()
    expect(screen.getAllByRole('link').map((link) => link.getAttribute('href'))).toEqual([
      '/home',
      '/fleet',
      '/piles',
      '/samples',
      '/report',
    ])
  })
})
