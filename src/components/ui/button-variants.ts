import { cva } from 'class-variance-authority'

export const buttonVariants = cva(
  'ui-button type-button inline-flex items-center justify-center gap-2 whitespace-nowrap disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-accent/60',
  {
    variants: {
      variant: {
        primary: 'bg-[var(--qps-primary-action)] text-[var(--qps-primary-action-foreground)] hover:opacity-90',
        focus: 'bg-focus-accent text-focus-accent-foreground hover:bg-focus-accent/85',
        secondary: 'bg-secondary-action text-foreground hover:bg-secondary-action/80',
        ghost: 'hover:bg-muted',
      },
      size: {
        sm: 'h-9 px-3 text-sm min-w-9',
        default: 'h-11 px-4 min-w-11',
        lg: 'h-14 px-6 text-[15px] min-w-14',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'default',
    },
  },
)
