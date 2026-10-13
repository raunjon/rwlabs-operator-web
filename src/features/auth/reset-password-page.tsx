import { zodResolver } from '@hookform/resolvers/zod'
import { useQueryClient } from '@tanstack/react-query'
import { getRouteApi, Link, useNavigate } from '@tanstack/react-router'
import { useForm } from 'react-hook-form'
import { InternalLinks } from '@/components/internal-links'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { config } from '@/config'
import { PASSWORD_MIN_LENGTH } from './form-rules'
import {
  isResetTokenInvalid,
  markResetTokenInvalid,
  RESET_LINK_INVALID_MESSAGE,
  resetFailure,
  useResetPassword,
} from './password-reset'
import { resetPasswordSchema, type ResetPasswordFields } from './reset-password-schema'

const PASSWORD_HINT = `At least ${PASSWORD_MIN_LENGTH} characters`
const linkClass = 'text-link underline-offset-4 hover:underline'

const route = getRouteApi('/password/reset')

// Where an operator lands from the reset email (OW-6). The path and ?token= are fixed by auth's email template,
// so neither must change. A missing or already-used link is shown as such with a button to request a new one;
// otherwise the user picks a new password and is sent to the login page with a success flag.
export function ResetPasswordPage() {
  const { token } = route.useSearch()
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-4 py-12">
      <p className="text-lg font-semibold">{config.productName} Operator</p>
      <Card className="w-full max-w-sm">
        {token ? <ResetForm token={token} /> : <InvalidLink />}
      </Card>
      <p className="text-sm text-muted-foreground">
        Remembered it?{' '}
        <Link to="/login" search={{}} className={linkClass}>
          Sign in
        </Link>
      </p>
      <footer className="mt-6">
        <InternalLinks className="flex gap-4 text-xs text-muted-foreground" />
      </footer>
    </main>
  )
}

function ResetForm({ token }: { token: string }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const reset = useResetPassword()
  const form = useForm<ResetPasswordFields>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: '', confirmPassword: '' },
  })
  const { errors } = form.formState
  const busy = reset.isPending
  const failure = reset.isError ? resetFailure(reset.error) : null

  // A token the server has already rejected stays rejected: Back must not resurrect a usable form (AGENTS.md §4).
  if (failure?.kind === 'invalid' || isResetTokenInvalid(queryClient, token)) return <InvalidLink />

  function submit({ password }: ResetPasswordFields) {
    reset.mutate(
      { token, password },
      {
        onSuccess: () => navigate({ to: '/login', search: { reason: 'password-updated' }, replace: true }),
        onError: (error) => {
          if (resetFailure(error).kind === 'invalid') markResetTokenInvalid(queryClient, token)
        },
      },
    )
  }

  const field = (name: keyof ResetPasswordFields, label: string, hint?: string) => ({
    id: `reset-${name}`,
    label,
    hint,
    error: errors[name]?.message,
  })
  const control = (name: keyof ResetPasswordFields) => ({ ...form.register(name), disabled: busy })

  return (
    <>
      <CardHeader>
        <h1 className="text-xl leading-none font-semibold">Choose a new password</h1>
        <CardDescription>Set a new password to sign back in.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={form.handleSubmit(submit)} noValidate className="space-y-4">
          <Field {...field('password', 'New password', PASSWORD_HINT)}>
            <Input type="password" autoComplete="new-password" {...control('password')} />
          </Field>
          <Field {...field('confirmPassword', 'Confirm new password')}>
            <Input type="password" autoComplete="new-password" {...control('confirmPassword')} />
          </Field>
          {failure && (
            <Alert variant="destructive">
              <AlertDescription>{failure.message}</AlertDescription>
            </Alert>
          )}
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? 'Updating…' : 'Update password'}
          </Button>
        </form>
      </CardContent>
    </>
  )
}

// Missing, unknown, used or expired links all look the same to the server, so they do here too.
function InvalidLink() {
  return (
    <>
      <CardHeader>
        <h1 className="text-xl leading-none font-semibold">This reset link can’t be used</h1>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert variant="destructive">
          <AlertDescription>{RESET_LINK_INVALID_MESSAGE}</AlertDescription>
        </Alert>
        <Button asChild className="w-full">
          <Link to="/password/forgot" replace>Request a new link</Link>
        </Button>
      </CardContent>
    </>
  )
}
