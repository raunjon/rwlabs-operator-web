import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { server } from '@/test/msw'
import { fetchGatewayHealth } from './api'

describe('fetchGatewayHealth', () => {
  it('is ok when the gateway reports ok', async () => {
    server.use(http.get('*/health', () => HttpResponse.json({ service: 'gateway', status: 'ok' })))
    await expect(fetchGatewayHealth()).resolves.toBe('ok')
  })

  it('is degraded when the gateway answers 503 degraded', async () => {
    server.use(
      http.get('*/health', () => HttpResponse.json({ service: 'gateway', status: 'degraded' }, { status: 503 })),
    )
    await expect(fetchGatewayHealth()).resolves.toBe('degraded')
  })

  it('is unreachable on a network error', async () => {
    server.use(http.get('*/health', () => HttpResponse.error()))
    await expect(fetchGatewayHealth()).resolves.toBe('unreachable')
  })

  it('is unreachable when a proxy returns an HTML error page', async () => {
    server.use(http.get('*/health', () => HttpResponse.html('<html>502 Bad Gateway</html>', { status: 502 })))
    await expect(fetchGatewayHealth()).resolves.toBe('unreachable')
  })

  it('is unreachable when the body is JSON but not a gateway health report', async () => {
    server.use(http.get('*/health', () => HttpResponse.json({ hello: 'world' })))
    await expect(fetchGatewayHealth()).resolves.toBe('unreachable')
  })

  it('is unreachable on an empty error response (the Vite proxy with no gateway running)', async () => {
    server.use(http.get('*/health', () => new HttpResponse(null, { status: 500 })))
    await expect(fetchGatewayHealth()).resolves.toBe('unreachable')
  })
})
