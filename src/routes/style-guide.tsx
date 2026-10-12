import { createFileRoute, notFound } from '@tanstack/react-router'
import { config } from '@/config'
import { StyleGuidePage } from '@/features/style-guide/style-guide-page'

export const Route = createFileRoute('/style-guide')({
  // Internal page: not served in production builds (config.showInternalPages).
  beforeLoad: () => {
    if (!config.showInternalPages) throw notFound()
  },
  component: StyleGuidePage,
})
