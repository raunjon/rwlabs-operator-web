// An event as the gateway sends it: its serializer turns the operator's ISO datetimes into Unix seconds plus a
// `_display` string, and decimals arrive as strings.
export const gatewayEvent = (overrides: Record<string, unknown> = {}) => ({
  id: 12,
  title: 'Friday Rooftop Mixer',
  description: 'Drinks on the roof',
  date: '2026-10-29',
  start_time: 1793300400,
  start_time_display: '29 Oct 2026, 07:00 PM IST',
  end_time: 1793314800,
  end_time_display: '29 Oct 2026, 11:00 PM IST',
  venue_id: 1,
  area: 'Bandra',
  image_url_vertical: null,
  image_url_horizontal: null,
  base_price: '1500.0',
  cover_price: '500.0',
  max_male_tickets: 40,
  max_female_tickets: 40,
  max_tickets: null,
  features: ['welcome_drink', 'icebreakers'],
  tenant_id: 3,
  ...overrides,
})
