import { describe, expect, it } from 'vitest'
import type { MasterData } from '@/domain/master/master-data'
import { validateFleetDestinationMaterials } from './fleet-destination-material'

const masterData = {
  pileAreas: [
    { pileId: 'S3_59', oreCode: 'SAP' },
    { pileId: 'S3_60', oreCode: 'SAP' },
    { pileId: 'L2_01', oreCode: 'LIM' },
  ],
} as unknown as MasterData

describe('validateFleetDestinationMaterials', () => {
  it('uses the first selected Pile master material as the Fleet material', () => {
    expect(validateFleetDestinationMaterials(masterData, ['S3_59'])).toMatchObject({ ok: true, value: 'SAP' })
  })

  it('accepts additional Piles with the same canonical material', () => {
    expect(validateFleetDestinationMaterials(masterData, ['S3_59', 'S3_60'])).toMatchObject({ ok: true, value: 'SAP' })
  })

  it('rejects mixed master-data materials before persistence', () => {
    expect(validateFleetDestinationMaterials(masterData, ['S3_59', 'L2_01'])).toMatchObject({ ok: false, error: { code: 'FLEET_DESTINATION_MATERIAL_MISMATCH' } })
  })

  it('rejects duplicate canonical Pile IDs at the command boundary', () => {
    expect(validateFleetDestinationMaterials(masterData, ['S3_59', 'S3_59'])).toMatchObject({ ok: false, error: { code: 'FLEET_DESTINATION_DUPLICATE' } })
  })
})
