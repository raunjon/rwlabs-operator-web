import { createServer, type Server } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import { findListener } from './assert-port-free.ts'

let server: Server | undefined

function listen(host: string): Promise<number> {
  return new Promise((resolve) => {
    server = createServer().listen(0, host, () => {
      const address = server!.address()
      resolve(typeof address === 'object' && address ? address.port : 0)
    })
  })
}

afterEach(() => new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve())))

describe('findListener', () => {
  it('finds something listening on IPv4 only (the case Vite strictPort misses on macOS)', async () => {
    const port = await listen('127.0.0.1')
    await expect(findListener(port)).resolves.toBe('127.0.0.1')
  })

  it('returns null when nothing listens on the port', async () => {
    const port = await listen('127.0.0.1')
    await new Promise<void>((resolve) => server!.close(() => resolve()))
    server = undefined
    await expect(findListener(port)).resolves.toBeNull()
  })
})
