import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const alertVariants = cva(
  'relative grid w-full grid-cols-[0_1fr] items-start gap-y-1 rounded-sm border px-4 py-3 text-sm has-[>svg]:grid-cols-[1rem_1fr] has-[>svg]:gap-x-3 [&>svg]:size-4 [&>svg]:translate-y-0.5',
  {
    variants: {
      variant: {
        default: 'bg-card text-card-foreground',
        info: 'border-info-border bg-info-subtle [&>svg]:text-info *:data-[slot=alert-title]:text-info',
        success:
          'border-success-border bg-success-subtle [&>svg]:text-success *:data-[slot=alert-title]:text-success',
        warning:
          'border-warning-border bg-warning-subtle [&>svg]:text-warning *:data-[slot=alert-title]:text-warning',
        destructive:
          'border-destructive-border bg-destructive-subtle [&>svg]:text-destructive *:data-[slot=alert-title]:text-destructive',
      },
    },
    defaultVariants: { variant: 'default' },
  },
)

// Errors interrupt screen readers (role="alert"); everything else is announced politely (role="status").
export function Alert({
  className,
  variant,
  role,
  ...props
}: React.ComponentProps<'div'> & VariantProps<typeof alertVariants>) {
  return (
    <div
      data-slot="alert"
      role={role ?? (variant === 'destructive' ? 'alert' : 'status')}
      className={cn(alertVariants({ variant }), className)}
      {...props}
    />
  )
}

export function AlertTitle({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="alert-title" className={cn('col-start-2 font-medium', className)} {...props} />
}

export function AlertDescription({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="alert-description"
      className={cn('col-start-2 grid justify-items-start gap-1 text-foreground [&_p]:leading-relaxed', className)}
      {...props}
    />
  )
}
