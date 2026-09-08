import type { Brand } from './brand'
import { createNonBlankStringParser } from './validators'

export type ShiftId = Brand<string, 'ShiftId'>
export type PileId = Brand<string, 'PileId'>
export type TruckId = Brand<string, 'TruckId'>
export type FrontId = Brand<string, 'FrontId'>
export type FleetId = Brand<string, 'FleetId'>
export type EmployeeId = Brand<string, 'EmployeeId'>
export type HaulageTransactionId = Brand<string, 'HaulageTransactionId'>
export type SampleHandlingId = Brand<string, 'SampleHandlingId'>
export type SamplePositionId = Brand<string, 'SamplePositionId'>
export type ProductionCorrectionId = Brand<string, 'ProductionCorrectionId'>

export const parseShiftId = createNonBlankStringParser('ShiftId', 'BLANK_SHIFT_ID')
export const parsePileId = createNonBlankStringParser('PileId', 'BLANK_PILE_ID')
export const parseTruckId = createNonBlankStringParser('TruckId', 'BLANK_TRUCK_ID')
export const parseFrontId = createNonBlankStringParser('FrontId', 'BLANK_FRONT_ID')
export const parseFleetId = createNonBlankStringParser('FleetId', 'BLANK_FLEET_ID')
export const parseEmployeeId = createNonBlankStringParser('EmployeeId', 'BLANK_EMPLOYEE_ID')
export const parseHaulageTransactionId = createNonBlankStringParser(
  'HaulageTransactionId',
  'BLANK_HAULAGE_TRANSACTION_ID',
)
export const parseSampleHandlingId = createNonBlankStringParser('SampleHandlingId', 'BLANK_SAMPLE_HANDLING_ID')
export const parseSamplePositionId = createNonBlankStringParser('SamplePositionId', 'BLANK_SAMPLE_POSITION_ID')
export const parseProductionCorrectionId = createNonBlankStringParser(
  'ProductionCorrectionId',
  'BLANK_PRODUCTION_CORRECTION_ID',
)
