import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import type { MetaPage } from './api'
import {
  CONNECT_FIRST_MESSAGE,
  metaConnectionQuery,
  metaFailure,
  metaPagesQuery,
  useConnectToMeta,
  useCreateMetaPage,
  useUpdateMetaPage,
  type MetaFailure,
} from './meta-settings'
import {
  addMetaPageSchema,
  editMetaPageSchema,
  type AddMetaPageFields,
  type EditMetaPageFields,
} from './schemas'

const TOKEN_HINT =
  'Create a page access token in Meta Business Settings → System Users → Add Assets → the page you want, then Generate New Token.'
const PAGE_ID_HINT = 'Numeric id from the About panel on the page’s Facebook settings.'
const CONNECTED_FORMAT = new Intl.DateTimeFormat(undefined, { dateStyle: 'long' })

// OW-10: a tenant admin connects the organisation to Meta and manages the Facebook pages whose lead forms and ads
// the panel will use. The page shows the connection state at the top, then the list of connected pages, and
// finally the add form; opening an edit replaces the row's label with the edit form. The token field is write-only
// — nothing in the UI (or the api layer) stores the typed token after the request is sent.
export function MetaSettingsPage() {
  const connection = useQuery(metaConnectionQuery)
  const pages = useQuery({
    ...metaPagesQuery,
    // Spare the admin a 422 for a tenant that isn't connected: the connection card already explains that state.
    enabled: connection.data?.connected === true,
  })

  return (
    <div className="max-w-3xl space-y-6">
      <div className="space-y-1">
        <p className="text-sm text-muted-foreground">Settings</p>
        <h1 className="text-2xl font-semibold">Meta</h1>
      </div>

      <ConnectionCard
        isPending={connection.isPending}
        connected={connection.data?.connected ?? false}
        connectedAt={connection.data?.connectedAt ?? null}
        error={connection.isError ? connection.error : null}
      />

      {connection.data?.connected && <PagesSection pagesQuery={pages} />}
    </div>
  )
}

function ConnectionCard({
  isPending,
  connected,
  connectedAt,
  error,
}: {
  isPending: boolean
  connected: boolean
  connectedAt: number | null
  error: unknown
}) {
  const connect = useConnectToMeta()
  const failure = connect.isError ? metaFailure(connect.error) : null
  const connectionError = error ? metaFailure(error) : null

  return (
    <section aria-labelledby="meta-connection-heading">
      <Card>
        <CardHeader>
          <h2 id="meta-connection-heading" className="font-semibold">
            Meta connection
          </h2>
          <CardDescription>
            Connect your organisation to Meta so you can list Facebook pages, lead forms and ads here.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isPending ? (
            <p role="status" className="text-sm text-muted-foreground">
              Checking connection…
            </p>
          ) : connectionError ? (
            <Alert variant="destructive">
              <AlertDescription>{connectionError.message}</AlertDescription>
            </Alert>
          ) : connected ? (
            <div role="status" aria-label="Connected to Meta" className="space-y-1 text-sm">
              <p className="font-medium">Connected to Meta</p>
              {connectedAt !== null && (
                <p className="text-muted-foreground">Connected on {CONNECTED_FORMAT.format(connectedAt)}.</p>
              )}
            </div>
          ) : (
            <>
              {failure && (
                <Alert variant="destructive">
                  <AlertDescription>{failure.message}</AlertDescription>
                </Alert>
              )}
              <Button type="button" onClick={() => connect.mutate()} disabled={connect.isPending}>
                {connect.isPending ? 'Connecting…' : 'Connect to Meta'}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </section>
  )
}

function PagesSection({ pagesQuery }: { pagesQuery: ReturnType<typeof useQuery<MetaPage[]>> }) {
  const failure = pagesQuery.isError ? metaFailure(pagesQuery.error) : null
  const connect = useConnectToMeta()

  if (pagesQuery.isPending) {
    // No add card while we're still finding out what the admin already has: creating a page requires knowing
    // whether we're about to clash with an existing one, so wait for the list before offering the form.
    return (
      <section aria-labelledby="meta-pages-heading">
        <Card>
          <CardHeader>
            <h2 id="meta-pages-heading" className="font-semibold">
              Facebook pages
            </h2>
          </CardHeader>
          <CardContent role="status" aria-label="Loading your Facebook pages" className="space-y-3">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
          </CardContent>
        </Card>
      </section>
    )
  }

  if (failure?.kind === 'not-connected') {
    return (
      <section aria-labelledby="meta-pages-heading">
        <Card>
          <CardHeader>
            <h2 id="meta-pages-heading" className="font-semibold">
              Facebook pages
            </h2>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert variant="info">
              <AlertDescription>{CONNECT_FIRST_MESSAGE}</AlertDescription>
            </Alert>
            <Button type="button" onClick={() => connect.mutate()} disabled={connect.isPending}>
              {connect.isPending ? 'Connecting…' : 'Connect to Meta'}
            </Button>
          </CardContent>
        </Card>
      </section>
    )
  }

  if (failure) {
    return (
      <section aria-labelledby="meta-pages-heading">
        <Card>
          <CardHeader>
            <h2 id="meta-pages-heading" className="font-semibold">
              Facebook pages
            </h2>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert variant="destructive">
              <AlertDescription>{failure.message}</AlertDescription>
            </Alert>
            <Button type="button" variant="outline" onClick={() => pagesQuery.refetch()} disabled={pagesQuery.isFetching}>
              Try again
            </Button>
          </CardContent>
        </Card>
      </section>
    )
  }

  const pages = pagesQuery.data ?? []
  return (
    <>
      <section aria-labelledby="meta-pages-heading">
        <Card>
          <CardHeader>
            <h2 id="meta-pages-heading" className="font-semibold">
              Facebook pages
            </h2>
            <CardDescription>
              {pages.length === 0 ? 'No pages connected yet.' : `${pages.length} page${pages.length === 1 ? '' : 's'} connected.`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {pages.length === 0 ? (
              <p className="text-sm text-muted-foreground">Add your first page below.</p>
            ) : (
              <ul className="divide-y divide-border">
                {pages.map((page) => (
                  <li key={page.id}>
                    <PageRow page={page} />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>
      <AddPageCard />
    </>
  )
}

function PageRow({ page }: { page: MetaPage }) {
  const [editing, setEditing] = useState(false)
  if (editing) return <EditPageForm page={page} onDone={() => setEditing(false)} />
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <div className="space-y-1 text-sm">
        <p className="font-medium">{page.label}</p>
        <p className="text-muted-foreground">Facebook page {page.pageId}</p>
        <p className="text-muted-foreground">
          {page.adAccountId
            ? `Ad account ${page.adAccountId}`
            : 'No ad account: ads won’t be available for this page.'}
        </p>
      </div>
      <Button type="button" variant="outline" size="sm" onClick={() => setEditing(true)}>
        Edit
      </Button>
    </div>
  )
}

const ADD_DEFAULTS: AddMetaPageFields = { label: '', pageId: '', pageAccessToken: '', adAccountId: '' }

function AddPageCard() {
  const create = useCreateMetaPage()
  const [justAdded, setJustAdded] = useState<string | null>(null)
  const form = useForm<AddMetaPageFields>({ resolver: zodResolver(addMetaPageSchema), defaultValues: ADD_DEFAULTS })
  const { errors } = form.formState
  const busy = create.isPending
  const failure: MetaFailure | null = create.isError ? metaFailure(create.error) : null

  function submit(fields: AddMetaPageFields) {
    const token = fields.pageAccessToken
    create.mutate(
      {
        label: fields.label.trim(),
        pageId: fields.pageId.trim(),
        pageAccessToken: token,
        adAccountId: fields.adAccountId.trim() || null,
      },
      {
        onSuccess: (page) => {
          setJustAdded(page.label)
          // Reset to the stable defaults, which drops the typed token from form state. The outer api/queries
          // layer never cached it either.
          form.reset(ADD_DEFAULTS)
        },
      },
    )
  }

  return (
    <section aria-labelledby="add-meta-page-heading">
      <Card>
        <CardHeader>
          <h2 id="add-meta-page-heading" className="font-semibold">
            Add a Facebook page
          </h2>
          <CardDescription>
            Give the page a name, paste its page id and a page access token, and (optionally) link an ad account.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={form.handleSubmit(submit)} noValidate className="space-y-4">
            <Field id="meta-add-label" label="Name" error={errors.label?.message}>
              <Input type="text" autoComplete="off" {...form.register('label')} disabled={busy} />
            </Field>
            <Field id="meta-add-page-id" label="Facebook page id" hint={PAGE_ID_HINT} error={errors.pageId?.message}>
              <Input type="text" autoComplete="off" inputMode="numeric" {...form.register('pageId')} disabled={busy} />
            </Field>
            <Field id="meta-add-token" label="Page access token" hint={TOKEN_HINT} error={errors.pageAccessToken?.message}>
              <Input
                type="password"
                autoComplete="off"
                spellCheck={false}
                {...form.register('pageAccessToken')}
                disabled={busy}
              />
            </Field>
            <Field id="meta-add-ad-account" label="Ad account id (optional)" error={errors.adAccountId?.message}>
              <Input type="text" autoComplete="off" {...form.register('adAccountId')} disabled={busy} />
            </Field>
            {failure && (
              <Alert variant="destructive">
                <AlertDescription>{failure.message}</AlertDescription>
              </Alert>
            )}
            <Button type="submit" disabled={busy}>
              {busy ? 'Adding page…' : 'Add page'}
            </Button>
            {justAdded && !busy && !failure && (
              <p role="status" className="text-sm text-muted-foreground">
                Added {justAdded}.
              </p>
            )}
          </form>
        </CardContent>
      </Card>
    </section>
  )
}

function EditPageForm({ page, onDone }: { page: MetaPage; onDone: () => void }) {
  const update = useUpdateMetaPage()
  // The token field always starts empty — we never pre-fill a token (write-only). Label and ad account come from
  // the current credential.
  const defaults: EditMetaPageFields = {
    label: page.label,
    adAccountId: page.adAccountId ?? '',
    pageAccessToken: '',
  }
  const form = useForm<EditMetaPageFields>({ resolver: zodResolver(editMetaPageSchema), defaultValues: defaults })
  const { errors } = form.formState
  const busy = update.isPending
  const failure: MetaFailure | null = update.isError ? metaFailure(update.error) : null

  function submit(fields: EditMetaPageFields) {
    const token = fields.pageAccessToken
    update.mutate(
      {
        id: page.id,
        update: {
          label: fields.label.trim(),
          adAccountId: fields.adAccountId.trim() || null,
          pageAccessToken: token ? token : null,
        },
      },
      { onSuccess: () => onDone() },
    )
  }

  return (
    <form onSubmit={form.handleSubmit(submit)} noValidate className="space-y-4 py-3">
      <p className="text-sm text-muted-foreground">Facebook page {page.pageId}</p>
      <Field id={`meta-edit-${page.id}-label`} label="Name" error={errors.label?.message}>
        <Input type="text" autoComplete="off" {...form.register('label')} disabled={busy} />
      </Field>
      <Field id={`meta-edit-${page.id}-ad-account`} label="Ad account id (optional)" error={errors.adAccountId?.message}>
        <Input type="text" autoComplete="off" {...form.register('adAccountId')} disabled={busy} />
      </Field>
      <Field
        id={`meta-edit-${page.id}-token`}
        label="Replace page access token (optional)"
        hint="Leave empty to keep the stored token."
        error={errors.pageAccessToken?.message}
      >
        <Input type="password" autoComplete="off" spellCheck={false} {...form.register('pageAccessToken')} disabled={busy} />
      </Field>
      {failure && (
        <Alert variant="destructive">
          <AlertDescription>{failure.message}</AlertDescription>
        </Alert>
      )}
      <div className="flex gap-2">
        <Button type="submit" disabled={busy}>
          {busy ? 'Saving…' : 'Save changes'}
        </Button>
        <Button type="button" variant="outline" onClick={onDone} disabled={busy}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
