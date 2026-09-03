import type { Brand } from '../common/brand'
import { createNonBlankStringParser } from '../common/validators'

/** Language-neutral crew code (`Emply_Crew` master). */
export type CrewCode = Brand<string, 'CrewCode'>

/** Language-neutral location code (`Location` master). */
export type LocationCode = Brand<string, 'LocationCode'>

/**
 * Language-neutral pile-area code (`Pile_area` master). Distinct from
 * PileId — a pile area/stockpile is a master concept a pile can
 * reference, not the pile itself.
 */
export type PileAreaCode = Brand<string, 'PileAreaCode'>

/** Language-neutral hauler code (`Hauler_PT` master). */
export type HaulerCode = Brand<string, 'HaulerCode'>

export const parseCrewCode = createNonBlankStringParser('CrewCode', 'BLANK_CREW_CODE')
export const parseLocationCode = createNonBlankStringParser('LocationCode', 'BLANK_LOCATION_CODE')
export const parsePileAreaCode = createNonBlankStringParser('PileAreaCode', 'BLANK_PILE_AREA_CODE')
export const parseHaulerCode = createNonBlankStringParser('HaulerCode', 'BLANK_HAULER_CODE')
