import './styles/tokens.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'
import { config } from './config'
import { loadSession } from './lib/session/session'
import { initTheme } from './lib/theme'
import { createAppRouter } from './router'

document.title = `${config.productName} Operator`
initTheme()
loadSession()

const queryClient = new QueryClient()
const router = createAppRouter(queryClient)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
)
