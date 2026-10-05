import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SampleProgressSummary } from './sample-progress-summary'

describe('SampleProgressSummary', () => {
  it('keeps a neutral progress bar visible before a material is selected', () => {
    render(<SampleProgressSummary countFormat="of" />)

    expect(screen.getByTestId('sample-progress-neutral')).toHaveClass('bg-muted-foreground/35')
    expect(screen.getByText('0 of — Incr')).toBeInTheDocument()
  })

  it('renders delivered, in-house, and remaining increments as green, red, and gray proportions', () => {
    render(
      <SampleProgressSummary
        progress={{
          currentTrip: 12,
          batchCapacity: 20,
          totalIncrementCount: 10,
          incrementsPerBag: 1,
          totalBagEquivalentCapacity: 10,
          producedIncrementCount: 6,
          producedBagEquivalent: 6,
          deliveredBagEquivalent: 4,
          remainingBagEquivalent: 2,
          deliveredIncrementCount: 4,
          inHouseIncrementCount: 2,
          maximumPhysicalInHouseBags: 2,
          inHouseBagCount: 2,
        }}
      />,
    )

    expect(screen.getByText('6 / 10 Incr')).toBeInTheDocument()
    expect(screen.getByText('2 Samples In House')).toBeInTheDocument()
    expect(screen.getByTestId('sample-progress-delivered')).toHaveClass('bg-emerald-600')
    expect(screen.getByTestId('sample-progress-delivered')).toHaveStyle({ width: '40%' })
    expect(screen.getByTestId('sample-progress-in-house')).toHaveClass('bg-red-500')
    expect(screen.getByTestId('sample-progress-in-house')).toHaveStyle({ width: '20%' })
    expect(screen.getByTestId('sample-progress-remaining')).toHaveClass('bg-muted-foreground/35')
    expect(screen.getByTestId('sample-progress-remaining')).toHaveStyle({ width: '40%' })
  })

  it('keeps a partial LIM bag-equivalent in the red tail instead of rounding the bar', () => {
    render(
      <SampleProgressSummary
        countFormat="of"
        physicalInHouse={2}
        progress={{
          currentTrip: 45,
          batchCapacity: 100,
          totalIncrementCount: 20,
          incrementsPerBag: 2,
          totalBagEquivalentCapacity: 10,
          producedIncrementCount: 9,
          producedBagEquivalent: 4.5,
          deliveredBagEquivalent: 0,
          remainingBagEquivalent: 4.5,
          deliveredIncrementCount: 0,
          inHouseIncrementCount: 9,
          maximumPhysicalInHouseBags: 5,
          inHouseBagCount: 5,
        }}
      />,
    )

    expect(screen.getByTestId('sample-progress-delivered')).toHaveStyle({ width: '30%' })
    expect(screen.getByTestId('sample-progress-in-house')).toHaveStyle({ width: '15%' })
    expect(screen.getByTestId('sample-progress-remaining')).toHaveStyle({ width: '55%' })
    expect(screen.getByText('2 Samples In House')).toBeInTheDocument()
  })
})
