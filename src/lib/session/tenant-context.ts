import { useSession, type Session } from './session'

// The tenant the tenant shell works in (spec §5.3). Features read it from here, never straight from the JWT's
// tenant_id, so "act as tenant" can later change it without touching them. In v1 it always is the JWT's tenant.
export interface TenantContext {
  tenantId: number
}

export function tenantContextFor(session: Session | null): TenantContext | null {
  return session?.tenantId != null ? { tenantId: session.tenantId } : null
}

export function useTenantContext(): TenantContext | null {
  return tenantContextFor(useSession())
}

// The API client's one hook for tenant context on outgoing requests. v1 adds nothing: the gateway reads the tenant
// from the JWT. Impersonation would set the acting-tenant header here.
export function attachTenantContext(request: Request): Request {
  return request
}
