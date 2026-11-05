import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { isPreviewHost } from './payment-mode';
import { z } from 'zod';
import { proposalTokenSchema } from './proposal-rules';
import { createStripeClient, getStripeErrorMessage } from './stripe.server';

type Result = { clientSecret: string } | { error: string };

// The deposit amount is always read from the stored proposal, never from the browser.
export const createProposalDepositCheckout = createServerFn({ method: 'POST' })
  .inputValidator((v: unknown) => z.object({
    token: proposalTokenSchema,
    environment: z.enum(['sandbox', 'live']),
    returnUrl: z.string().max(500).optional(),
  }).parse(v))
  .handler(async ({ data }): Promise<Result> => {
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { data: proposal } = await supabaseAdmin.from('moving_proposals')
      .select('id,job_id,deposit_cents,signed_at,revoked_at,snapshot').eq('token', data.token).maybeSingle();
    if (!proposal || proposal.revoked_at) return { error: 'This proposal is no longer available.' };
    if (!proposal.signed_at) return { error: 'Please sign the estimate before paying the deposit.' };
    // A withdrawn job (cancelled/declined) or one already past the estimate stage cannot take a deposit.
    const { data: job } = await supabaseAdmin.from('workspace_records')
      .select('data').eq('id', proposal.job_id).eq('kind', 'job').maybeSingle();
    const jobStatus = String((job?.data as Record<string, unknown> | null)?.['status'] ?? '').toLowerCase();
    if ((job?.data as Record<string, unknown> | null)?.['testApproval']) return { error: 'This job was manually approved for testing; no deposit is collected.' };
    if (!job || ['cancelled', 'canceled', 'declined', 'lost', 'archived'].includes(jobStatus))
      return { error: 'This proposal is no longer available.' };
    if (proposal.deposit_cents < 50) return { error: 'No online deposit is required for this proposal.' };

    const { data: prior } = await supabaseAdmin.from('proposal_checkouts')
      .select('id,status').eq('proposal_id', proposal.id).eq('environment', data.environment).in('status', ['creating', 'open', 'paid']);
    if (prior?.some(c => c.status === 'paid')) return { error: 'This deposit has already been paid.' };
    if (prior?.length) await supabaseAdmin.from('proposal_checkouts').update({ status: 'replaced' }).in('id', prior.map(c => c.id));

    const { data: row, error: insertError } = await supabaseAdmin.from('proposal_checkouts')
      .insert({ proposal_id: proposal.id, environment: data.environment, amount_cents: proposal.deposit_cents, status: 'creating', created_on_preview: isPreviewHost(new URL(getRequest().url).hostname) })
      .select('id').single();
    if (insertError || !row) return { error: 'Could not start the deposit payment. Please try again.' };

    try {
      const snapshot = proposal.snapshot as { job?: { customerName?: string; moveDate?: string } };
      const description = `Moving deposit · estimate #${proposal.job_id}`;
      const stripe = createStripeClient(data.environment);
      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        ui_mode: 'embedded_page',
        // Return address is built server-side from this app's own origin; the browser value is ignored.
        return_url: `${new URL(getRequest().url).origin}/proposal/${data.token}?session_id={CHECKOUT_SESSION_ID}`,
        line_items: [{
          quantity: 1,
          price_data: {
            currency: 'usd',
            unit_amount: proposal.deposit_cents,
            product_data: { name: 'Moving booking deposit', description: snapshot.job?.moveDate ? `Move date ${snapshot.job.moveDate}` : undefined },
          },
        }],
        payment_intent_data: { description },
        metadata: { proposalId: proposal.id, checkoutId: row.id },
      });
      await supabaseAdmin.from('proposal_checkouts').update({ session_id: session.id, status: 'open' }).eq('id', row.id);
      return { clientSecret: session.client_secret ?? '' };
    } catch (error) {
      await supabaseAdmin.from('proposal_checkouts').update({ status: 'failed' }).eq('id', row.id);
      return { error: getStripeErrorMessage(error) };
    }
  });
