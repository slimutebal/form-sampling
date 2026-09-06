const PILE_MASTER_ERROR_TRANSLATION_KEYS: Readonly<Record<string, string>> = {
  BLANK_PILE_ID: 'pileMaster.errors.pileIdRequired',
  BLANK_PILE_AREA_CODE: 'pileMaster.errors.stockpileRequired',
  BLANK_ORE_CODE: 'pileMaster.errors.oreRequired',
  DUPLICATE_PILE_AREA_PILE_ID: 'pileMaster.errors.duplicatePileId',
  ORE_SAMPLING_CONFIG_NOT_FOUND: 'pileMaster.errors.unknownOre',
  PILE_MASTER_CREATION_REQUIRES_CONNECTION: 'pileMaster.errors.requiresConnection',
  PILE_ID_PATTERN_NOT_SUPPORTED: 'pileMaster.errors.patternNotSupported',
  PILE_ID_SECTOR_MISMATCH: 'pileMaster.errors.sectorMismatch',
  APPS_SCRIPT_PILE_WRITE_UNVERIFIED: 'pileMaster.errors.writeUnverified',
  DUPLICATE_PILE_ID: 'pileMaster.errors.duplicatePileId',
}

export function pileMasterErrorTranslationKey(code: string): string {
  return PILE_MASTER_ERROR_TRANSLATION_KEYS[code] ?? 'pileMaster.errors.generic'
}
