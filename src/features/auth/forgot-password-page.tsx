import { zodResolver } from '@hookform/resolvers/zod'
import { Link } from '@tanstack/react-router'
import { useForm } from 'react-hook-form'
import { InternalLinks } from '@/components/internal-links'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { config } from '@/config'
import { forgotPasswordSchema, type ForgotPasswordFields } from './forgot-password-schema'
import { FORGOT_PASSWORD_NEUTRAL_MESSAGE, forgotFailure, useForgotPassword } from './password-reset'

const linkClass = 'text-link underline-offset-4 hover:underline'

// Where an operator comes to ask for a reset email (OW-6). The server always answers 200 with a neutral message
// so the page can't be used to find out which emails have accounts; the UI shows the same confirmation whatever
// the typed email, and only reveals a failure when the request itself didn't go through.
export function ForgotPasswordPage() {
  const forgot = useForgotPassword()
  const form = useForm<ForgotPasswordFields>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
  })
  const { errors } = form.formState
  const busy = forgot.isPending
  const sent = forgot.isSuccess

  function submit({ email }: ForgotPasswordFields) {
    forgot.mutate(email.trim())
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-4 py-12">
      <p className="text-lg font-semibold">{config.productName} Operator</p>
      <Card className="w-full max-w-sm">
        <CardHeader>
          <h1 className="text-xl leading-none font-semibold">Reset your password</h1>
          <CardDescription>
            Enter your email and we’ll send a link to set a new password. The link works once and lasts an hour.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {sent ? (
            <div className="space-y-4">
              <Alert variant="success">
                <AlertDescription>{FORGOT_PASSWORD_NEUTRAL_MESSAGE}</AlertDescription>
              </Alert>
              <p className="text-sm text-muted-foreground">
                Didn’t get it?{' '}
                <button
                  type="button"
                  className={linkClass}
                  onClick={() => {
                    forgot.reset()
                    form.reset()
                  }}
                >
                  Try a different email
                </button>
                .
              </p>
            </div>
          ) : (
            <form onSubmit={form.handleSubmit(submit)} noValidate className="space-y-4">
              <Field
                id="forgot-email"
                label="Email"
                error={errors.email?.message}
              >
                <Input type="email" autoComplete="email" {...form.register('email')} disabled={busy} />
              </Field>
              {forgot.isError && (
                <Alert variant="destructive">
                  <AlertDescription>{forgotFailure(forgot.error).message}</AlertDescription>
                </Alert>
              )}
              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? 'Sending link…' : 'Send reset link'}
              </Button>
            </form>
          )}
        </CardContent>
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
