// Run before `npm run dev` (the predev script). Vite's strictPort only notices a conflict on the address it binds
// itself (::1 for "localhost" on macOS), so another server holding 3020 on IPv4 would let Vite start anyway, and
// localhost:3020 (browsers, Playwright's reuseExistingServer) could reach the wrong app. Fail loudly instead.
import { connect } from 'node:net'
import { fileURLToPath } from 'node:url'

const HOSTS = ['127.0.0.1', '::1']

function answers(port: number, host: string): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ port, host })
    const done = (result: boolean) => {
      socket.destroy()
      resolve(result)
    }
    socket.setTimeout(500, () => done(false))
    socket.once('connect', () => done(true))
    socket.once('error', () => done(false))
  })
}

// The first host something is listening on, or null if the port is free on all of them.
export async function findListener(port: number, hosts: string[] = HOSTS): Promise<string | null> {
  for (const host of hosts) {
    if (await answers(port, host)) return host
  }
  return null
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.argv[2] ?? 3020)
  const host = await findListener(port)
  if (host) {
    console.error(`Port ${port} is already in use (something answers on ${host}). Stop it before starting the panel.`)
    process.exit(1)
  }
}
