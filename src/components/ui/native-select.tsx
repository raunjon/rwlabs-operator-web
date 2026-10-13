import * as React from 'react'
import { cn } from '@/lib/utils'
import { fieldClasses } from './input'

// The browser's own <select> in the shared field look: keyboard, screen reader and mobile pickers come for free.
// Set aria-invalid to show the error state.
export function NativeSelect({ className, ...props }: React.ComponentProps<'select'>) {
  return <select data-slot="native-select" className={cn(fieldClasses, 'h-9 py-1', className)} {...props} />
}
