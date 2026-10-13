import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { roleLabel } from '@/features/auth/invitation'
import type { CreatedInvitation } from './api'
import { acceptLink, INVITE_ROLES, inviteFailure, useCreateInvitation } from './invite'
import { inviteSchema, type InviteFields } from './invite-schema'

const ROLE_HINT = 'Event and lead managers can’t use this panel yet.'
const EMPTY: InviteFields = { email: '', role: 'admin' }

// Invites someone to the admin's organisation (OW-7) and shows the new invitation's accept link, so the admin can
// pass it on themselves. The form clears after each invite; the last link stays until the next one is created.
export function InviteCard() {
  const create = useCreateInvitation()
  const [last, setLast] = useState<CreatedInvitation | null>(null)
  const form = useForm<InviteFields>({ resolver: zodResolver(inviteSchema), defaultValues: EMPTY })
  const { errors } = form.formState
  const busy = create.isPending

  function submit(fields: InviteFields) {
    create.mutate(fields, {
      onSuccess: (invitation) => {
        setLast(invitation)
        form.reset(EMPTY)
      },
    })
  }

  return (
    <section aria-labelledby="invite-heading">
      <Card>
        <CardHeader>
          <h2 id="invite-heading" className="font-semibold">
            Invite a team member
          </h2>
          <CardDescription>They get a link to set up their account in your organisation.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <form onSubmit={form.handleSubmit(submit)} noValidate className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
              <Field id="invite-email" label="Email" error={errors.email?.message}>
                <Input type="email" autoComplete="off" {...form.register('email')} disabled={busy} />
              </Field>
              <Field id="invite-role" label="Role" hint={ROLE_HINT} error={errors.role?.message}>
                <NativeSelect {...form.register('role')} disabled={busy}>
                  {INVITE_ROLES.map((role) => (
                    <option key={role} value={role}>
                      {roleLabel(role)}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            </div>
            {create.isError && (
              <Alert variant="destructive">
                <AlertDescription>{inviteFailure(create.error)}</AlertDescription>
              </Alert>
            )}
            <Button type="submit" disabled={busy}>
              {busy ? 'Sending invite…' : 'Send invite'}
            </Button>
          </form>
          {/* Keyed by the invitation so the copy state starts over for each new one. */}
          {last && <CreatedInvitationSummary key={`${last.email}:${last.acceptToken}`} invitation={last} />}
        </CardContent>
      </Card>
    </section>
  )
}

const expiryFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'long', timeStyle: 'short' })

function CreatedInvitationSummary({ invitation }: { invitation: CreatedInvitation }) {
  return (
    <div role="status" aria-label="Invitation created" className="space-y-3 rounded-sm border px-4 py-3 text-sm">
      <p className="font-medium">Invitation created</p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        <dt className="text-muted-foreground">Email</dt>
        <dd className="font-medium break-all">{invitation.email}</dd>
        <dt className="text-muted-foreground">Role</dt>
        <dd className="font-medium">{roleLabel(invitation.role)}</dd>
      </dl>
      {invitation.expiresAt !== null && (
        <p className="text-muted-foreground">Expires {expiryFormat.format(invitation.expiresAt)}.</p>
      )}
      {invitation.acceptToken ? (
        <CopyableLink link={acceptLink(invitation.acceptToken)} />
      ) : (
        <p className="text-muted-foreground">
          The server didn’t send the accept link, so it can’t be shown here. The invitation still exists.
        </p>
      )}
    </div>
  )
}

function CopyableLink({ link }: { link: string }) {
  const [copy, setCopy] = useState<'idle' | 'copied' | 'failed'>('idle')

  // navigator.clipboard is missing outside secure contexts (plain http on a LAN host), hence the optional call.
  async function copyLink() {
    try {
      if (!navigator.clipboard) throw new Error('Clipboard unavailable')
      await navigator.clipboard.writeText(link)
      setCopy('copied')
    } catch {
      setCopy('failed')
    }
  }

  return (
    <div className="space-y-2">
      <Label htmlFor="invite-link">Accept link</Label>
      <div className="flex gap-2">
        <Input id="invite-link" readOnly value={link} onFocus={(event) => event.currentTarget.select()} />
        <Button type="button" variant="outline" onClick={() => void copyLink()}>
          Copy link
        </Button>
      </div>
      {copy === 'copied' && <p className="text-muted-foreground">Link copied</p>}
      {copy === 'failed' && <p className="text-destructive">Couldn’t copy. Select the link and copy it.</p>}
    </div>
  )
}
