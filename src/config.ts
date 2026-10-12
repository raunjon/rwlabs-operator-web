// The product will be renamed; this is the only place the name lives.
export const PRODUCT_NAME = 'RWLabs'

export type AppConfig = {
  productName: string
  // Prefix for every API URL. Empty = same origin as the page (the default: nginx or the Vite proxy forwards
  // API paths to the gateway). Set VITE_API_BASE_URL to call the gateway cross-origin instead.
  apiBaseUrl: string
}

export function readConfig(env: Record<string, string | undefined>): AppConfig {
  return {
    productName: PRODUCT_NAME,
    apiBaseUrl: (env.VITE_API_BASE_URL ?? '').trim().replace(/\/+$/, ''),
  }
}

export const config = readConfig(import.meta.env)
