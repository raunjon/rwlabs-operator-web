const TIME_FORMAT = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })
const PRICE_FORMAT = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 })

// An event's start or end in the admin's own time zone.
export function formatEventTime(ms: number | null): string {
  return ms === null ? '—' : TIME_FORMAT.format(ms)
}

// "1,500 base · 500 cover": the list's Price column. Either part is left out when the event has no value for it.
export function formatPrices(basePrice: string | null, coverPrice: string | null): string {
  const parts = [
    basePrice !== null && `${PRICE_FORMAT.format(Number(basePrice))} base`,
    coverPrice !== null && `${PRICE_FORMAT.format(Number(coverPrice))} cover`,
  ].filter(Boolean)
  return parts.length ? parts.join(' · ') : '—'
}
