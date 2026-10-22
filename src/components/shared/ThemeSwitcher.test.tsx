import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { THEME_STORAGE_KEY } from '@/app/theme/theme'
import { ThemeSwitcher } from './ThemeSwitcher'

function mockMatchMedia(matches = false) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn().mockImplementation(() => ({
      matches,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  })
}

describe('ThemeSwitcher', () => {
  beforeEach(() => {
    window.localStorage.clear()
    document.documentElement.removeAttribute('data-theme')
    mockMatchMedia(false)
  })

  it('starts in System and persists a selected compact-menu option globally', async () => {
    const user = userEvent.setup()
    render(<ThemeSwitcher />)

    expect(document.querySelector('[data-ui="theme-current-mode-icon"]')).toHaveClass('lucide-smartphone')
    expect(screen.getByRole('button', { name: 'Settings' })).toHaveAttribute('aria-description', 'Current theme System')
    await user.click(screen.getByRole('button', { name: 'Settings' }))
    expect(screen.getByRole('menu', { name: 'Settings' })).toBeInTheDocument()
    expect(screen.getByText('Appearance')).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Switch to System theme' })).not.toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Switch to Dark theme' })).toBeInTheDocument()
    expect(document.querySelector('[data-ui="theme-mode-icon"][data-theme-mode="light"]')).toHaveClass('lucide-moon')
    expect(document.querySelector('[data-ui="theme-mode-icon"][data-theme-mode="dark"]')).toHaveClass('lucide-sun')

    await user.click(screen.getByRole('menuitem', { name: 'Switch to Dark theme' }))
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark')
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
    expect(document.querySelector('[data-ui="theme-current-mode-icon"]')).toHaveClass('lucide-sun')
    expect(screen.getByRole('button', { name: 'Settings' })).toHaveAttribute('aria-description', 'Current theme Dark')
    expect(screen.getByRole('button', { name: 'Settings' })).toBeInTheDocument()
    expect(screen.queryByRole('menu', { name: 'Settings' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Settings' }))
    expect(screen.queryByRole('menuitem', { name: 'Switch to Dark theme' })).not.toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Switch to System theme' })).toBeInTheDocument()
    await user.click(screen.getByRole('menuitem', { name: 'Switch to Light theme' }))
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('light')
    expect(document.documentElement).toHaveAttribute('data-theme', 'light')
    expect(document.querySelector('[data-ui="theme-current-mode-icon"]')).toHaveClass('lucide-moon')
    expect(screen.getByRole('button', { name: 'Settings' })).toHaveAttribute('aria-description', 'Current theme Light')
  })

  it('uses the persisted mode for its header indicator after a fresh mount', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'dark')
    render(<ThemeSwitcher />)

    expect(document.querySelector('[data-ui="theme-current-mode-icon"]')).toHaveClass('lucide-sun')
    expect(screen.getByRole('button', { name: 'Settings' })).toHaveAttribute('aria-description', 'Current theme Dark')
  })
})
