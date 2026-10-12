import { Link } from '@tanstack/react-router'
import { config } from '@/config'
import { cn } from '@/lib/utils'

// Links to the internal pages (style guide, system health). Rendered only where config.showInternalPages is on:
// staging and local development, never production.
const LINKS = [
  { label: 'Style guide', to: '/style-guide' },
  { label: 'System health', to: '/health' },
] as const

export function InternalLinks({ className, linkClassName }: { className?: string; linkClassName?: string }) {
  if (!config.showInternalPages) return null
  return (
    <ul className={className}>
      {LINKS.map((link) => (
        <li key={link.to}>
          <Link to={link.to} className={cn('underline-offset-4 hover:underline', linkClassName)}>
            {link.label}
          </Link>
        </li>
      ))}
    </ul>
  )
}
