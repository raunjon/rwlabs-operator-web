import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router'
import { render } from '@testing-library/react'
import type { ReactElement } from 'react'
import { createAppRouter } from '@/router'

// Fresh QueryClient per test, no retries, so failures show up immediately.
function testQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

export function renderWithQuery(ui: ReactElement) {
  return render(<QueryClientProvider client={testQueryClient()}>{ui}</QueryClientProvider>)
}

// For components that render <Link>: mounts ui as the only route of a throwaway router. The router renders
// asynchronously, so query the result with findBy*.
export function renderWithRouter(ui: ReactElement) {
  const router = createRouter({
    routeTree: createRootRoute({ component: () => ui }),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  return render(
    <QueryClientProvider client={testQueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}

// The whole app (real route tree, guards included) at initialPath. Returns the router to inspect where it ended up.
export function renderApp(initialPath: string) {
  const router = createAppRouter(testQueryClient(), createMemoryHistory({ initialEntries: [initialPath] }))
  render(
    <QueryClientProvider client={router.options.context.queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return router
}
