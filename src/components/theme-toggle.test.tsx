import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { setThemePreference, THEME_STORAGE_KEY } from '@/lib/theme'
import { ThemeToggle } from './theme-toggle'

describe('ThemeToggle', () => {
  afterEach(() => {
    setThemePreference('system')
    localStorage.clear()
  })

  it('offers system, light and dark as a labelled radio group, starting on system', () => {
    render(<ThemeToggle />)
    expect(screen.getByRole('group', { name: 'Colour theme' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'System' })).toBeChecked()
    expect(screen.getAllByRole('radio')).toHaveLength(3)
  })

  it('switches to dark and back to light', async () => {
    render(<ThemeToggle />)
    await userEvent.click(screen.getByRole('radio', { name: 'Dark' }))
    expect(screen.getByRole('radio', { name: 'Dark' })).toBeChecked()
    expect(document.documentElement).toHaveClass('dark')
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark')

    await userEvent.click(screen.getByRole('radio', { name: 'Light' }))
    expect(document.documentElement).not.toHaveClass('dark')
  })

  it('moves between options with the arrow keys', async () => {
    render(<ThemeToggle />)
    await userEvent.click(screen.getByRole('radio', { name: 'System' }))
    await userEvent.keyboard('{ArrowRight}')
    expect(screen.getByRole('radio', { name: 'Light' })).toBeChecked()
  })
})
