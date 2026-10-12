import { useQueryClient } from '@tanstack/react-query'
import { Outlet, useRouter } from '@tanstack/react-router'
import { useEffect } from 'react'
import { sessionEndReason, useSession } from '@/lib/session/session'

// Also watches the session while a page is open: a 401 from any request or signing out ends it, and this sends
// the user to the login page once (an expired session keeps the page to come back to). Cached server data is
// dropped so the next account in this tab can't see it.
export function AuthenticatedLayout() {
  const session = useSession()
  const router = useRouter()
  const queryClient = useQueryClient()

  useEffect(() => {
    if (session) return
    queryClient.clear()
    const expired = sessionEndReason() !== 'signed-out'
    const from = router.state.location.href
    router.navigate({ to: '/login', search: expired ? { redirect: from, reason: 'expired' } : {}, replace: true })
  }, [session, queryClient, router])

  return session ? <Outlet /> : null
}
