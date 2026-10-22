import { describe, expect, it } from 'vitest'
import indexHtml from '../../index.html?raw'

describe('index.html viewport', () => {
  it('keeps browser zoom available while covering responsive and iOS safe-area requirements', () => {
    const viewportMatch = indexHtml.match(/<meta\s+name="viewport"\s+content="([^"]+)"/)
    expect(viewportMatch).not.toBeNull()

    const content = viewportMatch![1]
    expect(content).toContain('width=device-width')
    expect(content).toContain('initial-scale=1')
    expect(content).not.toContain('maximum-scale=1')
    expect(content).not.toContain('user-scalable=no')
    expect(content).toContain('viewport-fit=cover')
  })
})
