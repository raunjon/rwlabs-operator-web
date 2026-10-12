import * as React from 'react'
import { cn } from '@/lib/utils'

// A placeholder block shown while data loads (spec §7). Size it with className; wrap a group in an element with
// role="status" and a label so screen readers hear that something is loading.
export function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="skeleton" className={cn('animate-pulse rounded-sm bg-muted', className)} {...props} />
}
