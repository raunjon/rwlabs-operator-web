import { createFileRoute } from '@tanstack/react-router'
import { StyleGuidePage } from '@/features/style-guide/style-guide-page'

export const Route = createFileRoute('/style-guide')({
  component: StyleGuidePage,
})
