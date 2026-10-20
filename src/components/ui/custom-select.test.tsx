import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { CustomSelect } from './custom-select'

describe('CustomSelect', () => {
  it('opens, selects an option, closes outside, and supports keyboard opening', () => {
    const onChange = vi.fn()
    const { container } = render(
      <>
        <CustomSelect
          ariaLabel="Shift"
          value=""
          placeholder="Select Shift"
          options={[{ value: 'D', label: 'D' }, { value: 'N', label: 'N' }]}
          onChange={onChange}
        />
        <button type="button">Outside</button>
      </>,
    )

    expect(container.querySelector('select')).not.toBeInTheDocument()

    const trigger = screen.getByRole('combobox', { name: 'Shift' })
    fireEvent.keyDown(trigger, { key: 'ArrowDown' })
    expect(screen.getByRole('listbox', { name: 'Shift options' })).toBeInTheDocument()
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Outside' }))
    expect(screen.queryByRole('listbox', { name: 'Shift options' })).not.toBeInTheDocument()

    fireEvent.click(trigger)
    fireEvent.click(screen.getByRole('option', { name: 'N' }))
    expect(onChange).toHaveBeenCalledWith('N')
    expect(screen.queryByRole('listbox', { name: 'Shift options' })).not.toBeInTheDocument()
  })

  it('gives the light menu and its options an explicit readable foreground', () => {
    render(
      <div className="text-white">
        <CustomSelect
          ariaLabel="Sector"
          value="BR1"
          placeholder="Select sector"
          options={[
            { value: 'BR1', label: 'BR1' },
            { value: 'DS', label: 'DS', disabled: true },
          ]}
          onChange={vi.fn()}
        />
      </div>,
    )

    const trigger = screen.getByRole('combobox', { name: 'Sector' })
    // Foreground is defined by the shared semantic control class in globals.css,
    // rather than duplicated as a utility on each CustomSelect instance.
    expect(trigger.parentElement).toHaveClass('ui-control', 'focus:ring-focus-accent/60')
    fireEvent.click(trigger)

    // The semantic dropdown class owns its foreground/background tokens.
    expect(screen.getByRole('listbox', { name: 'Sector options' })).toHaveClass('ui-dropdown')
    const selectedOption = screen.getByRole('option', { name: 'BR1' })
    expect(selectedOption).toHaveClass('bg-selected', 'text-foreground')
    expect(selectedOption.querySelector('svg')).toHaveClass('text-focus-accent')
    expect(screen.getByRole('option', { name: 'DS' })).toHaveClass('disabled:bg-disabled', 'disabled:text-muted-foreground', 'disabled:opacity-100')
  })
})
