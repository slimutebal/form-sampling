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

/** Keeps a single BottomNav instance mounted while navigating, so route-change resets are observed on that instance rather than via remount. */
function NavHarness() {
  const navigate = useNavigate()
  return (
    <>
      <button type="button" onClick={() => navigate('/piles')}>
        go to piles
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

  it('shows the fixed 5-item nav (Home/Fleet/Pile/Sample/Report), with no extra items', () => {
    renderNav()
    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(5)
  })

  it('labels the Piles route "Pile" and the Samples route "Sample" (Phase 18 §13, shortened per mobile hardening)', () => {
    renderNav()
    expect(screen.getByRole('link', { name: 'Pile' })).toHaveAttribute('href', '/piles')
    expect(screen.getByRole('link', { name: 'Sample' })).toHaveAttribute('href', '/samples')
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

  it('A. stays visible while the page is not scrollable', () => {
    setScrollableViewport(400, 800) // shorter than the viewport
    renderNav()
    scrollTo(50)
    expect(isHidden(screen.getByRole('navigation'))).toBe(false)
  })

  it('B. hides after a meaningful downward scroll on a long page', () => {
    setScrollableViewport(3000, 800)
    renderNav()
    scrollTo(100) // clear the top anchor first
    scrollTo(140) // +40px downward, past the 16px threshold
    expect(isHidden(screen.getByRole('navigation'))).toBe(true)
  })

  it('C. returns immediately on upward scroll', () => {
    setScrollableViewport(3000, 800)
    renderNav()
    scrollTo(100)
    scrollTo(140)
    expect(isHidden(screen.getByRole('navigation'))).toBe(true)

    scrollTo(100) // -40px upward, past the 16px threshold
    expect(isHidden(screen.getByRole('navigation'))).toBe(false)
  })

  it('D. stays visible near the top of the page even after scrolling down elsewhere', () => {
    setScrollableViewport(3000, 800)
    renderNav()
    scrollTo(100)
    scrollTo(140)
    expect(isHidden(screen.getByRole('navigation'))).toBe(true)

    scrollTo(4) // back within the top anchor
    expect(isHidden(screen.getByRole('navigation'))).toBe(false)
  })

  it('F. tiny scroll jitter does not toggle visibility', () => {
    setScrollableViewport(3000, 800)
    renderNav()
    scrollTo(200) // settle away from the top anchor
    const stateBeforeJitter = isHidden(screen.getByRole('navigation'))

    scrollTo(206) // +6px wobble, under the 16px threshold
    expect(isHidden(screen.getByRole('navigation'))).toBe(stateBeforeJitter)
    scrollTo(198) // -8px wobble, still under threshold
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

    await user.click(screen.getByRole('button', { name: 'go to piles' }))

    expect(isHidden(screen.getByRole('navigation'))).toBe(false)
  })
})
