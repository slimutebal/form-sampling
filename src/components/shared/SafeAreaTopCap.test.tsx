import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SafeAreaTopCap } from './SafeAreaTopCap'

describe('SafeAreaTopCap', () => {
  it('renders an opaque, viewport-fixed layer that is hidden from assistive tech', () => {
    render(<SafeAreaTopCap />)

    const cap = screen.getByTestId('safe-area-top-cap')
    expect(cap).toHaveAttribute('aria-hidden', 'true')
    expect(cap.className).toContain('fixed')
    expect(cap.className).toContain('top-0')
    expect(cap.className).toContain('bg-background')
  })
})
