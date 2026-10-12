// Builds a gateway-shaped JWT for tests. The panel never checks signatures, so the signature is a placeholder.
export function makeJwt(claims: Record<string, unknown> = {}): string {
  // UTF-8 bytes, base64url without padding, as real JWTs are.
  const encode = (value: unknown) =>
    btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(value))))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({
    token: 'raw-auth-token',
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
