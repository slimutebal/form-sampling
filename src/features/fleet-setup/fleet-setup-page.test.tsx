import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { parseOreCode, parseSamplingHouseCode, parseSectorCode, parseShiftCode } from '@/domain/common/codes'
import { parsePileId, parseShiftId, parseTruckId } from '@/domain/common/identifiers'
import { parseShiftDate } from '@/domain/common/shift-date'
import type { FleetDefinition } from '@/domain/fleet/fleet-definition'
import { createMasterData, type MasterData } from '@/domain/master/master-data'
import { parseHaulerCode, parsePileAreaCode } from '@/domain/master/master-codes'
import {
  createHaulerReference,
  createPileAreaReference,
  createSectorReference,
  createTruckReference,
} from '@/domain/master/references'
import { createOreSamplingConfig, parseBatchSize, parsePackingConfigValue, parseSamplingInterval } from '@/domain/master/sampling-config'
import { createShift, type Shift } from '@/domain/shift/shift'
import { ok } from '@/domain/common/result'
import { FleetSetupPage } from '@/features/fleet-setup/fleet-setup-page'
import i18n from '@/i18n'

function value<T>(result: { ok: true; value: T } | { ok: false }): T {
  if (!result.ok) throw new Error('invalid test fixture')
  return result.value
}

/** Derived display FrontId for this suite's fixed Sector `S1`, mirroring `formatFrontId`. */
function frontId(frontNumber: string): string {
  return `S1/${frontNumber}`
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
  const sectorCode = value(parseSectorCode('S1'))
  return value(
    createMasterData({
      employees: [],
      crews: [],
      locations: [],
      samplingHouses: [],
      pileAreas: [
        createPileAreaReference(
          sectorCode,
          value(parsePileAreaCode('STOCK-1')),
          value(parsePileId('PILE-1')),
          value(parseOreCode('SAP')),
        ),
      ],
      oreSamplingConfigs: [
        createOreSamplingConfig({
          oreCode: value(parseOreCode('SAP')),
          interval: value(parseSamplingInterval(2)),
          batchSize: value(parseBatchSize(20)),
          packing: value(parsePackingConfigValue(2)),
        }),
      ],
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
  frontNumber: string,
  hauler = 'H1',
) {
  await user.click(screen.getByRole('button', { name: 'Add Front' }))
  await user.selectOptions(screen.getByLabelText('Front No'), frontNumber)
  await user.selectOptions(screen.getByLabelText('Hauler'), hauler)
}

async function addBaseFront(
  user: ReturnType<typeof userEvent.setup>,
  frontNumber: string,
  trucks: readonly string[],
) {
  await startFront(user, frontNumber)
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

  it('offers only Front No 01–25, never free text', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole('button', { name: 'Add Front' }))
    const select = screen.getByLabelText('Front No') as HTMLSelectElement
    expect(select.tagName).toBe('SELECT')
    const optionValues = Array.from(select.options).map((option) => option.value)
    expect(optionValues).toEqual(['', ...Array.from({ length: 25 }, (_, i) => String(i + 1).padStart(2, '0'))])
  })

  it('derives the FrontId from Sector + Front No, and never shows "Fleet Type"', async () => {
    const user = userEvent.setup()
    renderPage()
    await startFront(user, '01')
    expect(screen.getByText(frontId('01'))).toBeInTheDocument()
    expect(screen.queryByLabelText('Fleet Type')).not.toBeInTheDocument()
    expect(screen.queryByText('Fleet Type')).not.toBeInTheDocument()
  })

  it('adds a BASE front and shows three effective trucks', async () => {
    const user = userEvent.setup()
    renderPage()
    await addBaseFront(user, '01', ['T1', 'T2', 'T3'])
    const card = screen
      .getByRole('heading', { name: frontId('01') })
      .closest('div.rounded-lg') as HTMLElement
    expect(within(card).getByText('Truck Count: 3')).toBeInTheDocument()
    expect(within(card).getByText('T3')).toBeInTheDocument()
  })

  it('only offers trucks belonging to the selected Hauler', async () => {
    const user = userEvent.setup()
    renderPage()
    await startFront(user, '01')
    const selector = screen.getByLabelText('Add Truck')
    expect(within(selector).getByRole('option', { name: 'T1' })).toBeInTheDocument()
    expect(within(selector).queryByRole('option', { name: 'H2-T1' })).not.toBeInTheDocument()
  })

  it('cannot apply a stale Remove Truck after the reference Fleet changes', async () => {
    const user = userEvent.setup()
    const { onReady } = renderPage()
    await addBaseFront(user, '01', ['T1', 'T2'])
    await addBaseFront(user, '03', ['T3'])
    await startFront(user, '02')
    await user.selectOptions(screen.getByLabelText('Fleet Reference'), 'FLEET-1')
    await user.selectOptions(screen.getByLabelText('Remove Truck'), 'T2')

    await user.selectOptions(screen.getByLabelText('Fleet Reference'), 'FLEET-2')

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
    const f2 = setup.fleets.find((fleet: FleetDefinition) => fleet.frontId === frontId('02'))
    expect(f2).toMatchObject({ kind: 'DERIVED', removedTruckIds: [] })
  })

  it('cannot apply a stale truck selection after the Hauler changes', async () => {
    const user = userEvent.setup()
    renderPage()
    await startFront(user, '01')
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
      .getByRole('heading', { name: frontId('01') })
      .closest('div.rounded-lg') as HTMLElement
    expect(within(card).getByText('H2-T1')).toBeInTheDocument()
    expect(within(card).queryByText('T1')).not.toBeInTheDocument()
  })

  it('configures a DERIVED front with separate Add/Remove and domain preview', async () => {
    const user = userEvent.setup()
    renderPage()
    await addBaseFront(user, '01', ['T1', 'T2', 'T3'])
    await startFront(user, '02')
    await user.selectOptions(screen.getByLabelText('Fleet Reference'), 'FLEET-1')
    await user.selectOptions(screen.getByLabelText('Add Truck'), 'T4')
    await user.click(screen.getByRole('button', { name: 'Add Truck' }))
    await user.selectOptions(screen.getByLabelText('Remove Truck'), 'T2')
    await user.click(screen.getByRole('button', { name: 'Remove Truck' }))
    expect(screen.getByText('Added Trucks')).toBeInTheDocument()
    expect(screen.getByText('Removed Trucks')).toBeInTheDocument()
    expect(screen.getAllByText('Truck Count: 3')).toHaveLength(2)
    await user.click(screen.getByRole('button', { name: 'Save Front' }))
    const f2 = screen.getByRole('heading', { name: frontId('02') }).closest('div.rounded-lg') as HTMLElement
    expect(within(f2).getByText('T1')).toBeInTheDocument()
    expect(within(f2).getByText('T3')).toBeInTheDocument()
    expect(within(f2).getByText('T4')).toBeInTheDocument()
    expect(within(f2).queryByText('T2')).not.toBeInTheDocument()
  })

  it('sets a Destination/Pile via the searchable combobox, filtered to the shift Sector', async () => {
    const user = userEvent.setup()
    renderPage()
    await startFront(user, '01')
    await user.type(screen.getByLabelText('Destination/Pile'), 'PILE-1')
    await user.click(await screen.findByRole('button', { name: /PILE-1/ }))
    expect(screen.getByText(/PILE-1/)).toBeInTheDocument()
  })

  it('creates a new master Pile from the Destination search and immediately selects it, without initializing a workspace', async () => {
    const user = userEvent.setup()
    const createNewPile = vi.fn(async (draft: { pileId: string }) => {
      const merged = masterData()
      return ok({
        pileArea: createPileAreaReference(
          value(parseSectorCode('S1')),
          value(parsePileAreaCode('SS_05')),
          value(parsePileId(draft.pileId)),
          value(parseOreCode('SAP')),
        ),
        masterData: value(
          createMasterData({
            ...merged,
            pileAreas: [
              ...merged.pileAreas,
              createPileAreaReference(
                value(parseSectorCode('S1')),
                value(parsePileAreaCode('SS_05')),
                value(parsePileId(draft.pileId)),
                value(parseOreCode('SAP')),
              ),
            ],
          }),
        ),
      })
    })
    const onMasterDataUpdated = vi.fn()

    render(
      <FleetSetupPage
        shift={shift()}
        masterData={masterData()}
        onFleetSetupReady={vi.fn()}
        generateFleetId={() => 'FLEET-1'}
        createNewPile={createNewPile}
        onMasterDataUpdated={onMasterDataUpdated}
      />,
    )
    await startFront(user, '01')
    await user.type(screen.getByLabelText('Destination/Pile'), 'S5_02')
    await user.click(screen.getByRole('button', { name: '+ Add New Pile "S5_02"' }))

    expect(screen.getByText('SS_05')).toBeInTheDocument()
    expect(screen.getByText('SAP')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Add' }))

    expect(createNewPile).toHaveBeenCalledWith({ pileId: 'S5_02' })
    expect(onMasterDataUpdated).toHaveBeenCalledTimes(1)
    expect(screen.getByText(/S5_02/)).toBeInTheDocument()
  })

  it('hides an already-used Front No from the selector so it can never be picked again (Phase 18 §1)', async () => {
    const user = userEvent.setup()
    renderPage()
    await addBaseFront(user, '01', ['T1'])
    await user.click(screen.getByRole('button', { name: 'Add Front' }))
    const select = screen.getByLabelText('Front No') as HTMLSelectElement
    const optionValues = Array.from(select.options).map((option) => option.value)
    expect(optionValues).not.toContain('01')
    expect(optionValues).toContain('02')
  })

  it('keeps a Front\'s own number visible while editing it, while still hiding other used numbers', async () => {
    const user = userEvent.setup()
    renderPage()
    await addBaseFront(user, '01', ['T1'])
    await addBaseFront(user, '02', ['T2'])
    await user.click(screen.getAllByRole('button', { name: 'Edit Front' })[0]!)
    const select = screen.getByLabelText('Front No') as HTMLSelectElement
    expect(select).toHaveValue('01')
    const optionValues = Array.from(select.options).map((option) => option.value)
    expect(optionValues).toContain('01')
    expect(optionValues).not.toContain('02')
  })

  // The DUPLICATE_FRONT_ID domain guard (fleet-setup.ts) is exercised
  // directly in fleet-setup.test.ts — the selector filtering above makes
  // it unreachable through this UI, so it is kept only as defense-in-depth
  // (Phase 18 §1), not as a UI-driven scenario here.

  it('associates a missing Hauler error only with the Hauler control', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole('button', { name: 'Add Front' }))
    await user.selectOptions(screen.getByLabelText('Front No'), '01')
    await user.click(screen.getByRole('button', { name: 'Save Front' }))

    const frontNumber = screen.getByLabelText('Front No')
    const hauler = screen.getByLabelText('Hauler')
    expectAssociatedError(hauler, 'Select a Hauler.')
    expect(frontNumber).not.toHaveAttribute('aria-invalid')
    expect(frontNumber).not.toHaveAttribute('aria-describedby')
  })

  it('associates a missing Front No error only with the Front No control', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole('button', { name: 'Add Front' }))
    await user.selectOptions(screen.getByLabelText('Hauler'), 'H1')
    await user.click(screen.getByRole('button', { name: 'Save Front' }))

    const frontNumber = screen.getByLabelText('Front No')
    const hauler = screen.getByLabelText('Hauler')
    expectAssociatedError(frontNumber, 'Select a Front No (1–25).')
    expect(hauler).not.toHaveAttribute('aria-invalid')
    expect(hauler).not.toHaveAttribute('aria-describedby')
  })

  // FLEET_REFERENCE_REQUIRED can no longer be triggered from this UI —
  // selecting "None" in Fleet Reference always yields kind: 'BASE', so a
  // DERIVED entry with a blank reference is now structurally impossible
  // to produce here. That error code is still guarded at the domain/
  // application layer (see create-fleet-setup-from-draft.test.ts,
  // "rejects a DERIVED entry with a blank reference"), which is the
  // correct place for coverage once the UI can't reach it.

  it('hands off only a validated FleetSetup after review', async () => {
    const user = userEvent.setup()
    const { onReady } = renderPage()
    await addBaseFront(user, '01', ['T1'])
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
    await addBaseFront(user, '01', ['T1'])
    await startFront(user, '02')
    await user.selectOptions(screen.getByLabelText('Fleet Reference'), 'FLEET-1')
    await user.click(screen.getByRole('button', { name: 'Save Front' }))
    await user.click(screen.getByRole('button', { name: `Remove front ${frontId('01')}` }))
    expect(screen.getByRole('alert')).toHaveTextContent('cannot be removed')
    expect(screen.getByRole('heading', { name: frontId('01') })).toBeInTheDocument()
  })

  it('updates a dependent preview after editing its source Fleet', async () => {
    const user = userEvent.setup()
    renderPage()
    await addBaseFront(user, '01', ['T1', 'T2'])
    await startFront(user, '02')
    await user.selectOptions(screen.getByLabelText('Fleet Reference'), 'FLEET-1')
    await user.click(screen.getByRole('button', { name: 'Save Front' }))
    await user.click(screen.getAllByRole('button', { name: 'Edit Front' })[0]!)
    await user.click(screen.getByRole('button', { name: 'Remove T2' }))
    await user.selectOptions(screen.getByLabelText('Add Truck'), 'T3')
    await user.click(screen.getByRole('button', { name: 'Add Truck' }))
    await user.click(screen.getByRole('button', { name: 'Save Front' }))
    const f2 = screen.getByRole('heading', { name: frontId('02') }).closest('div.rounded-lg') as HTMLElement
    expect(within(f2).getByText('T3')).toBeInTheDocument()
    expect(within(f2).queryByText('T2')).not.toBeInTheDocument()
  })

  it('configures and displays a 20-truck BASE fleet', async () => {
    const user = userEvent.setup()
    renderPage()
    await addBaseFront(
      user,
      '20',
      Array.from({ length: 20 }, (_, index) => `T${index + 1}`),
    )
    expect(screen.getByText('Truck Count: 20')).toBeInTheDocument()
    expect(screen.getByText('T20')).toBeInTheDocument()
  }, 15000)

  it('never displays diagnostic DomainError.message text', async () => {
    // The DUPLICATE_FRONT_ID scenario this test used to drive through the
    // UI is no longer reachable now that used Front Numbers are hidden
    // from the selector (Phase 18 §1) — BLANK_HAULER_CODE is used instead
    // to exercise the same "never leak the raw DomainError.message" guard.
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole('button', { name: 'Add Front' }))
    await user.selectOptions(screen.getByLabelText('Front No'), '01')
    await user.click(screen.getByRole('button', { name: 'Save Front' }))
    expect(screen.queryByText(/HaulerCode must not be blank/)).not.toBeInTheDocument()
    expect(
      screen.getAllByRole('alert').some((node) => node.textContent === 'Select a Hauler.'),
    ).toBe(true)
  })
})
