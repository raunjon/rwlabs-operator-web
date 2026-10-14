import { createFileRoute } from '@tanstack/react-router'
import { MetaSettingsPage } from '@/features/meta/meta-settings-page'

export const Route = createFileRoute('/_authenticated/t/settings/meta')({
  component: MetaSettingsPage,
})
