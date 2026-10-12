import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import { getRouteApi, Link, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { InternalLinks } from '@/components/internal-links'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { config } from '@/config'
import { homePath, useSession } from '@/lib/session/session'
import { acceptInvitationSchema, type AcceptInvitationFields } from './accept-invitation-schema'
import type { InvitationLookup } from './api'
import { PASSWORD_MIN_LENGTH } from './form-rules'
import { acceptFailure, INVITATION_INVALID_MESSAGE, invitationLookupQuery, roleLabel, useAcceptInvitation } from './invitation'
import { signOut } from './session-actions'

const PASSWORD_HINT = `At least ${PASSWORD_MIN_LENGTH} characters`
const linkClass = 'text-link underline-offset-4 hover:underline'

const route = getRouteApi('/invitations/accept')

// The page an invitation email links to (OW-5): shows who the invite is for, takes the invitee's name and
// password, and signs them in. The path and ?token= are fixed by the email template in auth.
export function AcceptInvitationPage() {
  const { token } = route.useSearch()
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-4 py-12">
      <p className="text-lg font-semibold">{config.productName} Operator</p>
      <Card className="w-full max-w-md">
        {token ? <Invitation token={token} /> : <InvalidInvitation />}
      </Card>
      <footer className="mt-6">
        <InternalLinks className="flex gap-4 text-xs text-muted-foreground" />
      </footer>
    </main>
  )
}

function Invitation({ token }: { token: string }) {
  const lookup = useQuery(invitationLookupQuery(token))
  if (lookup.isPending) return <LoadingInvitation />
  if (lookup.isError) {
    const failure = acceptFailure(lookup.error)
    if (failure.kind === 'invalid') return <InvalidInvitation />
    return (
      <CardContent className="space-y-4">
        <Alert variant="destructive">
          <AlertDescription>{failure.message}</AlertDescription>
        </Alert>
        <Button variant="outline" onClick={() => lookup.refetch()} disabled={lookup.isFetching}>
          Try again
        </Button>
      </CardContent>
    )
  }
  return <AcceptForm token={token} invitation={lookup.data} />
}

function LoadingInvitation() {
  return (
    <CardContent role="status" aria-label="Loading your invitation" className="space-y-4">
      <Skeleton className="h-6 w-2/3" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-9 w-full" />
      <Skeleton className="h-9 w-full" />
    </CardContent>
  )
}

// Used, revoked, expired or unknown links all look the same to the server, so they do here too.
function InvalidInvitation() {
  return (
    <>
      <CardHeader>
        <h1 className="text-xl leading-none font-semibold">This invitation can’t be used</h1>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert variant="destructive">
          <AlertDescription>{INVITATION_INVALID_MESSAGE}</AlertDescription>
        </Alert>
        <p className="text-sm text-muted-foreground">
          Already have an account?{' '}
          <Link to="/login" search={{}} className={linkClass}>
            Sign in
          </Link>
        </p>
      </CardContent>
    </>
  )
}

function AcceptForm({ token, invitation }: { token: string; invitation: InvitationLookup }) {
  const session = useSession()
  const navigate = useNavigate()
  const accept = useAcceptInvitation()
  // Set once the server says the link stopped working between lookup and accept.
  const [invalidated, setInvalidated] = useState(false)
  const form = useForm<AcceptInvitationFields>({
    resolver: zodResolver(acceptInvitationSchema),
    defaultValues: { firstName: '', lastName: '', password: '', confirmPassword: '' },
  })
  const { errors } = form.formState
  const busy = accept.isPending

  if (invalidated) return <InvalidInvitation />

  function submit({ firstName, lastName, password }: AcceptInvitationFields) {
    accept.mutate(
      { token, email: invitation.email, firstName, lastName, password },
      {
        onSuccess: (session) => navigate({ href: homePath(session.role), replace: true }),
        onError: (error) => {
          if (acceptFailure(error).kind === 'invalid') setInvalidated(true)
        },
      },
    )
  }

  const field = (name: keyof AcceptInvitationFields, label: string, hint?: string) => ({
    id: `invite-${name}`,
    label,
    hint,
    error: errors[name]?.message,
  })
  const control = (name: keyof AcceptInvitationFields) => ({ ...form.register(name), disabled: busy })

  return (
    <>
      <CardHeader>
        <h1 className="text-xl leading-none font-semibold">Join {invitation.tenantName}</h1>
        <CardDescription>Finish setting up your account to get started.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <InvitationSummary invitation={invitation} />
        {session ? (
          <Alert variant="info">
            <AlertDescription>
              <p>
                You’re signed in as {session.email}. Sign out to set up the account for {invitation.email}.
              </p>
              <Button type="button" variant="outline" size="sm" onClick={() => void signOut()}>
                Sign out and continue
              </Button>
            </AlertDescription>
          </Alert>
        ) : (
          <form onSubmit={form.handleSubmit(submit)} noValidate className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field {...field('firstName', 'First name')}>
                <Input type="text" autoComplete="given-name" {...control('firstName')} />
              </Field>
              <Field {...field('lastName', 'Last name')}>
                <Input type="text" autoComplete="family-name" {...control('lastName')} />
              </Field>
            </div>
            <Field {...field('password', 'Password', PASSWORD_HINT)}>
              <Input type="password" autoComplete="new-password" {...control('password')} />
            </Field>
            <Field {...field('confirmPassword', 'Confirm password')}>
              <Input type="password" autoComplete="new-password" {...control('confirmPassword')} />
            </Field>
            {accept.isError && <FailureAlert error={accept.error} />}
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? 'Creating account…' : 'Create account'}
            </Button>
          </form>
        )}
      </CardContent>
    </>
  )
}

const expiryFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'long', timeStyle: 'short' })

function InvitationSummary({ invitation }: { invitation: InvitationLookup }) {
  return (
    <div className="space-y-1 rounded-sm bg-muted px-3 py-2 text-sm">
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        <dt className="text-muted-foreground">Email</dt>
        <dd className="font-medium">{invitation.email}</dd>
        <dt className="text-muted-foreground">Role</dt>
        <dd className="font-medium">{roleLabel(invitation.role)}</dd>
      </dl>
      {invitation.expiresAt !== null && (
        <p className="text-muted-foreground">Expires {expiryFormat.format(invitation.expiresAt)}.</p>
      )}
    </div>
  )
}

function FailureAlert({ error }: { error: unknown }) {
  const failure = acceptFailure(error)
  const offerSignIn = failure.kind === 'email-taken' || failure.kind === 'created-not-signed-in'
  return (
    <Alert variant="destructive">
      <AlertDescription>
        <p>{failure.message}</p>
        {offerSignIn && (
          <p>
            <Link to="/login" search={{}} className={linkClass}>
              Sign in
            </Link>{' '}
            {failure.kind === 'email-taken' ? 'to that account instead.' : 'with your new email and password.'}
          </p>
        )}
      </AlertDescription>
    </Alert>
  )
}
