import { createFileRoute } from '@tanstack/react-router'
import { AdminHome } from '@/features/shell/home-pages'

export const Route = createFileRoute('/_authenticated/admin/')({
  component: AdminHome,
})
