import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AutoFitSingleLineText } from './AutoFitSingleLineText'

// jsdom has no layout engine: model a glyph run as 0.6em per character.
const GLYPH_RATIO = 0.6
const INHERITED_FONT_SIZE = 16

let availableWidth = 100
let resizeCallback: (() => void) | undefined

function stubLayout() {
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() => availableWidth)
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const size = parseFloat(this.style.fontSize) || INHERITED_FONT_SIZE
    const width = (this.textContent?.length ?? 0) * size * GLYPH_RATIO
    return { width, height: size, top: 0, left: 0, right: width, bottom: size, x: 0, y: 0, toJSON: () => ({}) } as DOMRect
  })
  vi.spyOn(window, 'getComputedStyle').mockReturnValue({ fontSize: INHERITED_FONT_SIZE + 'px' } as CSSStyleDeclaration)
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback: () => void) { resizeCallback = callback }
    observe() {}
    unobserve() {}
    disconnect() {}
  })
}

function labelFontSize(text: string): number {
  return parseFloat(screen.getByText(text).style.fontSize) || INHERITED_FONT_SIZE
}

describe('AutoFitSingleLineText', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    resizeCallback = undefined
    availableWidth = 100
  })

  it('keeps the label on one line without truncation', () => {
    stubLayout()
    render(<AutoFitSingleLineText text="BR-1" />)

    const label = screen.getByText('BR-1')
    expect(label.className).toContain('whitespace-nowrap')
    expect(label.className).not.toContain('truncate')
    expect(label.parentElement?.className).toContain('overflow-hidden')
  })

  it('keeps the class-defined font size when the text already fits', () => {
    stubLayout()
    render(<AutoFitSingleLineText text="BR-1" />)

    expect(screen.getByText('BR-1').style.fontSize).toBe('')
  })

  it('shrinks long text until the full text fits the available width', () => {
    stubLayout()
    const text = 'BR-01-ABCDEFGH'
    render(<AutoFitSingleLineText text={text} />)

    const size = labelFontSize(text)
    const fittingSize = availableWidth / (text.length * GLYPH_RATIO)
    expect(size).toBeLessThanOrEqual(fittingSize)
    expect(size).toBeGreaterThan(fittingSize - 0.5)
  })

  it('never shrinks below the minimum font size', () => {
    stubLayout()
    const text = 'BR-01-ABCDEFGHIJKLMNOPQRSTUVWXYZ'
    render(<AutoFitSingleLineText text={text} minFontSize={12} />)

    expect(labelFontSize(text)).toBe(12)
  })

  it('refits when the container size changes', () => {
    stubLayout()
    const text = 'BR-01-ABCDEFGH'
    render(<AutoFitSingleLineText text={text} />)
    const narrowSize = labelFontSize(text)

    availableWidth = 200
    act(() => resizeCallback?.())

    expect(labelFontSize(text)).toBe(INHERITED_FONT_SIZE)
    expect(narrowSize).toBeLessThan(INHERITED_FONT_SIZE)
  })
})
