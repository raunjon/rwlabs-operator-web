import type { IncomingMessage } from 'node:http'
import type { ProxyOptions } from 'vite'

// Paths the dev server forwards to the gateway. Keep in sync with nginx/default.conf.template.
// Keys starting with ^ are regexes in Vite's proxy config: /health must match exactly, not /healthcheck etc.
export const GATEWAY_PATHS = ['/auth/api/', '/operator/api/', '^/health$'] as const

const HEALTH_PATH = '^/health$'

export const DEFAULT_GATEWAY_URL = 'http://localhost:3000'

// /health is both the gateway's JSON health check and the panel's System health page. A browser opening it asks
// for HTML and gets the page; everything else (the page's own fetch, curl, deploy.sh) gets the gateway. nginx does
// the same with a map on $http_accept.
function servePageToBrowsers(req: IncomingMessage) {
  return req.headers.accept?.includes('text/html') ? '/index.html' : undefined
}

export function gatewayProxy(target?: string): Record<(typeof GATEWAY_PATHS)[number], ProxyOptions> {
  const resolved = target || DEFAULT_GATEWAY_URL
  return Object.fromEntries(
    GATEWAY_PATHS.map((path) => [
      path,
      {
        target: resolved,
        changeOrigin: true,
        ...(path === HEALTH_PATH && { bypass: servePageToBrowsers }),
      },
    ]),
  ) as Record<(typeof GATEWAY_PATHS)[number], ProxyOptions>
}
