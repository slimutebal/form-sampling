import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PageHeader } from './PageHeader'

describe('PageHeader', () => {
  it('renders the title as a heading', () => {
    render(<PageHeader title="Registrasi Shift" />)
    expect(screen.getByRole('heading', { name: 'Registrasi Shift', level: 1 })).toBeInTheDocument()
  })

  it('keeps safe-area clearance and content padding on separate elements so neither can override the other', () => {
    render(<PageHeader title="Registrasi Shift" />)

    const header = screen.getByRole('banner')
    // safe-x (env(safe-area-inset-*)) must live on the outer element alone —
    // combined with a fixed px-* on the same node, one silently wins the
    // cascade and can collapse the title flush against the screen edge.
    expect(header.className).toContain('safe-x')
    expect(header.className).not.toMatch(/\bpx-\d/)
    expect(header.className).toContain('border-b')

    const title = screen.getByRole('heading', { name: 'Registrasi Shift' })
    const contentWrapper = title.parentElement
    expect(contentWrapper?.className).toContain('px-5')
    expect(contentWrapper?.className).toContain('items-center')
  })
})
