import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PreShiftShell } from './PreShiftShell'

describe('PreShiftShell', () => {
  it('reserves top safe-area flow space before its children and renders the safe-area cap', () => {
    render(
      <PreShiftShell>
        <div>CHILD_CONTENT</div>
      </PreShiftShell>,
    )

    expect(screen.getByText('CHILD_CONTENT')).toBeInTheDocument()
    expect(screen.getByTestId('safe-area-top-cap')).toBeInTheDocument()

    const shell = screen.getByText('CHILD_CONTENT').parentElement
    expect(shell?.className).toContain('safe-top')
  })
})
