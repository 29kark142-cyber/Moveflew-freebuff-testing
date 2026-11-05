ALTER TABLE public.proposal_checkouts ADD COLUMN IF NOT EXISTS created_on_preview boolean NOT NULL DEFAULT false;
CREATE OR REPLACE FUNCTION public.settle_proposal_checkout(_session text,_environment text,_subtotal integer,_paid integer,_currency text,_livemode boolean) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c public.proposal_checkouts; p public.moving_proposals; j public.workspace_records; books boolean;
BEGIN
 SELECT * INTO c FROM public.proposal_checkouts WHERE session_id=_session AND environment=_environment FOR UPDATE;
 IF c.id IS NULL THEN RETURN false; END IF;
 IF c.amount_cents<>_subtotal OR _paid<_subtotal OR _currency<>'usd' THEN RAISE EXCEPTION 'Payment amount mismatch'; END IF;
 IF c.status='paid' THEN RETURN true; END IF;
 -- livemode must agree with the credentials that verified the webhook
 IF _livemode <> (_environment='live') THEN RAISE EXCEPTION 'Payment mode mismatch'; END IF;
 SELECT * INTO p FROM public.moving_proposals WHERE id=c.proposal_id FOR UPDATE;
 SELECT * INTO j FROM public.workspace_records WHERE id=p.job_id AND workspace_id=p.workspace_id FOR UPDATE;
 IF p.signed_at IS NULL THEN RAISE EXCEPTION 'Proposal not signed'; END IF;
 UPDATE public.proposal_checkouts SET status='paid' WHERE id=c.id;
 books := p.revoked_at IS NULL AND j.data->>'status'='estimate' AND (_livemode OR c.created_on_preview);
 UPDATE public.workspace_records SET data=data
   || jsonb_build_object('depositPaidCents',_subtotal,'depositPaidAt',now(),'depositPaymentSession',_session,'depositMode',CASE WHEN _livemode THEN 'live' ELSE 'test' END)
   || CASE WHEN books THEN jsonb_build_object('status','booked') ELSE '{}'::jsonb END,
   updated_at=now() WHERE id=j.id;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.settle_proposal_checkout(text,text,integer,integer,text,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.settle_proposal_checkout(text,text,integer,integer,text,boolean) TO service_role;