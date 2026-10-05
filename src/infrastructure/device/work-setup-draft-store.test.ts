import { describe, expect, it } from 'vitest'
import {
  clearWorkSetupDraft,
  readWorkSetupDraft,
  saveWorkSetupDraft,
} from './work-setup-draft-store'

function createStorage(): Storage {
  const values = new Map<string, string>()
  return {
    get length() { return values.size },
    clear() { values.clear() },
    getItem(key) { return values.get(key) ?? null },
    key(index) { return [...values.keys()][index] ?? null },
    removeItem(key) { values.delete(key) },
    setItem(key, value) { values.set(key, value) },
  }
}

describe('work setup draft store', () => {
  it('persists only stable Work Setup IDs and codes', () => {
    const storage = createStorage()
    saveWorkSetupDraft({
      step: 'WORK_SETUP',
      checkerPersonId: 'RAHARJO-1',
      shiftDate: '2026-09-04',
      shiftCode: 'DS',
      sectorCode: 'BR1',
      samplingHouseCode: 'SH_01',
      manpowerPersonIds: ['RAHARJO-1', 'CREW-4'],
    }, storage)

    expect(readWorkSetupDraft(storage)).toEqual({
      step: 'WORK_SETUP',
      checkerPersonId: 'RAHARJO-1',
      shiftDate: '2026-09-04',
      shiftCode: 'DS',
      sectorCode: 'BR1',
      samplingHouseCode: 'SH_01',
      manpowerPersonIds: ['RAHARJO-1', 'CREW-4'],
    })

    clearWorkSetupDraft(storage)
    expect(readWorkSetupDraft(storage)).toBeUndefined()
  })
})
