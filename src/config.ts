// The product will be renamed; this is the only place the name lives.
export const PRODUCT_NAME = 'RWLabs'

export type AppEnv = 'development' | 'staging' | 'production'

export type AppConfig = {
  productName: string
  // Which deployment this build is for. VITE_APP_ENV at build time (the staging compose file sets "staging");
  // otherwise `npm run dev` is development and any other build is production, so a build that forgets to say
  // stays locked down.
  appEnv: AppEnv
  // Internal pages (the style guide and the system health page) and the links to them. Off in production.
  showInternalPages: boolean
  // Prefix for every API URL. Empty = same origin as the page (the default: nginx or the Vite proxy forwards
  // API paths to the gateway). Set VITE_API_BASE_URL to call the gateway cross-origin instead.
  apiBaseUrl: string
}

const APP_ENVS: readonly AppEnv[] = ['development', 'staging', 'production']

function readAppEnv(env: Record<string, string | undefined>): AppEnv {
  const declared = env.VITE_APP_ENV?.trim().toLowerCase()
  if (APP_ENVS.includes(declared as AppEnv)) return declared as AppEnv
  return env.MODE === 'production' || env.MODE === undefined ? 'production' : 'development'
}

export function readConfig(env: Record<string, string | undefined>): AppConfig {
  const appEnv = readAppEnv(env)
  return {
    productName: PRODUCT_NAME,
    appEnv,
    showInternalPages: appEnv !== 'production',
    apiBaseUrl: (env.VITE_API_BASE_URL ?? '').trim().replace(/\/+$/, ''),
  }
}

export const config = readConfig(import.meta.env)
