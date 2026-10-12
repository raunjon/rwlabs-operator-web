// Paths the dev server forwards to the gateway. Keep in sync with nginx/default.conf.template.
// Keys starting with ^ are regexes in Vite's proxy config: /health must match exactly, not /healthcheck etc.
export const GATEWAY_PATHS = ['/auth/api/', '/operator/api/', '^/health$'] as const

export const DEFAULT_GATEWAY_URL = 'http://localhost:3000'

export function gatewayProxy(target?: string) {
  const resolved = target || DEFAULT_GATEWAY_URL
  return Object.fromEntries(GATEWAY_PATHS.map((path) => [path, { target: resolved, changeOrigin: true as const }]))
}
