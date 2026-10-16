import { createFileRoute } from '@tanstack/react-router'
import { NewVenuePage } from '@/features/venues/venue-pages'

export const Route = createFileRoute('/_authenticated/admin/venues/new')({
  component: NewVenuePage,
})
