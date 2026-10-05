import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { vi } from 'vitest'
import { BottomNav } from './BottomNav'

function renderNav(path: string) {
  return render(<MemoryRouter initialEntries={[path]}><Routes><Route path="*" element={<><p>PAGE</p><BottomNav /></>} /></Routes></MemoryRouter>)
}

describe('BottomNav contextual centre action', () => {
  it('shows Setup, REC and Report outside Record and REC opens Production', async () => {
    const user = userEvent.setup()
    renderNav('/regist')
    expect(screen.getByRole('link', { name: /SETUP/i })).toHaveAttribute('href', '/regist')
    expect(screen.getByRole('button', { name: 'REC' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /REPORT/i })).toHaveAttribute('href', '/report')
    await user.click(screen.getByRole('button', { name: 'REC' }))
    expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument()
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
})
