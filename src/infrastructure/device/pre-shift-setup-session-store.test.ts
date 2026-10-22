import { describe, expect, it } from 'vitest'
import {
  clearPreShiftSetupSession,
  readPreShiftSetupSession,
  savePreShiftSetupSession,
} from './pre-shift-setup-session-store'

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

describe('pre-shift setup session store', () => {
  it('recovers an unfinished sample draft and clears it only after activation', () => {
    const storage = createStorage()
    const draft = {
      shift: { id: 'SHIFT-1' },
      outcome: {
        pileRegistrations: [{ pileId: 'S5_24', batch: 6, rit: 6, sampleInHouse: 3 }],
      },
    }

    savePreShiftSetupSession(draft, storage)
    expect(readPreShiftSetupSession<typeof draft>(storage)).toEqual(draft)

    clearPreShiftSetupSession(storage)
    expect(readPreShiftSetupSession<typeof draft>(storage)).toBeUndefined()
  })
})
