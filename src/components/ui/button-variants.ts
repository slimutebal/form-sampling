import { cva } from 'class-variance-authority'

export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
  {
    variants: {
      variant: {
        primary: 'bg-primary text-primary-foreground hover:opacity-90',
        secondary: 'bg-muted text-foreground hover:bg-muted/80',
        ghost: 'hover:bg-muted',
      },
      size: {
        default: 'h-11 px-4 min-w-11',
        lg: 'h-14 px-6 text-base min-w-14',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'default',
    },
  },
)
