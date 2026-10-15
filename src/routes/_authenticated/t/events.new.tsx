import { createFileRoute } from '@tanstack/react-router'
import { NewEventPage } from '@/features/events/event-pages'

export const Route = createFileRoute('/_authenticated/t/events/new')({
  component: () => <NewEventPage area="tenant" />,
})
