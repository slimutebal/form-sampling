import { useLayoutEffect, useRef } from 'react'
import { cn } from '@/components/ui/cn'

interface AutoFitSingleLineTextProps {
  readonly text: string
  /** Lower bound in px so the label stays readable; the class-defined font size is the upper bound. */
  readonly minFontSize?: number
  readonly className?: string
}

/**
 * Keeps `text` on one line, fully visible, inside the width it is given by shrinking only
 * its font size. The font size resolved from `className` is the maximum, so short text looks
 * exactly as before; the box itself is never resized and text is never truncated or wrapped.
 */
export function AutoFitSingleLineText({ text, minFontSize = 10, className }: AutoFitSingleLineTextProps) {
  const containerRef = useRef<HTMLSpanElement>(null)
  const labelRef = useRef<HTMLSpanElement>(null)

  useLayoutEffect(() => {
    const container = containerRef.current
    const label = labelRef.current
    if (!container || !label) return
    const fit = () => fitFontSize(container, label, minFontSize)
    fit()
    void document.fonts?.ready.then(fit)
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(fit)
    observer.observe(container)
    return () => observer.disconnect()
  }, [text, minFontSize])

  return <span ref={containerRef} className={cn('block min-w-0 overflow-hidden', className)}>
    <span ref={labelRef} className="inline-block whitespace-nowrap">{text}</span>
  </span>
}

/** Binary-searches the largest font size between `minFontSize` and the inherited size that fits the container. */
function fitFontSize(container: HTMLElement, label: HTMLElement, minFontSize: number) {
  label.style.fontSize = ''
  const available = container.clientWidth
  const maxFontSize = parseFloat(getComputedStyle(label).fontSize)
  if (!available || !maxFontSize || label.getBoundingClientRect().width <= available) return

  let low = Math.min(minFontSize, maxFontSize)
  let high = maxFontSize
  for (let step = 0; step < 10; step++) {
    const middle = (low + high) / 2
    label.style.fontSize = middle + 'px'
    if (label.getBoundingClientRect().width <= available) low = middle
    else high = middle
  }
  label.style.fontSize = low + 'px'
}
