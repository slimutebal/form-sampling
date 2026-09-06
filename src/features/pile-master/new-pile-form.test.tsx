import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { parseOreCode, parseSectorCode } from '@/domain/common/codes'
import { parsePileId } from '@/domain/common/identifiers'
import { createMasterData, type MasterData } from '@/domain/master/master-data'
import { parsePileAreaCode } from '@/domain/master/master-codes'
import { createPileAreaReference } from '@/domain/master/references'
import { createOreSamplingConfig, parseBatchSize, parsePackingConfigValue, parseSamplingInterval } from '@/domain/master/sampling-config'
import { createPile } from '@/domain/pile/pile'
import { ok } from '@/domain/common/result'
import i18n from '@/i18n'
import { NewPileForm } from '@/features/pile-master/new-pile-form'

function value<T>(result: { ok: true; value: T } | { ok: false }): T {
  if (!result.ok) throw new Error('invalid test fixture')
  return result.value
}

function buildMasterData(): MasterData {
  const sap = value(parseOreCode('SAP'))
  return value(
    createMasterData({
      employees: [],
      crews: [],
      sectors: [],
      locations: [],
      samplingHouses: [],
      pileAreas: [],
      haulers: [],
      trucks: [],
      oreSamplingConfigs: [
        createOreSamplingConfig({
          oreCode: sap,
          interval: value(parseSamplingInterval(2)),
          batchSize: value(parseBatchSize(20)),
          packing: value(parsePackingConfigValue(2)),
        }),
      ],
    }),
  )
}

function setNavigatorOnLine(online: boolean) {
  Object.defineProperty(window.navigator, 'onLine', { value: online, configurable: true })
}

beforeEach(async () => {
  await i18n.changeLanguage('en')
  setNavigatorOnLine(true)
})

afterEach(() => {
  setNavigatorOnLine(true)
})

describe('NewPileForm', () => {
  it('derives and shows Sector/Stockpile/Ore from the Pile ID, with no manual Stockpile/Ore input', async () => {
    const user = userEvent.setup()
    const onCreated = vi.fn()
    const onSubmit = vi.fn(async (draft) =>
      ok({
        pile: createPile(value(parsePileId(draft.pileId)), value(parseOreCode('SAP'))),
        pileArea: createPileAreaReference(
          value(parseSectorCode('BR1')),
          value(parsePileAreaCode('LS_18')),
          value(parsePileId(draft.pileId)),
          value(parseOreCode('SAP')),
        ),
      }),
    )

    render(
      <NewPileForm
        initialPileId="L18_S99"
        sectorCode={value(parseSectorCode('BR1'))}
        masterData={buildMasterData()}
        onSubmit={onSubmit}
        onCreated={onCreated}
        onCancel={vi.fn()}
      />,
    )

    expect(screen.queryByLabelText('Stockpile')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Ore')).not.toBeInTheDocument()
    expect(screen.getAllByText('LS_18')).not.toHaveLength(0)
    expect(screen.getAllByText('SAP')).not.toHaveLength(0)

    await user.click(screen.getByRole('button', { name: 'Add' }))

    expect(onSubmit).toHaveBeenCalledWith({ pileId: 'L18_S99' })
    expect(onCreated).toHaveBeenCalledTimes(1)
  })

  it('blocks submission while offline, with a clear message, and never calls onSubmit', async () => {
    setNavigatorOnLine(false)
    const user = userEvent.setup()
    const onSubmit = vi.fn()

    render(
      <NewPileForm
        initialPileId="L18_S99"
        sectorCode={value(parseSectorCode('BR1'))}
        masterData={buildMasterData()}
        onSubmit={onSubmit}
        onCreated={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    expect(screen.getByText('Creating a new Pile requires an internet connection.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled()

    await user.click(screen.getByRole('button', { name: 'Add' }))
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('shows a translated error and disables submission for an unsupported Pile_ID naming pattern', async () => {
    const onSubmit = vi.fn()

    render(
      <NewPileForm
        initialPileId="WEIRD_LEGACY_NAME_01"
        sectorCode={value(parseSectorCode('BR1'))}
        masterData={buildMasterData()}
        onSubmit={onSubmit}
        onCreated={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    expect(
      screen.getByText(
        'This Pile ID naming pattern is not supported for new Piles yet. You can still select an existing Pile by its exact ID.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('shows a translated error for a duplicate Pile_ID, never a raw domain message', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn(async () => ({
      ok: false as const,
      error: { code: 'DUPLICATE_PILE_AREA_PILE_ID', message: 'Duplicate Pile_ID in master collection: L18_S99' },
    }))

    render(
      <NewPileForm
        initialPileId="L18_S99"
        sectorCode={value(parseSectorCode('BR1'))}
        masterData={buildMasterData()}
        onSubmit={onSubmit}
        onCreated={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Add' }))

    expect(await screen.findByText('This Pile ID already exists in master data.')).toBeInTheDocument()
    expect(screen.queryByText(/Duplicate Pile_ID in master collection/)).not.toBeInTheDocument()
  })
})
