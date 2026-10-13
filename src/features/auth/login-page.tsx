import { getRouteApi, Link, useNavigate } from '@tanstack/react-router'
import { useState, type FormEvent } from 'react'
import { InternalLinks } from '@/components/internal-links'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { config } from '@/config'
import { ApiError } from '@/lib/api/errors'
import { homePath } from '@/lib/session/session'
import { PASSWORD_UPDATED_MESSAGE } from './password-reset'
import { safeRedirect } from './redirect'
import { signInErrorMessage, useSignIn } from './session-actions'

const loginRoute = getRouteApi('/login')

export function LoginPage() {
  const { redirect: redirectTo, reason } = loginRoute.useSearch()
  const expired = reason === 'expired'
  const passwordUpdated = reason === 'password-updated'
  const navigate = useNavigate()
  const signIn = useSignIn()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    signIn.mutate(
      { email: email.trim(), password },
      {
        onSuccess: (session) => navigate({ href: safeRedirect(redirectTo) ?? homePath(session.role), replace: true }),
        // Keep the email, clear a wrong password.
        onError: (error) => {
          if (error instanceof ApiError && error.status === 401) setPassword('')
        },
      },
    )
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-4 py-12">
      <p className="text-lg font-semibold">{config.productName} Operator</p>
      <Card className="w-full max-w-sm">
        <CardHeader>
          <h1 className="text-xl leading-none font-semibold">Sign in</h1>
          <CardDescription>Use the email and password for your organisation's account.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            {expired && !signIn.isError && (
              <Alert variant="info">
                <AlertDescription>Your session has expired. Sign in again to continue.</AlertDescription>
              </Alert>
            )}
            {passwordUpdated && !signIn.isError && (
              <Alert variant="success">
                <AlertDescription>{PASSWORD_UPDATED_MESSAGE}</AlertDescription>
              </Alert>
            )}
            <div className="space-y-2">
              <Label htmlFor="login-email">Email</Label>
              <Input
                id="login-email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                disabled={signIn.isPending}
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-baseline justify-between gap-2">
                <Label htmlFor="login-password">Password</Label>
                <Link to="/password/forgot" className="text-sm text-link underline-offset-4 hover:underline">
                  Forgot password?
                </Link>
              </div>
              <Input
                id="login-password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                disabled={signIn.isPending}
              />
            </div>
            {signIn.isError && (
              <Alert variant="destructive">
                <AlertDescription>{signInErrorMessage(signIn.error)}</AlertDescription>
              </Alert>
            )}
            <Button type="submit" className="w-full" disabled={signIn.isPending}>
              {signIn.isPending ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>
        </CardContent>
      </Card>
      <p className="text-sm text-muted-foreground">
        New organiser?{' '}
        <Link to="/signup" className="text-link underline-offset-4 hover:underline">
          Create an account
        </Link>
      </p>
      <footer className="mt-6">
        <InternalLinks className="flex gap-4 text-xs text-muted-foreground" />
      </footer>
    </main>
  )
}
