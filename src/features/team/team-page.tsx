import { InviteCard } from './invite-card'

// The tenant's team (OW-7): for now just the invite card. The invitations list (list, revoke, resend) joins it here.
export function TeamPage() {
  return (
    <div className="max-w-3xl space-y-6">
      <div className="space-y-1">
        <p className="text-sm text-muted-foreground">Your organisation</p>
        <h1 className="text-2xl font-semibold">Team</h1>
      </div>
      <InviteCard />
    </div>
  )
}
