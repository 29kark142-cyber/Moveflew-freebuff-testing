ALTER TABLE public.workspaces ADD COLUMN IF NOT EXISTS deposit_rule jsonb;
CREATE TABLE public.quote_intake_connections (
 workspace_id bigint PRIMARY KEY REFERENCES public.workspaces(id), token_hash text NOT NULL UNIQUE, created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.quote_intake_connections TO authenticated;
GRANT ALL ON public.quote_intake_connections TO service_role;
ALTER TABLE public.quote_intake_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Managers read intake configuration" ON public.quote_intake_connections FOR SELECT TO authenticated USING (public.workspace_role(workspace_id) IN ('admin','office_admin'));
CREATE TABLE public.quote_intake_receipts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id bigint NOT NULL REFERENCES public.workspaces(id), request_id text NOT NULL, customer_id bigint NOT NULL REFERENCES public.workspace_records(id), created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(workspace_id,request_id)
);
GRANT ALL ON public.quote_intake_receipts TO service_role;
ALTER TABLE public.quote_intake_receipts ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.moving_proposals (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id bigint NOT NULL REFERENCES public.workspaces(id), job_id bigint NOT NULL REFERENCES public.workspace_records(id), token text NOT NULL UNIQUE DEFAULT replace(gen_random_uuid()::text,'-',''), snapshot jsonb NOT NULL, deposit_cents integer NOT NULL DEFAULT 0 CHECK(deposit_cents >= 0), signature text, signed_at timestamptz, accepted_terms boolean NOT NULL DEFAULT false, revoked_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.moving_proposals TO authenticated;
GRANT ALL ON public.moving_proposals TO service_role;
ALTER TABLE public.moving_proposals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Managers read proposals" ON public.moving_proposals FOR SELECT TO authenticated USING (public.workspace_role(workspace_id) IN ('admin','office_admin','estimator'));
CREATE TABLE public.proposal_checkouts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), proposal_id uuid NOT NULL REFERENCES public.moving_proposals(id), environment text NOT NULL CHECK(environment IN ('sandbox','live')), session_id text UNIQUE, amount_cents integer NOT NULL CHECK(amount_cents > 0), status text NOT NULL DEFAULT 'creating', created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.proposal_checkouts TO authenticated;
GRANT ALL ON public.proposal_checkouts TO service_role;
ALTER TABLE public.proposal_checkouts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Managers read proposal payments" ON public.proposal_checkouts FOR SELECT TO authenticated USING (EXISTS(SELECT 1 FROM public.moving_proposals p WHERE p.id=proposal_id AND public.workspace_role(p.workspace_id) IN ('admin','office_admin')));
CREATE UNIQUE INDEX one_active_proposal_checkout ON public.proposal_checkouts(proposal_id,environment) WHERE status IN ('creating','open','paid');
CREATE OR REPLACE FUNCTION public.receive_website_quote(_hash text, _request_id text, _data jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE ws bigint; cid bigint; old_id bigint;
BEGIN
 SELECT workspace_id INTO ws FROM public.quote_intake_connections WHERE token_hash=_hash FOR UPDATE;
 IF ws IS NULL THEN RAISE EXCEPTION 'Invalid intake credential'; END IF;
 SELECT customer_id INTO old_id FROM public.quote_intake_receipts WHERE workspace_id=ws AND request_id=_request_id;
 IF old_id IS NOT NULL THEN RETURN jsonb_build_object('leadId',old_id,'duplicate',true); END IF;
 IF (SELECT count(*) FROM public.quote_intake_receipts WHERE workspace_id=ws AND created_at > now()-interval '1 minute') >= 30 THEN RAISE EXCEPTION 'Quote rate limit exceeded'; END IF;
 IF jsonb_typeof(_data) <> 'object' OR length(_data::text)>12000 OR length(coalesce(_data->>'name','')) NOT BETWEEN 1 AND 180 THEN RAISE EXCEPTION 'Invalid quote'; END IF;
 INSERT INTO public.workspace_records(workspace_id,kind,data) VALUES(ws,'customer',_data || jsonb_build_object('status','new','source','northwestmovingcrew.com','score',0)) RETURNING id INTO cid;
 INSERT INTO public.quote_intake_receipts(workspace_id,request_id,customer_id) VALUES(ws,_request_id,cid);
 RETURN jsonb_build_object('leadId',cid,'duplicate',false);
END $$;
REVOKE ALL ON FUNCTION public.receive_website_quote(text,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.receive_website_quote(text,text,jsonb) TO service_role;
CREATE OR REPLACE FUNCTION public.view_moving_proposal(_token text) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT p.snapshot || jsonb_build_object('depositCents',p.deposit_cents,'signed',p.signed_at IS NOT NULL,'proposalId',p.id,'paid',EXISTS(SELECT 1 FROM public.proposal_checkouts c WHERE c.proposal_id=p.id AND c.status='paid' AND c.environment='live'))
 FROM public.moving_proposals p JOIN public.workspace_records j ON j.id=p.job_id AND j.workspace_id=p.workspace_id
 WHERE p.token=_token AND length(_token)=32 AND p.revoked_at IS NULL AND j.kind='job' AND coalesce(j.data->>'status','') NOT IN ('cancelled','declined')
$$;
REVOKE ALL ON FUNCTION public.view_moving_proposal(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.view_moving_proposal(text) TO anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.sign_moving_proposal(_token text, _signature text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p public.moving_proposals; j public.workspace_records;
BEGIN
 SELECT * INTO p FROM public.moving_proposals WHERE token=_token AND revoked_at IS NULL FOR UPDATE;
 IF p.id IS NULL THEN RAISE EXCEPTION 'Proposal unavailable'; END IF;
 SELECT * INTO j FROM public.workspace_records WHERE id=p.job_id AND workspace_id=p.workspace_id FOR UPDATE;
 IF j.id IS NULL OR j.data->>'status' IN ('cancelled','declined') THEN RAISE EXCEPTION 'Proposal unavailable'; END IF;
 IF p.signed_at IS NOT NULL THEN RETURN jsonb_build_object('signed',true); END IF;
 IF length(_signature)>300000 OR _signature NOT LIKE 'data:image/png;base64,iVBOR%' THEN RAISE EXCEPTION 'Invalid signature'; END IF;
 UPDATE public.moving_proposals SET signature=_signature,signed_at=now(),accepted_terms=true WHERE id=p.id;
 UPDATE public.workspace_records SET data=data || jsonb_build_object('signature',_signature,'proposalSignedAt',now()),updated_at=now() WHERE id=p.job_id;
 RETURN jsonb_build_object('signed',true);
END $$;
REVOKE ALL ON FUNCTION public.sign_moving_proposal(text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.sign_moving_proposal(text,text) TO service_role;
CREATE OR REPLACE FUNCTION public.settle_proposal_checkout(_session text,_environment text,_subtotal integer,_paid integer,_currency text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c public.proposal_checkouts; p public.moving_proposals; j public.workspace_records;
BEGIN
 SELECT * INTO c FROM public.proposal_checkouts WHERE session_id=_session AND environment=_environment FOR UPDATE;
 IF c.id IS NULL THEN RETURN false; END IF;
 IF c.amount_cents<>_subtotal OR _paid<_subtotal OR _currency<>'usd' THEN RAISE EXCEPTION 'Payment amount mismatch'; END IF;
 IF c.status='paid' THEN RETURN true; END IF;
 SELECT * INTO p FROM public.moving_proposals WHERE id=c.proposal_id FOR UPDATE;
 SELECT * INTO j FROM public.workspace_records WHERE id=p.job_id AND workspace_id=p.workspace_id FOR UPDATE;
 IF p.signed_at IS NULL THEN RAISE EXCEPTION 'Proposal not signed'; END IF;
 UPDATE public.proposal_checkouts SET status='paid' WHERE id=c.id;
 IF j.data->>'status'='estimate' AND p.revoked_at IS NULL AND _environment='live' THEN
 UPDATE public.workspace_records SET data=data || jsonb_build_object('status','booked','depositPaidCents',_subtotal,'depositPaymentSession',_session),updated_at=now() WHERE id=j.id;
 END IF;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.settle_proposal_checkout(text,text,integer,integer,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.settle_proposal_checkout(text,text,integer,integer,text) TO service_role;