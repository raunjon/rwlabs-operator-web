import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { setThemePreference } from '@/lib/theme'
import { CONTRAST_PAIRS } from '@/styles/contrast-pairs'
import { renderWithRouter } from '@/test/render'
import { StyleGuidePage } from './style-guide-page'

describe('StyleGuidePage', () => {
  afterEach(() => {
    setThemePreference('system')
    localStorage.clear()
  })

  it('shows every section of the design system', async () => {
    renderWithRouter(<StyleGuidePage />)
    expect(await screen.findByRole('heading', { level: 1, name: 'Style guide' })).toBeInTheDocument()
    for (const name of [
      'Palette',
      'Semantic tokens',
      'Contrast',
      'Typography',
      'Buttons',
      'Form fields',
      'Cards',
      'Alerts',
      'Badges',
      'Table',
      'Radius',
      'Spacing',
    ]) {
      expect(screen.getByRole('region', { name })).toBeInTheDocument()
    }
  })

  it('shows all seven palette ramps with ten steps each', async () => {
    renderWithRouter(<StyleGuidePage />)
    const palette = await screen.findByRole('region', { name: 'Palette' })
    for (const ramp of ['primary', 'secondary', 'neutral', 'success', 'warning', 'error', 'info']) {
      expect(within(palette).getByRole('list', { name: `${ramp} ramp` }).children).toHaveLength(10)
    }
  })

  it('lists every checked contrast pair', async () => {
    renderWithRouter(<StyleGuidePage />)
    const contrast = await screen.findByRole('region', { name: 'Contrast' })
    // One header row plus one row per pair.
    expect(within(contrast).getAllByRole('row')).toHaveLength(CONTRAST_PAIRS.length + 1)
  })

  it('switches to dark mode from its theme toggle', async () => {
    renderWithRouter(<StyleGuidePage />)
    expect(await screen.findByText(/showing the light theme/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('radio', { name: 'Dark' }))
    expect(document.documentElement).toHaveClass('dark')
    expect(screen.getByText(/showing the dark theme/)).toBeInTheDocument()
  })

  it('shows the invalid field with its error message', async () => {
    renderWithRouter(<StyleGuidePage />)
    const email = await screen.findByRole('textbox', { name: 'Email' })
    expect(email).toBeInvalid()
    expect(email).toHaveAccessibleDescription('Enter an email address like name@example.com')
  })
})
