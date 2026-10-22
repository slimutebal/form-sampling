import type { SVGProps } from 'react'

/** Geometry preserved from the original Figma REPORT SVG. */
export function NavReportIcon({ className = '', ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      fill="currentColor"
      className={['qps-nav-report', className].filter(Boolean).join(' ')}
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      <g className="qps-nav-report__chart">
        <path d="M8.34625 12.9578V6.34625H10.6537V12.9578L9.5 11.846L8.34625 12.9578ZM13.0192 14.823V2.34625H15.3267V12.5155L13.0192 14.823ZM3.654 17.6193V10.3463H5.9615V15.3115L3.654 17.6193Z" />
      </g>
      <g className="qps-nav-report__trend">
        <path d="M3.59625 20.8L9.46925 14.927L13.0192 17.977L19.1962 11.8H17.25V10.3H21.75V14.8H20.25V12.8538L13.0807 20.023L9.53075 16.973L5.70375 20.8H3.59625Z" />
      </g>
    </svg>
  )
}
