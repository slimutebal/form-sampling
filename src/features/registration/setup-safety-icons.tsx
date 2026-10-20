import type { ReactNode } from 'react'
import type { LucideProps } from 'lucide-react'
import truckIconUrl from '@/assets/icons/truck.svg'

type SafetyIconProps = LucideProps & { readonly children: ReactNode }

/**
 * Shared mobile-safe outline treatment for the Active Setup icons. Keeping
 * the frame local avoids mixing illustration-like glyphs with the app's
 * compact line-icon language.
 */
function SafetyIconFrame({ children, size = 24, strokeWidth = 1.8, ...props }: SafetyIconProps) {
  return (
    <svg
      {...props}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  )
}

/** One helmeted field worker with a compact safety-shield overlay. */
export function ManpowerSafetyIcon(props: LucideProps) {
  return (
    <SafetyIconFrame data-icon="manpower-safety" {...props}>
      <path d="M5.4 9.1h9.2" />
      <path d="M6.1 9.1a3.9 3.9 0 0 1 7.8 0" />
      <path d="M10 5.2v3.9" />
      <path d="M6.2 10.1v1.2a3.8 3.8 0 0 0 7.6 0v-1.2" />
      <path d="M4.4 20v-1.3a5.6 5.6 0 0 1 11.2 0V20" />
      <g data-part="safety-shield">
        <path d="m16.7 13.2 3.6 1.4v2.2c0 1.8-1.2 3.3-3.6 4.2-2.4-.9-3.6-2.4-3.6-4.2v-2.2z" />
        <path d="m15.1 16.8 1 1 2-2.2" />
      </g>
    </SafetyIconFrame>
  )
}

/** Compact hand trowel and a clear pile of sampled material. */
export function SampleSafetyIcon(props: LucideProps) {
  return (
    <SafetyIconFrame data-icon="sample-safety" {...props}>
      <path d="m11 16.1 2.2-6.5 4.3 4.3z" />
      <path d="m15.7 9.1 3.8-3.8" />
      <path d="m18.3 4 1.5-1.5a1.7 1.7 0 0 1 2.4 2.4L20.7 6.4" />
      <g data-part="ore-pile">
        <path d="M3 20.5h18" />
        <path d="m5 20.5 4.2-4.6 2.8 2.8 2.5-3.2 4.5 5" />
        <path d="m7.1 19.2.1.1M11.4 17.9l.1.1M16.3 18.8l.1.1" />
      </g>
    </SafetyIconFrame>
  )
}

/** The supplied Fleet icon is kept as an external SVG asset so Vite bundles it. */
export function FleetSafetyIcon(props: LucideProps) {
  return (
    <SafetyIconFrame data-icon="fleet-safety" {...props}>
      <image data-asset="truck-icon" href={truckIconUrl} x="0" y="2.4" width="24" height="19.2" preserveAspectRatio="xMidYMid meet" />
    </SafetyIconFrame>
  )
}
