// jwtClaims.ts — minimal JWT payload decoder.
//
// Decodes the *unverified* payload for local session-consistency checks only
// (e.g. comparing a freshly minted token against the rehydrated user). It does
// NOT verify the signature — never use this for authz decisions.
// Returns null on any malformed/missing token.
export function decodeJwtClaims(token: string): { sub?: string; role?: string; tid?: string } | null {
  try {
    const parts = token.split('.')
    if (parts.length < 2) return null
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const padded = b64.padEnd(b64.length + ((4 - (b64.length % 4)) % 4), '=')
    const bytes = Uint8Array.from(atob(padded), (c) => c.charCodeAt(0))
    const payload = JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>
    return {
      sub: typeof payload.sub === 'string' ? payload.sub : undefined,
      role: typeof payload.role === 'string' ? payload.role : undefined,
      tid: typeof payload.tid === 'string' ? payload.tid : undefined,
    }
  } catch {
    return null
  }
}
