import { setupServer } from 'msw/node'

// Shared MSW server. Tests add handlers with server.use(...); unhandled requests fail the test.
export const server = setupServer()
