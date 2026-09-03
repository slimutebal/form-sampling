import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { parseSamplingHouseCode, parseSectorCode, parseShiftCode } from '@/domain/common/codes'
import { parseShiftId, parseTruckId } from '@/domain/common/identifiers'
import { parseShiftDate } from '@/domain/common/shift-date'
import type { FleetDefinition } from '@/domain/fleet/fleet-definition'
import { createMasterData, type MasterData } from '@/domain/master/master-data'
import { parseHaulerCode } from '@/domain/master/master-codes'
import {
  createHaulerReference,
  createSectorReference,
  createTruckReference,
} from '@/domain/master/references'
import { createShift, type Shift } from '@/domain/shift/shift'
import { FleetSetupPage } from '@/features/fleet-setup/fleet-setup-page'
import i18n from '@/i18n'

function value<T>(result: { ok: true; value: T } | { ok: false }): T {
  if (!result.ok) throw new Error('invalid test fixture')
  return result.value
}

function shift(): Shift {
  return createShift({
    id: value(parseShiftId('SHIFT-1')),
    date: value(parseShiftDate('2026-09-04')),
    shiftCode: value(parseShiftCode('D')),
    sectorCode: value(parseSectorCode('S1')),
    samplingHouseCode: value(parseSamplingHouseCode('SH1')),
    status: 'NEW',
  })
}

function masterData(truckCount = 20): MasterData {
  const h1 = value(parseHaulerCode('H1'))
  const h2 = value(parseHaulerCode('H2'))
  return value(
    createMasterData({
      employees: [],
      crews: [],
      locations: [],
      samplingHouses: [],
      pileAreas: [],
      oreSamplingConfigs: [],
      sectors: [createSectorReference(value(parseSectorCode('S1')))],
      haulers: [createHaulerReference(h1), createHaulerReference(h2)],
      trucks: [
        ...Array.from({ length: truckCount }, (_, index) =>
          createTruckReference(value(parseTruckId(`T${index + 1}`)), h1),
        ),
        createTruckReference(value(parseTruckId('H2-T1')), h2),
      ],
    }),
  )
}

function renderPage(onReady = vi.fn(), trucks = 20) {
  let id = 0
  const result = render(
    <FleetSetupPage
      shift={shift()}
      masterData={masterData(trucks)}
      onFleetSetupReady={onReady}
      generateFleetId={() => `FLEET-${++id}`}
    />,
  )
  return { ...result, onReady }
}

function expectAssociatedError(control: HTMLElement, message: string) {
  expect(control).toHaveAttribute('aria-invalid', 'true')
  const errorId = control.getAttribute('aria-describedby')
  expect(errorId).toBeTruthy()
  expect(document.getElementById(errorId!)).toHaveTextContent(message)
}

async function startFront(
  user: ReturnType<typeof userEvent.setup>,
  frontId: string,
  hauler = 'H1',
) {
  await user.click(screen.getByRole('button', { name: 'Add Front' }))
  await user.type(screen.getByLabelText('Front ID'), frontId)
  await user.selectOptions(screen.getByLabelText('Hauler'), hauler)
}

async function addBaseFront(
  user: ReturnType<typeof userEvent.setup>,
  frontId: string,
  trucks: readonly string[],
) {
  await startFront(user, frontId)
  const selector = screen.getByLabelText('Add Truck')
  for (const truck of trucks) {
    await user.selectOptions(selector, truck)
    await user.click(screen.getByRole('button', { name: 'Add Truck' }))
  }
  await user.click(screen.getByRole('button', { name: 'Save Front' }))
}

beforeEach(async () => {
  await i18n.changeLanguage('en')
})

describe('FleetSetupPage', () => {
  it('renders Shift context and Add Front with validated inputs', () => {
    renderPage()
    expect(screen.getByRole('heading', { name: 'Fleet Setup' })).toBeInTheDocument()
    expect(screen.getByText('S1')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add Front' })).toBeInTheDocument()
  })

  it('adds a BASE front and shows three effective trucks', async () => {
    const user = userEvent.setup()
    renderPage()
    await addBaseFront(user, 'F1', ['T1', 'T2', 'T3'])
    const card = screen
      .getByRole('heading', { name: 'F1' })
      .closest('div.rounded-lg') as HTMLElement
    expect(within(card).getByText('Truck Count: 3')).toBeInTheDocument()
    expect(within(card).getByText('T3')).toBeInTheDocument()
  })

  it('only offers trucks belonging to the selected Hauler', async () => {
    const user = userEvent.setup()
    renderPage()
    await startFront(user, 'F1')
    const selector = screen.getByLabelText('Add Truck')
    expect(within(selector).getByRole('option', { name: 'T1' })).toBeInTheDocument()
    expect(within(selector).queryByRole('option', { name: 'H2-T1' })).not.toBeInTheDocument()
  })

  it('cannot apply a stale Remove Truck after the reference Fleet changes', async () => {
    const user = userEvent.setup()
    const { onReady } = renderPage()
    await addBaseFront(user, 'F1', ['T1', 'T2'])
    await addBaseFront(user, 'F3', ['T3'])
    await startFront(user, 'F2')
    await user.selectOptions(screen.getByLabelText('Fleet Type'), 'DERIVED')
    await user.selectOptions(screen.getByLabelText('Reference Fleet'), 'FLEET-1')
    await user.selectOptions(screen.getByLabelText('Remove Truck'), 'T2')

    await user.selectOptions(screen.getByLabelText('Reference Fleet'), 'FLEET-2')

    expect(screen.getByLabelText('Remove Truck')).toHaveValue('')
    expect(screen.getByRole('button', { name: 'Remove Truck' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Remove Truck' }))
    expect(
      screen.queryByRole('button', { name: 'Restore T2 to inherited trucks' }),
    ).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Save Front' }))
    await user.click(screen.getByRole('button', { name: 'Review Fleet Setup' }))
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    const setup = onReady.mock.calls[0]?.[0]
    const f2 = setup.fleets.find((fleet: FleetDefinition) => fleet.frontId === 'F2')
    expect(f2).toMatchObject({ kind: 'DERIVED', removedTruckIds: [] })
  })

  it('cannot apply a stale truck selection after the Hauler changes', async () => {
    const user = userEvent.setup()
    renderPage()
    await startFront(user, 'F1')
    await user.selectOptions(screen.getByLabelText('Add Truck'), 'T1')

    await user.selectOptions(screen.getByLabelText('Hauler'), 'H2')

    const selector = screen.getByLabelText('Add Truck')
    expect(selector).toHaveValue('')
    expect(within(selector).queryByRole('option', { name: 'T1' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add Truck' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Add Truck' }))
    await user.selectOptions(selector, 'H2-T1')
    await user.click(screen.getByRole('button', { name: 'Add Truck' }))
    await user.click(screen.getByRole('button', { name: 'Save Front' }))
    const card = screen
      .getByRole('heading', { name: 'F1' })
      .closest('div.rounded-lg') as HTMLElement
    expect(within(card).getByText('H2-T1')).toBeInTheDocument()
    expect(within(card).queryByText('T1')).not.toBeInTheDocument()
  })

  it('configures a DERIVED front with separate Add/Remove and domain preview', async () => {
    const user = userEvent.setup()
    renderPage()
    await addBaseFront(user, 'F1', ['T1', 'T2', 'T3'])
    await startFront(user, 'F2')
    await user.selectOptions(screen.getByLabelText('Fleet Type'), 'DERIVED')
    await user.selectOptions(screen.getByLabelText('Reference Fleet'), 'FLEET-1')
    await user.selectOptions(screen.getByLabelText('Add Truck'), 'T4')
    await user.click(screen.getByRole('button', { name: 'Add Truck' }))
    await user.selectOptions(screen.getByLabelText('Remove Truck'), 'T2')
    await user.click(screen.getByRole('button', { name: 'Remove Truck' }))
    expect(screen.getByText('Added Trucks')).toBeInTheDocument()
    expect(screen.getByText('Removed Trucks')).toBeInTheDocument()
    expect(screen.getAllByText('Truck Count: 3')).toHaveLength(2)
    await user.click(screen.getByRole('button', { name: 'Save Front' }))
    const f2 = screen.getByRole('heading', { name: 'F2' }).closest('div.rounded-lg') as HTMLElement
    expect(within(f2).getByText('T1')).toBeInTheDocument()
    expect(within(f2).getByText('T3')).toBeInTheDocument()
    expect(within(f2).getByText('T4')).toBeInTheDocument()
    expect(within(f2).queryByText('T2')).not.toBeInTheDocument()
  })

  it('shows a translated duplicate Front error', async () => {
    const user = userEvent.setup()
    renderPage()
    await addBaseFront(user, 'F1', ['T1'])
    await startFront(user, 'F1')
    await user.click(screen.getByRole('button', { name: 'Save Front' }))
    expect(
      screen.getAllByRole('alert').some((node) => node.textContent === 'Front ID must be unique.'),
    ).toBe(true)
  })

  it('associates a missing Hauler error only with the Hauler control', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole('button', { name: 'Add Front' }))
    await user.type(screen.getByLabelText('Front ID'), 'F1')
    await user.click(screen.getByRole('button', { name: 'Save Front' }))

    const frontId = screen.getByLabelText('Front ID')
    const hauler = screen.getByLabelText('Hauler')
    expectAssociatedError(hauler, 'Select a Hauler.')
    expect(frontId).not.toHaveAttribute('aria-invalid')
    expect(frontId).not.toHaveAttribute('aria-describedby')
  })

  it('associates a blank Front ID error only with the Front ID control', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole('button', { name: 'Add Front' }))
    await user.selectOptions(screen.getByLabelText('Hauler'), 'H1')
    await user.click(screen.getByRole('button', { name: 'Save Front' }))

    const frontId = screen.getByLabelText('Front ID')
    const hauler = screen.getByLabelText('Hauler')
    expectAssociatedError(frontId, 'Front ID is required.')
    expect(hauler).not.toHaveAttribute('aria-invalid')
    expect(hauler).not.toHaveAttribute('aria-describedby')
  })

  it('associates a missing reference error only with Reference Fleet', async () => {
    const user = userEvent.setup()
    renderPage()
    await addBaseFront(user, 'F1', ['T1'])
    await startFront(user, 'F2')
    await user.selectOptions(screen.getByLabelText('Fleet Type'), 'DERIVED')
    await user.click(screen.getByRole('button', { name: 'Save Front' }))

    const frontId = screen.getByLabelText('Front ID')
    const reference = screen.getByLabelText('Reference Fleet')
    expectAssociatedError(reference, 'Select a reference fleet.')
    expect(frontId).not.toHaveAttribute('aria-invalid')
    expect(frontId).not.toHaveAttribute('aria-describedby')
  })

  it('hands off only a validated FleetSetup after review', async () => {
    const user = userEvent.setup()
    const { onReady } = renderPage()
    await addBaseFront(user, 'F1', ['T1'])
    await user.click(screen.getByRole('button', { name: 'Review Fleet Setup' }))
    expect(screen.getByRole('heading', { name: 'Fleet Setup Ready' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    expect(onReady).toHaveBeenCalledTimes(1)
    expect(onReady.mock.calls[0]?.[0].fronts[0].sectorCode).toBe('S1')
  })

  it('does not hand off an invalid empty setup', async () => {
    const user = userEvent.setup()
    const { onReady } = renderPage()
    await user.click(screen.getByRole('button', { name: 'Review Fleet Setup' }))
    expect(onReady).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('Add at least one front')
  })

  it('prevents removing a referenced Front and shows the dependency warning', async () => {
    const user = userEvent.setup()
    renderPage()
    await addBaseFront(user, 'F1', ['T1'])
    await startFront(user, 'F2')
    await user.selectOptions(screen.getByLabelText('Fleet Type'), 'DERIVED')
    await user.selectOptions(screen.getByLabelText('Reference Fleet'), 'FLEET-1')
    await user.click(screen.getByRole('button', { name: 'Save Front' }))
    await user.click(screen.getByRole('button', { name: 'Remove front F1' }))
    expect(screen.getByRole('alert')).toHaveTextContent('cannot be removed')
    expect(screen.getByRole('heading', { name: 'F1' })).toBeInTheDocument()
  })

  it('updates a dependent preview after editing its source Fleet', async () => {
    const user = userEvent.setup()
    renderPage()
    await addBaseFront(user, 'F1', ['T1', 'T2'])
    await startFront(user, 'F2')
    await user.selectOptions(screen.getByLabelText('Fleet Type'), 'DERIVED')
    await user.selectOptions(screen.getByLabelText('Reference Fleet'), 'FLEET-1')
    await user.click(screen.getByRole('button', { name: 'Save Front' }))
    await user.click(screen.getAllByRole('button', { name: 'Edit Front' })[0]!)
    await user.click(screen.getByRole('button', { name: 'Remove T2' }))
    await user.selectOptions(screen.getByLabelText('Add Truck'), 'T3')
    await user.click(screen.getByRole('button', { name: 'Add Truck' }))
    await user.click(screen.getByRole('button', { name: 'Save Front' }))
    const f2 = screen.getByRole('heading', { name: 'F2' }).closest('div.rounded-lg') as HTMLElement
    expect(within(f2).getByText('T3')).toBeInTheDocument()
    expect(within(f2).queryByText('T2')).not.toBeInTheDocument()
  })

  it('configures and displays a 20-truck BASE fleet', async () => {
    const user = userEvent.setup()
    renderPage()
    await addBaseFront(
      user,
      'F20',
      Array.from({ length: 20 }, (_, index) => `T${index + 1}`),
    )
    expect(screen.getByText('Truck Count: 20')).toBeInTheDocument()
    expect(screen.getByText('T20')).toBeInTheDocument()
  }, 15000)

  it('never displays diagnostic DomainError.message text', async () => {
    const user = userEvent.setup()
    renderPage()
    await addBaseFront(user, 'F1', ['T1'])
    await startFront(user, 'F1')
    await user.click(screen.getByRole('button', { name: 'Save Front' }))
    expect(screen.queryByText(/Duplicate FrontId in fleet setup/)).not.toBeInTheDocument()
    expect(
      screen.getAllByRole('alert').some((node) => node.textContent === 'Front ID must be unique.'),
    ).toBe(true)
  })
})
