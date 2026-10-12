import { screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { PRODUCT_NAME } from '@/config'
import { server } from '@/test/msw'
import { renderWithRouter } from '@/test/render'
import { HelloPage } from './hello-page'

describe('HelloPage', () => {
  it('greets with the product name and shows the gateway status', async () => {
    server.use(http.get('*/health', () => HttpResponse.json({ service: 'gateway', status: 'ok' })))
    renderWithRouter(<HelloPage />)
    expect(await screen.findByRole('heading', { level: 1, name: `${PRODUCT_NAME} Operator` })).toBeInTheDocument()
    expect(screen.getByText('Hello world. The operator panel is running.')).toBeInTheDocument()
    expect(await screen.findByText('Gateway reachable. All services are healthy.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'System health details' })).toHaveAttribute('href', '/status')
  })
})
