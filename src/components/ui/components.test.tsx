import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Alert, AlertDescription, AlertTitle } from './alert'
import { Badge } from './badge'
import { Input } from './input'
import { Label } from './label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './table'
import { Textarea } from './textarea'

describe('Alert', () => {
  it('interrupts screen readers only for errors', () => {
    render(
      <>
        <Alert variant="destructive">
          <AlertTitle>Couldn't save</AlertTitle>
        </Alert>
        <Alert variant="success">
          <AlertTitle>Saved</AlertTitle>
        </Alert>
      </>,
    )
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't save")
    expect(screen.getByRole('status')).toHaveTextContent('Saved')
  })

  it('accepts an explicit role and colours the title from the status tokens', () => {
    render(
      <Alert variant="warning" role="note">
        <AlertTitle>Heads up</AlertTitle>
        <AlertDescription>Credentials expire soon.</AlertDescription>
      </Alert>,
    )
    const alert = screen.getByRole('note')
    expect(alert.className).toContain('bg-warning-subtle')
    expect(alert.className).toContain('*:data-[slot=alert-title]:text-warning')
  })
})

describe('Badge', () => {
  it.each([
    ['success', 'text-success'],
    ['warning', 'text-warning'],
    ['destructive', 'text-destructive'],
    ['info', 'text-info'],
  ] as const)('%s uses its status tokens', (variant, textClass) => {
    render(<Badge variant={variant}>{variant}</Badge>)
    const badge = screen.getByText(variant)
    expect(badge).toHaveClass(textClass, `bg-${variant}-subtle`, `border-${variant}-border`)
  })
})

describe('form fields', () => {
  it('labels an input and marks it invalid', () => {
    render(
      <>
        <Label htmlFor="email">Email</Label>
        <Input id="email" aria-invalid aria-describedby="email-error" />
        <p id="email-error">Enter an email address</p>
      </>,
    )
    const input = screen.getByRole('textbox', { name: 'Email' })
    expect(input).toBeInvalid()
    expect(input).toHaveAccessibleDescription('Enter an email address')
    expect(input).toHaveClass('aria-invalid:border-destructive', 'border-input')
  })

  it('renders a labelled, disableable textarea', () => {
    render(
      <>
        <Label htmlFor="notes">Notes</Label>
        <Textarea id="notes" disabled />
      </>,
    )
    expect(screen.getByRole('textbox', { name: 'Notes' })).toBeDisabled()
  })
})

describe('Table', () => {
  it('renders an accessible table', () => {
    render(
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell>Asha</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    )
    expect(screen.getByRole('columnheader', { name: 'Name' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: 'Asha' })).toBeInTheDocument()
  })
})
