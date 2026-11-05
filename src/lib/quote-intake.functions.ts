import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';

export const configureQuoteIntake = createServerFn({ method:'POST' }).middleware([requireSupabaseAuth])
  .inputValidator((v:unknown) => z.object({ workspaceId:z.number().int().positive() }).parse(v))
  .handler(async ({ data, context }) => {
    const role = await context.supabase.rpc('workspace_role',{ _ws:data.workspaceId });
    if (role.error || role.data !== 'admin') throw new Error('Only workspace admins can configure website intake');
    const token = crypto.randomUUID().replace(/-/g,'') + crypto.randomUUID().replace(/-/g,'');
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token))),v=>v.toString(16).padStart(2,'0')).join('');
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { error } = await supabaseAdmin.from('quote_intake_connections').upsert({ workspace_id:data.workspaceId,token_hash:hash });
    if (error) throw new Error('Could not configure quote intake');
    // Reveal once to this authenticated workspace admin, never log or persist plaintext.
    return { token };
  });