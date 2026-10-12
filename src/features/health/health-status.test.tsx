import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { server } from '@/test/msw'
import { renderWithQuery } from '@/test/render'
import { HealthStatus } from './health-status'

describe('HealthStatus', () => {
  it('says it is checking while the request is in flight', () => {
    server.use(http.get('*/health', () => new Promise(() => {})))
    renderWithQuery(<HealthStatus />)
    expect(screen.getByRole('status')).toHaveTextContent('Checking the gateway')
  })

  it('reports a healthy gateway', async () => {
    server.use(http.get('*/health', () => HttpResponse.json({ service: 'gateway', status: 'ok' })))
    renderWithQuery(<HealthStatus />)
    expect(await screen.findByText('Gateway reachable. All services are healthy.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Check again' })).not.toBeInTheDocument()
  })

  it('reports a degraded gateway with a way to check again', async () => {
    server.use(
      http.get('*/health', () => HttpResponse.json({ service: 'gateway', status: 'degraded' }, { status: 503 })),
    )
    renderWithQuery(<HealthStatus />)
    expect(
      await screen.findByText("The gateway is up, but a service behind it isn't healthy."),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Check again' })).toBeInTheDocument()
  })

  it('reports an unreachable gateway and recovers when checked again', async () => {
    server.use(http.get('*/health', () => HttpResponse.error()))
    renderWithQuery(<HealthStatus />)
    expect(await screen.findByText("Can't reach the gateway.")).toBeInTheDocument()

    server.use(http.get('*/health', () => HttpResponse.json({ service: 'gateway', status: 'ok' })))
    await userEvent.click(screen.getByRole('button', { name: 'Check again' }))

    expect(await screen.findByText('Gateway reachable. All services are healthy.')).toBeInTheDocument()
  })
})
