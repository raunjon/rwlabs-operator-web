import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Alert, AlertDescription, AlertTitle } from './alert'
import { Badge } from './badge'
import { Field } from './field'
import { Input } from './input'
import { NativeSelect } from './native-select'
import { Label } from './label'
import { Skeleton } from './skeleton'
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

  it('renders a labelled native select with the field look', () => {
    render(
      <>
        <Label htmlFor="role">Role</Label>
        <NativeSelect id="role" defaultValue="b" aria-invalid>
          <option value="a">A</option>
          <option value="b">B</option>
        </NativeSelect>
      </>,
    )
    const select = screen.getByRole('combobox', { name: 'Role' })
    expect(select).toHaveValue('b')
    expect(select).toBeInvalid()
    expect(select).toHaveClass('border-input', 'aria-invalid:border-destructive')
  })
})

describe('Field', () => {
  it('labels its control and has it read the error before the hint', () => {
    render(
      <Field id="f-email" label="Email" hint="Work email preferred" error="Enter your email">
        <Input type="email" />
      </Field>,
    )
    const input = screen.getByLabelText('Email')
    expect(input).toHaveAttribute('id', 'f-email')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAccessibleDescription('Enter your email Work email preferred')
    expect(screen.getByText('Enter your email').className).toContain('text-destructive')
    expect(screen.getByText('Work email preferred').className).toContain('text-muted-foreground')
  })

  it('describes a control by its hint alone, and as valid, until there is an error', () => {
    render(
      <Field id="f-password" label="Password" hint="At least 8 characters">
        <Input type="password" />
      </Field>,
    )
    const input = screen.getByLabelText('Password')
    expect(input).toHaveAccessibleDescription('At least 8 characters')
    expect(input).not.toHaveAttribute('aria-invalid')
  })

  it('leaves a plain control undescribed', () => {
    render(
      <Field id="f-name" label="Name">
        <Input />
      </Field>,
    )
    expect(screen.getByLabelText('Name')).not.toHaveAttribute('aria-describedby')
  })
})

describe('Skeleton', () => {
  it('is a pulsing muted block that takes its size from className', () => {
    render(
      <div role="status" aria-label="Loading">
        <Skeleton className="h-4 w-1/2" />
      </div>,
    )
    const block = screen.getByRole('status').firstElementChild as HTMLElement
    expect(block.className).toContain('animate-pulse')
    expect(block.className).toContain('bg-muted')
    expect(block.className).toContain('h-4 w-1/2')
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
