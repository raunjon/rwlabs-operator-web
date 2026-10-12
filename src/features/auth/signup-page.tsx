import { zodResolver } from '@hookform/resolvers/zod'
import { Link, useNavigate } from '@tanstack/react-router'
import { useForm } from 'react-hook-form'
import { InternalLinks } from '@/components/internal-links'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { config } from '@/config'
import { homePath } from '@/lib/session/session'
import { signUpFailure, useSignUp, type SignUpFailure } from './session-actions'
import { PASSWORD_MIN_LENGTH, signupSchema, type SignupFields } from './signup-schema'

const PASSWORD_HINT = `At least ${PASSWORD_MIN_LENGTH} characters`

// Self-serve signup: an organisation and its first admin in one form, signed in on success (OW-4). The browser
// checks each field (signupSchema) so those messages sit next to their field; what the server refuses is one
// message shown above the button, with a way out for the two conflicts it reports.
export function SignupPage() {
  const navigate = useNavigate()
  const signUp = useSignUp()
  const form = useForm<SignupFields>({
    resolver: zodResolver(signupSchema),
    defaultValues: { tenantName: '', firstName: '', lastName: '', email: '', password: '', confirmPassword: '' },
  })
  const { errors } = form.formState
  const busy = signUp.isPending

  function submit({ tenantName, firstName, lastName, email, password }: SignupFields) {
    signUp.mutate(
      { tenantName, firstName, lastName, email, password },
      { onSuccess: (session) => navigate({ href: homePath(session.role), replace: true }) },
    )
  }

  const field = (name: keyof SignupFields, label: string, hint?: string) => ({
    id: `signup-${name}`,
    label,
    hint,
    error: errors[name]?.message,
  })
  const control = (name: keyof SignupFields) => ({ ...form.register(name), disabled: busy })

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-4 py-12">
      <p className="text-lg font-semibold">{config.productName} Operator</p>
      <Card className="w-full max-w-md">
        <CardHeader>
          <h1 className="text-xl leading-none font-semibold">Create your account</h1>
          <CardDescription>Set up your organisation and its first admin account.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={form.handleSubmit(submit)} noValidate className="space-y-4">
            <Field {...field('tenantName', 'Organisation name')}>
              <Input type="text" autoComplete="organization" {...control('tenantName')} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field {...field('firstName', 'First name')}>
                <Input type="text" autoComplete="given-name" {...control('firstName')} />
              </Field>
              <Field {...field('lastName', 'Last name')}>
                <Input type="text" autoComplete="family-name" {...control('lastName')} />
              </Field>
            </div>
            <Field {...field('email', 'Email')}>
              <Input type="email" autoComplete="email" {...control('email')} />
            </Field>
            <Field {...field('password', 'Password', PASSWORD_HINT)}>
              <Input type="password" autoComplete="new-password" {...control('password')} />
            </Field>
            <Field {...field('confirmPassword', 'Confirm password')}>
              <Input type="password" autoComplete="new-password" {...control('confirmPassword')} />
            </Field>
            {signUp.isError && <FailureAlert failure={signUpFailure(signUp.error)} />}
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? 'Creating account…' : 'Create account'}
            </Button>
          </form>
        </CardContent>
      </Card>
      <p className="text-sm text-muted-foreground">
        Already have an account?{' '}
        <Link to="/login" search={{}} className="text-link underline-offset-4 hover:underline">
          Sign in
        </Link>
      </p>
      <footer className="mt-6">
        <InternalLinks className="flex gap-4 text-xs text-muted-foreground" />
      </footer>
    </main>
  )
}

function FailureAlert({ failure }: { failure: SignUpFailure }) {
  const linkClass = 'text-link underline-offset-4 hover:underline'
  return (
    <Alert variant="destructive">
      <AlertDescription>
        <p>{failure.message}</p>
        {failure.kind === 'email-taken' && (
          <p>
            <Link to="/login" search={{}} className={linkClass}>
              Sign in
            </Link>{' '}
            to that account, or{' '}
            <a href="/forgot-password" className={linkClass}>
              reset your password
            </a>
            .
          </p>
        )}
        {failure.kind === 'created-not-signed-in' && (
          <p>
            <Link to="/login" search={{}} className={linkClass}>
              Sign in
            </Link>
          </p>
        )}
      </AlertDescription>
    </Alert>
  )
}
