import { z } from 'zod'
import { required } from '@/features/auth/form-rules'

// Mirrors the Meta service's own validations (label, page_id, page_access_token presence; the token is further
// debugged against Graph server-side). The ad account id is optional: no ads data is shown for pages that don't
// have one.
export const addMetaPageSchema = z.object({
  label: required('Enter a name for this page'),
  pageId: required('Enter the Facebook page id'),
  pageAccessToken: required('Enter the page access token'),
  adAccountId: z.string().trim(),
})

export type AddMetaPageFields = z.infer<typeof addMetaPageSchema>

// Edit: the token is write-only. The field is always empty, and only sent to the server when the admin has typed
// something new in. The page id can't be changed.
export const editMetaPageSchema = z.object({
  label: required('Enter a name for this page'),
  adAccountId: z.string().trim(),
  pageAccessToken: z.string(),
})

export type EditMetaPageFields = z.infer<typeof editMetaPageSchema>
