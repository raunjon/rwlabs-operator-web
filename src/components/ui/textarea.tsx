import * as React from 'react'
import { cn } from '@/lib/utils'
import { fieldClasses } from './input'

export function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(fieldClasses, 'field-sizing-content min-h-20 py-2', className)}
      {...props}
    />
  )
}
