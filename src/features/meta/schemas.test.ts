import { describe, expect, it } from 'vitest'
import {
  addMetaPageSchema,
  editMetaPageSchema,
  type AddMetaPageFields,
  type EditMetaPageFields,
} from './schemas'

const validAdd: AddMetaPageFields = {
  label: 'Main page',
  pageId: '12345',
  pageAccessToken: 'tok_secret',
  adAccountId: '',
}

function addErrors(fields: AddMetaPageFields): Record<string, string> {
  const result = addMetaPageSchema.safeParse(fields)
  if (result.success) return {}
  return Object.fromEntries(result.error.issues.map((issue) => [issue.path.join('.'), issue.message]))
}

describe('addMetaPageSchema', () => {
  it('accepts the minimal valid form', () => {
    expect(addErrors(validAdd)).toEqual({})
  })

  it('accepts a form with an ad account id', () => {
    expect(addErrors({ ...validAdd, adAccountId: 'act_123' })).toEqual({})
  })

  it.each([
    ['label', 'Enter a name for this page'],
    ['pageId', 'Enter the Facebook page id'],
    ['pageAccessToken', 'Enter the page access token'],
  ] as const)('requires %s', (field, message) => {
    expect(addErrors({ ...validAdd, [field]: '  ' })).toEqual({ [field]: message })
  })
})

const validEdit: EditMetaPageFields = { label: 'Main', adAccountId: '', pageAccessToken: '' }

function editErrors(fields: EditMetaPageFields): Record<string, string> {
  const result = editMetaPageSchema.safeParse(fields)
  if (result.success) return {}
  return Object.fromEntries(result.error.issues.map((issue) => [issue.path.join('.'), issue.message]))
}

describe('editMetaPageSchema', () => {
  it('accepts a form with an empty token (keeps the stored one)', () => {
    expect(editErrors(validEdit)).toEqual({})
  })

  it('accepts a form with a replacement token', () => {
    expect(editErrors({ ...validEdit, pageAccessToken: 'tok_new' })).toEqual({})
  })

  it('still requires a label', () => {
    expect(editErrors({ ...validEdit, label: '   ' })).toEqual({ label: 'Enter a name for this page' })
  })
})
