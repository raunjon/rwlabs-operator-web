import { useState, type KeyboardEvent } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'

// A chip input for a list of short words (an event's features, a venue's amenities): type one and press Enter (or
// the Add button); each shows as a removable chip. Duplicates are ignored. `noun` names one item ("feature"),
// `label` the field and `listLabel` the list of chips.
export function ChipInput({
  id,
  label,
  noun,
  listLabel,
  value,
  onChange,
  error,
}: {
  id: string
  label: string
  noun: string
  listLabel: string
  value: string[]
  onChange: (items: string[]) => void
  error?: string
}) {
  const [draft, setDraft] = useState('')
  const addLabel = `Add ${noun}`

  function add() {
    const item = draft.trim()
    if (item && !value.includes(item)) onChange([...value, item])
    setDraft('')
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    // Enter adds the item instead of submitting the whole form.
    if (event.key === 'Enter') {
      event.preventDefault()
      add()
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-start gap-2">
        <Field id={id} label={label} hint={`Press Enter or ${addLabel} after each one.`} error={error} className="flex-1">
          <Input type="text" autoComplete="off" value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={onKeyDown} />
        </Field>
        <Button type="button" variant="outline" onClick={add} className="mt-7">
          {addLabel}
        </Button>
      </div>
      {value.length > 0 && (
        <ul aria-label={listLabel} className="flex flex-wrap gap-2">
          {value.map((item) => (
            <li key={item}>
              <Badge variant="secondary" className="gap-1 py-1 pr-1">
                <span>{item}</span>
                <button
                  type="button"
                  aria-label={`Remove ${item}`}
                  onClick={() => onChange(value.filter((i) => i !== item))}
                  className="rounded-full px-1 leading-none hover:bg-accent hover:text-accent-foreground"
                >
                  ×
                </button>
              </Badge>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
