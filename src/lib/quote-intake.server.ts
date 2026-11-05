import { quoteSchema } from './proposal-rules';
import { z } from 'zod';
import { enforceIntakeLimit } from './intake-limit.server';

const origins = new Set(['https://northwestmovingcrew.com','https://www.northwestmovingcrew.com']);
export async function handleWebsiteQuote(request: Request) {
  // Workspace API keys from the Integrations hub use the multi-tenant lead intake.
  const auth = request.headers.get('Authorization') ?? '';
  if (/^Bearer (nw_pub|sk)_/.test(auth)) return (await import('./lead-intake.server')).handleIntegrationLead(request);
  if (request.method==='OPTIONS' && /authorization/i.test(request.headers.get('Access-Control-Request-Headers') ?? '') && !origins.has(request.headers.get('Origin') ?? '')) return new Response(null,{ status:204, headers:(await import('./lead-intake.server')).leadCors });
  const origin = request.headers.get('Origin');
  const headers = new Headers({ 'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin' });
  if (origin && origins.has(origin)) headers.set('Access-Control-Allow-Origin',origin);
  headers.set('Access-Control-Allow-Methods','POST, OPTIONS');
  headers.set('Access-Control-Allow-Headers','Content-Type, Authorization, Idempotency-Key');
  const reply = (status:number, body:unknown) => Response.json(body,{ status,headers });
  if (origin && !origins.has(origin)) return reply(403,{ error:'Origin not allowed' });
  if (request.method==='OPTIONS') return new Response(null,{ status:204,headers });
  const limited = await enforceIntakeLimit(request, headers);
  if (limited) return limited;
  const token = request.headers.get('Authorization')?.replace(/^Bearer /,'');
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return reply(401,{ error:'A website intake credential is required' });
  const requestId = z.string().min(8).max(100).regex(/^[a-zA-Z0-9_-]+$/).safeParse(request.headers.get('Idempotency-Key'));
  if (!requestId.success) return reply(400,{ error:'Provide an Idempotency-Key for this submission' });
  const raw = await request.text();
  if (raw.length>16000) return reply(413,{ error:'Submission too large' });
  let parsed;
  try { parsed = quoteSchema.safeParse(JSON.parse(raw)); } catch { return reply(400,{ error:'Invalid JSON' }); }
  if (!parsed.success) return reply(400,{ error:'Check quote fields',fields:parsed.error.flatten().fieldErrors });
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token))),v=>v.toString(16).padStart(2,'0')).join('');
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const b = parsed.data;
  const { data,error } = await supabaseAdmin.rpc('receive_website_quote',{ _hash:hash,_request_id:requestId.data,_data:{ ...b, notes:`Move date: ${b.moveDate}\nPickup: ${b.origin}\nDelivery: ${b.destination}\nMove size: ${b.moveSize}\n${b.message}` } });
  if (error) {
    if (error.message.includes('credential')) return reply(401,{ error:'Invalid intake credential' });
    if (error.message.includes('rate limit')) return reply(429,{ error:'Too many submissions; retry shortly' });
    return reply(503,{ error:'The quote could not be saved; retry with the same Idempotency-Key' });
  }
  // Do not return lead IDs or customer details to external callers.
  return reply(201,{ received:true });
}