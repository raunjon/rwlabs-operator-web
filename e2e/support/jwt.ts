// A gateway-shaped JWT for e2e tests. The panel never checks signatures, so a placeholder signature is enough.
export function jwt(claims: Record<string, unknown> = {}): string {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${encode({ alg: 'HS256' })}.${encode({
    user_id: 7,
    first_name: 'Asha',
    last_name: 'Rao',
    email: 'asha@example.com',
    role_name: 'admin',
    role_display_name: 'Admin',
    tenant_id: 3,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    ...claims,
  })}.signature`
}
