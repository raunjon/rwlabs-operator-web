import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Button } from './button'

describe('Button', () => {
  it('renders an accessible button that handles clicks', async () => {
    const onClick = vi.fn()
    render(<Button onClick={onClick}>Check again</Button>)
    await userEvent.click(screen.getByRole('button', { name: 'Check again' }))
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('applies variant classes from tokens, not raw colours', () => {
    render(<Button variant="outline">Outline</Button>)
    const button = screen.getByRole('button', { name: 'Outline' })
    expect(button.className).toContain('border-input')
    expect(button.className).not.toMatch(/#[0-9a-f]{3,6}|oklch\(/i)
  })

  it('renders its child element when asChild is set', () => {
    render(
      <Button asChild>
        <a href="/">Home</a>
      </Button>,
    )
    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('data-slot', 'button')
  })
})
