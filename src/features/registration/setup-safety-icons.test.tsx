import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { FleetSafetyIcon, ManpowerSafetyIcon, SampleSafetyIcon } from './setup-safety-icons'

describe('Active Setup safety icons', () => {
  it('uses one compact outline system and retains the required visual concepts', () => {
    const { container } = render(
      <>
        <ManpowerSafetyIcon size={20} />
        <SampleSafetyIcon size={20} />
        <FleetSafetyIcon size={20} />
      </>,
    )

    const icons = Array.from(container.querySelectorAll('svg'))
    expect(icons).toHaveLength(3)
    for (const icon of icons) {
      expect(icon).toHaveAttribute('viewBox', '0 0 24 24')
      expect(icon).toHaveAttribute('stroke-width', '1.8')
      expect(icon).toHaveAttribute('stroke-linecap', 'round')
      expect(icon).toHaveAttribute('stroke-linejoin', 'round')
      expect(icon).toHaveAttribute('width', '20')
      expect(icon).toHaveAttribute('height', '20')
    }

    expect(
      container.querySelector('[data-icon="manpower-safety"] [data-part="safety-shield"]'),
    ).toBeInTheDocument()
    expect(
      container.querySelector('[data-icon="sample-safety"] [data-part="ore-pile"]'),
    ).toBeInTheDocument()
    expect(
      container.querySelectorAll('[data-icon="fleet-safety"] [data-vehicle="mining-dump-truck"]'),
    ).toHaveLength(1)
  })
})
