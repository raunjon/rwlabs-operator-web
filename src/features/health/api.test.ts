import { delay, http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { server } from '@/test/msw'
import { fetchGatewayHealth, fetchGatewayHealthReport } from './api'

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

  it('is unreachable when the gateway never answers (gives up after the timeout)', async () => {
    server.use(
      http.get('*/health', async () => {
        await delay('infinite')
        return HttpResponse.json({ service: 'gateway', status: 'ok' })
      }),
    )
    await expect(fetchGatewayHealth(50)).resolves.toBe('unreachable')
  })
})

const FULL_REPORT = {
  service: 'gateway',
  status: 'degraded',
  checks: {
    secrets: { RAILS_JWT_SECRET: true, SECRET_KEY_BASE: true },
    jwt_signing_key_matches_env: true,
  },
  jwt_secret_fingerprint: 'abc123',
  services: {
    auth: {
      reachable: true,
      http_status: 200,
      status: 'ok',
      checks: { database: true, secrets: { RAILS_JWT_SECRET: true } },
      jwt_secret_matches_gateway: true,
    },
    operator: { reachable: false, status: 'down' },
  },
}

describe('fetchGatewayHealthReport', () => {
  it('parses the gateway checks and every service, flattening nested checks', async () => {
    server.use(http.get('*/health', () => HttpResponse.json(FULL_REPORT, { status: 503 })))
    const report = await fetchGatewayHealthReport()

    expect(report.status).toBe('degraded')
    expect(report.raw).toEqual(FULL_REPORT)
    expect(report.details).toEqual({
      checks: [
        { name: 'secrets › RAILS_JWT_SECRET', ok: true },
        { name: 'secrets › SECRET_KEY_BASE', ok: true },
        { name: 'jwt_signing_key_matches_env', ok: true },
      ],
      jwtSecretFingerprint: 'abc123',
      services: [
        {
          name: 'auth',
          reachable: true,
          httpStatus: 200,
          status: 'ok',
          jwtSecretMatchesGateway: true,
          checks: [
            { name: 'database', ok: true },
            { name: 'secrets › RAILS_JWT_SECRET', ok: true },
          ],
        },
        {
          name: 'operator',
          reachable: false,
          httpStatus: null,
          status: 'down',
          jwtSecretMatchesGateway: null,
          checks: [],
        },
      ],
    })
  })

  it('treats a missing or non-boolean check value as unknown', async () => {
    server.use(
      http.get('*/health', () =>
        HttpResponse.json({ ...FULL_REPORT, checks: { database: null, version: '1.2' }, services: {} }),
      ),
    )
    const report = await fetchGatewayHealthReport()
    expect(report.details?.checks).toEqual([
      { name: 'database', ok: null },
      { name: 'version', ok: null },
    ])
  })

  it('has no details when the gateway hides the breakdown (production without X-Health-Token)', async () => {
    server.use(http.get('*/health', () => HttpResponse.json({ service: 'gateway', status: 'ok' })))
    const report = await fetchGatewayHealthReport()
    expect(report).toEqual({ status: 'ok', details: null, raw: { service: 'gateway', status: 'ok' } })
  })

  it('is unreachable with no details or raw body on a network error', async () => {
    server.use(http.get('*/health', () => HttpResponse.error()))
    await expect(fetchGatewayHealthReport()).resolves.toEqual({ status: 'unreachable', details: null, raw: null })
  })

  it('keeps the raw body but no details when the JSON is not a gateway health report', async () => {
    server.use(http.get('*/health', () => HttpResponse.json({ hello: 'world' })))
    await expect(fetchGatewayHealthReport()).resolves.toEqual({
      status: 'unreachable',
      details: null,
      raw: { hello: 'world' },
    })
  })
})
