import { createFileRoute } from '@tanstack/react-router'
import { NewEventPage } from '@/features/events/event-pages'

export const Route = createFileRoute('/_authenticated/admin/events/new')({
  component: () => <NewEventPage area="admin" />,
})
