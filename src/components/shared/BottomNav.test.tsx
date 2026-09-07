import { act, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { MemoryRouter, useNavigate } from 'react-router'
import i18n from '@/i18n'
import { BottomNav } from './BottomNav'

beforeEach(async () => {
  await i18n.changeLanguage('en')
})

function setScrollableViewport(scrollHeight: number, innerHeight = 800) {
  Object.defineProperty(document.documentElement, 'scrollHeight', { value: scrollHeight, configurable: true })
  Object.defineProperty(window, 'innerHeight', { value: innerHeight, configurable: true })
}

function setScrollY(value: number) {
  Object.defineProperty(window, 'scrollY', { value, configurable: true })
}

function scrollTo(value: number) {
  act(() => {
    setScrollY(value)
    window.dispatchEvent(new Event('scroll'))
  })
}

function renderNav(initialEntries: string[] = ['/home']) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <BottomNav />
    </MemoryRouter>,
  )
}

function NavHarness() {
  const navigate = useNavigate()
  return (
    <>
      <button type="button" onClick={() => navigate('/production')}>
        go to production
      </button>
      <BottomNav />
    </>
  )
}

function isHidden(nav: HTMLElement) {
  return nav.className.includes('translate-y-full')
}

describe('BottomNav', () => {
  beforeEach(() => {
    setScrollableViewport(0, 800)
    setScrollY(0)
  })

  it('shows the fixed 5-item nav (Home/Regist/Production/Sample/Report)', () => {
    renderNav()
    expect(screen.getAllByRole('listitem')).toHaveLength(5)
    expect(screen.getByRole('link', { name: 'Regist' })).toHaveAttribute('href', '/regist')
    expect(screen.getByRole('link', { name: 'Production' })).toHaveAttribute('href', '/production')
  })

  it('keeps Sample and Report as primary navigation items', () => {
    renderNav()
    expect(screen.getByRole('link', { name: 'Sample' })).toHaveAttribute('href', '/samples')
    expect(screen.getByRole('link', { name: 'Report' })).toHaveAttribute('href', '/report')
  })

  it('does not expose Fleet or Pile as primary bottom-navigation destinations', () => {
    renderNav()
    expect(screen.queryByRole('link', { name: 'Fleet' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Pile' })).not.toBeInTheDocument()
    expect(screen.getAllByRole('link').map((link) => link.getAttribute('href'))).toEqual([
      '/home',
      '/regist',
      '/production',
      '/samples',
      '/report',
    ])
  })

  it('A. stays visible while the page is not scrollable', () => {
    setScrollableViewport(400, 800)
    renderNav()
    scrollTo(50)
    expect(isHidden(screen.getByRole('navigation'))).toBe(false)
  })

  it('B. hides after a meaningful downward scroll on a long page', () => {
    setScrollableViewport(3000, 800)
    renderNav()
    scrollTo(100)
    scrollTo(140)
    expect(isHidden(screen.getByRole('navigation'))).toBe(true)
  })

  it('C. returns immediately on upward scroll', () => {
    setScrollableViewport(3000, 800)
    renderNav()
    scrollTo(100)
    scrollTo(140)
    expect(isHidden(screen.getByRole('navigation'))).toBe(true)
    scrollTo(100)
    expect(isHidden(screen.getByRole('navigation'))).toBe(false)
  })

  it('D. stays visible near the top of the page even after scrolling down elsewhere', () => {
    setScrollableViewport(3000, 800)
    renderNav()
    scrollTo(100)
    scrollTo(140)
    expect(isHidden(screen.getByRole('navigation'))).toBe(true)
    scrollTo(4)
    expect(isHidden(screen.getByRole('navigation'))).toBe(false)
  })

  it('F. tiny scroll jitter does not toggle visibility', () => {
    setScrollableViewport(3000, 800)
    renderNav()
    scrollTo(200)
    const stateBeforeJitter = isHidden(screen.getByRole('navigation'))
    scrollTo(206)
    expect(isHidden(screen.getByRole('navigation'))).toBe(stateBeforeJitter)
    scrollTo(198)
    expect(isHidden(screen.getByRole('navigation'))).toBe(stateBeforeJitter)
  })

  it('E. resets to visible on route change', async () => {
    setScrollableViewport(3000, 800)
    const user = (await import('@testing-library/user-event')).default.setup()
    render(
      <MemoryRouter initialEntries={['/home']}>
        <NavHarness />
      </MemoryRouter>,
    )
    scrollTo(100)
    scrollTo(140)
    expect(isHidden(screen.getByRole('navigation'))).toBe(true)
    await user.click(screen.getByRole('button', { name: 'go to production' }))
    expect(isHidden(screen.getByRole('navigation'))).toBe(false)
  })
})
