import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { vi } from 'vitest'
import { BottomNav } from './BottomNav'

function LocationDisplay() {
  const { pathname } = useLocation()
  return <p data-testid="route-path">{pathname}</p>
}

function renderNav(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="*" element={<><LocationDisplay /><BottomNav /></>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('BottomNav contextual centre action', () => {
  it('shows one three-zone dock and the inactive REC state outside Production', async () => {
    const user = userEvent.setup()
    renderNav('/regist')
    const setupLink = screen.getByRole('link', { name: 'SETUP' })
    const reviewLink = screen.getByRole('link', { name: 'REVIEW' })
    const reportLink = screen.getByRole('link', { name: 'REPORT' })

    expect(setupLink).toHaveAttribute('href', '/regist')
    expect(setupLink).toHaveClass('qps-bottom-nav__tab--active')
    expect(setupLink.querySelector('[data-ui="setup-nav-icon"]')).toHaveClass('qps-nav-setup')
    expect(screen.getByRole('button', { name: 'REC' })).toBeInTheDocument()
    expect(reviewLink).toHaveAttribute('href', '/samples')
    expect(reviewLink.querySelector('[data-ui="review-nav-icon"]')).toHaveClass('qps-nav-review')
    expect(reportLink).toHaveAttribute('href', '/report')
    expect(reportLink.querySelector('[data-ui="report-nav-icon"]')).toHaveClass('qps-nav-report')
    const nav = screen.getByRole('navigation')
    expect(nav.querySelector('[data-ui="bottom-nav-backdrop"]')).toHaveClass('qps-bottom-nav__backdrop')
    expect(nav.querySelector('.qps-bottom-nav__tabs')).toBeInTheDocument()
    expect(nav.querySelector('.qps-bottom-nav__shape')).not.toBeInTheDocument()
    expect(nav.querySelectorAll('.qps-bottom-nav__tab, .qps-record-button')).toHaveLength(4)
    expect(nav.querySelectorAll('.qps-bottom-nav__indicator')).toHaveLength(3)
    expect(setupLink.querySelectorAll('.qps-bottom-nav__indicator')).toHaveLength(1)
    expect(reviewLink.querySelectorAll('.qps-bottom-nav__indicator')).toHaveLength(1)
    expect(reportLink.querySelectorAll('.qps-bottom-nav__indicator')).toHaveLength(1)
    await user.click(screen.getByRole('button', { name: 'REC' }))
    expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument()
    expect(screen.getByTestId('route-path')).toHaveTextContent('/production')
  })

  it('changes REC to Add inside Record and emits the workspace add action', async () => {
    const user = userEvent.setup()
    const listener = vi.fn()
    window.addEventListener('record-workspace:add', listener)
    renderNav('/production')
    await user.click(screen.getByRole('button', { name: 'Add' }))
    expect(listener).toHaveBeenCalledTimes(1)
    window.removeEventListener('record-workspace:add', listener)
  })

  it('keeps the elevated Add visual state on nested Production routes but returns to the dashboard without adding', async () => {
    const user = userEvent.setup()
    const listener = vi.fn()
    window.addEventListener('record-workspace:add', listener)
    renderNav('/production/record/PILE-1')

    const centreButton = screen.getByRole('button', { name: 'Add' })
    expect(centreButton).toHaveAttribute('data-record-active')
    await user.click(centreButton)

    expect(screen.getByTestId('route-path')).toHaveTextContent('/production')
    expect(listener).not.toHaveBeenCalled()
    window.removeEventListener('record-workspace:add', listener)
  })

  it('emits the Fleet-default Setup action when SETUP is selected', async () => {
    const user = userEvent.setup()
    const listener = vi.fn()
    window.addEventListener('work-setup:open-fleet', listener)
    renderNav('/report')

    await user.click(screen.getByRole('link', { name: 'SETUP' }))
    expect(listener).toHaveBeenCalledTimes(1)
    window.removeEventListener('work-setup:open-fleet', listener)
  })

  it('does not reset the Setup subtab when the already-active SETUP link is clicked', async () => {
    const user = userEvent.setup()
    const listener = vi.fn()
    window.addEventListener('work-setup:open-fleet', listener)
    renderNav('/regist')

    await user.click(screen.getByRole('link', { name: 'SETUP' }))
    expect(listener).not.toHaveBeenCalled()
    window.removeEventListener('work-setup:open-fleet', listener)
  })
})
