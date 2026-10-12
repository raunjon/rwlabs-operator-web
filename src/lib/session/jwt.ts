// What the panel reads from the gateway JWT (built in the gateway's ApplicationController#build_jwt). The payload
// is decoded without checking the signature: that is the server's job, and nothing here is trusted beyond deciding
// what to show. The raw auth token inside the payload is deliberately not copied out.

export interface Session {
  userId: number | null
  firstName: string
  lastName: string
  email: string
  role: string
  roleDisplayName: string
  tenantId: number | null
  // Milliseconds since the epoch, or null when the token doesn't say (the server still enforces expiry).
  expiresAt: number | null
}

// null for anything that isn't a three-part JWT with a JSON object payload naming a role.
export function decodeSession(jwt: string): Session | null {
  const parts = jwt.split('.')
  if (parts.length !== 3) return null
  let payload: unknown
  try {
    payload = JSON.parse(base64UrlDecode(parts[1]))
  } catch {
    return null
  }
  if (typeof payload !== 'object' || payload === null) return null
  const claims = payload as Record<string, unknown>
  const role = text(claims.role_name)
  if (!role) return null
  return {
    userId: integer(claims.user_id),
    firstName: text(claims.first_name),
    lastName: text(claims.last_name),
    email: text(claims.email),
    role,
    roleDisplayName: text(claims.role_display_name),
    tenantId: integer(claims.tenant_id),
    expiresAt: timestamp(claims.expires_at),
  }
}

function base64UrlDecode(segment: string): string {
  const base64 = segment.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '='))
  return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)))
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function integer(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) ? value : null
}

// Auth sends Unix seconds; accept milliseconds or an ISO string too, in case the gateway's serialiser changes.
function timestamp(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value < 1e12 ? value * 1000 : value
  if (typeof value === 'string' && value.trim()) {
    const parsed = /^\d+$/.test(value) ? timestamp(Number(value)) : Date.parse(value)
    return parsed !== null && Number.isFinite(parsed) ? parsed : null
  }
  return null
}
