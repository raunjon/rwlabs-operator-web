import { createFileRoute } from '@tanstack/react-router'
import { TenantHome } from '@/features/shell/home-pages'

export const Route = createFileRoute('/_authenticated/t/')({
  component: TenantHome,
})
