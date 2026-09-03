import type { Brand } from './brand'
import { createNonBlankStringParser } from './validators'

/**
 * Language-neutral shift code (e.g. "D" / "N"). The exact set of valid
 * codes is not confirmed operational requirement yet, so no fixed
 * enumeration is enforced here — only that the value is a real code.
 */
export type ShiftCode = Brand<string, 'ShiftCode'>

/** Language-neutral sector code (e.g. "BR1"). */
export type SectorCode = Brand<string, 'SectorCode'>

/** Language-neutral sampling house/location code. */
export type SamplingHouseCode = Brand<string, 'SamplingHouseCode'>

/**
 * Language-neutral ore code (e.g. "SAP", "LIM"). Phase 2 only validates
 * that the code is a real value — master-data configuration of ore
 * codes belongs to Phase 3.
 */
export type OreCode = Brand<string, 'OreCode'>

export const parseShiftCode = createNonBlankStringParser('ShiftCode', 'BLANK_SHIFT_CODE')
export const parseSectorCode = createNonBlankStringParser('SectorCode', 'BLANK_SECTOR_CODE')
export const parseSamplingHouseCode = createNonBlankStringParser('SamplingHouseCode', 'BLANK_SAMPLING_HOUSE_CODE')
export const parseOreCode = createNonBlankStringParser('OreCode', 'BLANK_ORE_CODE')
