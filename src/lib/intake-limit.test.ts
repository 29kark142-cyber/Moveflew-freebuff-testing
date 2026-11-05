import { describe, expect, it, vi, beforeEach } from 'vitest';
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/integrations/supabase/client.server', () => ({ supabaseAdmin: { rpc } }));
import { enforceIntakeLimit, intakeIpKey } from './intake-limit.server';

describe('intake IP limits', () => {
  beforeEach(() => rpc.mockReset());
  it('does not use caller-supplied forwarded IP addresses', () => {
    expect(intakeIpKey(new Request('https://example.com', { headers: { 'x-forwarded-for': '1.2.3.4' } }))).toBe('unknown-edge-client');
    expect(intakeIpKey(new Request('https://example.com', { headers: { 'cf-connecting-ip': '192.0.2.1' } }))).toBe('192.0.2.1');
  });
  it('allows requests admitted by the shared atomic database limiter', async () => {
    rpc.mockResolvedValue({ data: { allowed: true, retryAfter: 0 }, error: null });
    expect(await enforceIntakeLimit(new Request('https://example.com'), {})).toBeNull();
    expect(rpc).toHaveBeenCalledWith('consume_intake_ip_limit', { _hash: expect.stringMatching(/^[a-f0-9]{64}$/) });
  });
  it('returns 429 with retry guidance when the rolling 10-request limit is full', async () => {
    rpc.mockResolvedValue({ data: { allowed: false, retryAfter: 37 }, error: null });
    const response = await enforceIntakeLimit(new Request('https://example.com'), { 'Access-Control-Allow-Origin': '*' });
    expect(response?.status).toBe(429);
    expect(response?.headers.get('Retry-After')).toBe('37');
    expect(response?.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });
  it('fails closed when the database limiter is unavailable', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'Unavailable' } });
    expect((await enforceIntakeLimit(new Request('https://example.com'), {}))?.status).toBe(503);
  });
});