import { describe, expect, it } from 'vitest'
import { readFileAsArrayBuffer } from './read-file-as-array-buffer'

describe('readFileAsArrayBuffer', () => {
  it('reads a File’s exact bytes', async () => {
    const original = new Uint8Array([1, 2, 3, 4, 250, 251, 252])
    const file = new File([original], 'test.bin')

    const result = new Uint8Array(await readFileAsArrayBuffer(file))

    expect(Array.from(result)).toEqual(Array.from(original))
  })
})
