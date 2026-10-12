import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { server } from '@/test/msw'
import { renderWithRouter } from '@/test/render'
import { HEALTH_POLL_MS, HealthReport } from './health-report'

const DEGRADED = {
  service: 'gateway',
  status: 'degraded',
  checks: { secrets: { RAILS_JWT_SECRET: true }, jwt_signing_key_matches_env: true },
  jwt_secret_fingerprint: 'abc123',
  services: {
    auth: {
      reachable: true,
      http_status: 200,
      status: 'ok',
      checks: { database: true },
      jwt_secret_matches_gateway: true,
    },
    operator: { reachable: false, status: 'down' },
  },
}

describe('HealthReport', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('says it is checking while the first request is in flight', async () => {
    server.use(http.get('*/health', () => new Promise(() => {})))
    renderWithRouter(<HealthReport />)
    expect(await screen.findByText('Checking the gateway…')).toBeInTheDocument()
  })

  it('shows the overall status, the gateway checks and a card per service', async () => {
    server.use(http.get('*/health', () => HttpResponse.json(DEGRADED, { status: 503 })))
    renderWithRouter(<HealthReport />)

    expect(await screen.findByText('Degraded')).toBeInTheDocument()
    expect(screen.getByText(/^Last refreshed at /)).toBeInTheDocument()

    const gateway = screen.getByRole('region', { name: 'gateway' })
    expect(within(gateway).getByText('secrets › RAILS_JWT_SECRET')).toBeInTheDocument()
    expect(within(gateway).getByText('abc123')).toBeInTheDocument()

    const auth = screen.getByRole('region', { name: 'auth' })
    expect(within(auth).getByText('ok')).toBeInTheDocument()
    expect(within(auth).getByText('database')).toBeInTheDocument()

    const operator = screen.getByRole('region', { name: 'operator' })
    expect(within(operator).getByText('down')).toBeInTheDocument()
    expect(within(operator).getByText('Reachable').nextSibling).toHaveTextContent('Fail')
  })

  it('explains when the gateway hides the breakdown', async () => {
    server.use(http.get('*/health', () => HttpResponse.json({ service: 'gateway', status: 'ok' })))
    renderWithRouter(<HealthReport />)
    expect(await screen.findByText('OK')).toBeInTheDocument()
    expect(screen.getByText(/The gateway sent only its overall status/)).toBeInTheDocument()
  })

  it('reports an unreachable gateway and recovers when checked again', async () => {
    server.use(http.get('*/health', () => HttpResponse.error()))
    renderWithRouter(<HealthReport />)
    expect(await screen.findByText('Unreachable')).toBeInTheDocument()
    expect(screen.getByText(/check the gateway is running on port 3000/)).toBeInTheDocument()

    server.use(http.get('*/health', () => HttpResponse.json(DEGRADED, { status: 503 })))
    await userEvent.click(screen.getByRole('button', { name: 'Check again' }))
    expect(await screen.findByRole('region', { name: 'auth' })).toBeInTheDocument()
  })

  it('checks again every minute on its own', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    let calls = 0
    server.use(
      http.get('*/health', () => {
        calls += 1
        return HttpResponse.json({ service: 'gateway', status: 'ok' })
      }),
    )
    renderWithRouter(<HealthReport />)
    expect(await screen.findByText('OK')).toBeInTheDocument()
    expect(calls).toBe(1)

    await vi.advanceTimersByTimeAsync(HEALTH_POLL_MS)
    await vi.waitFor(() => expect(calls).toBe(2))
  })
})
