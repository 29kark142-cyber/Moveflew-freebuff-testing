import { isIP } from 'node:net';

// Only the edge-provided client IP is used; never trust caller-controlled X-Forwarded-For.
// Missing edge metadata shares a conservative bucket (including local testing).
export function intakeIpKey(request: Request) {
  const ip = request.headers.get('cf-connecting-ip')?.trim();
  return ip && isIP(ip) ? ip.toLowerCase() : 'unknown-edge-client';
}

export async function enforceIntakeLimit(request: Request, headers: HeadersInit): Promise<Response | null> {
  const h = new Headers(headers);
  h.set('Cache-Control', 'no-store');
  try {
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(intakeIpKey(request)));
    const hash = Array.from(new Uint8Array(bytes), v => v.toString(16).padStart(2, '0')).join('');
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { data, error } = await supabaseAdmin.rpc('consume_intake_ip_limit', { _hash: hash });
    const result = data as { allowed?: boolean; retryAfter?: number } | null;
    if (error || typeof result?.allowed !== 'boolean') throw new Error('Limiter unavailable');
    if (result.allowed) return null;
    h.set('Retry-After', String(result.retryAfter || 60));
    return Response.json({ error: 'Maximum 10 requests per minute; retry shortly' }, { status: 429, headers: h });
  } catch {
    return Response.json({ error: 'Intake temporarily unavailable; retry shortly' }, { status: 503, headers: h });
  }
}