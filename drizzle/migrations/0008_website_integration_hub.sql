CREATE TABLE public.workspace_integration_keys (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 workspace_id bigint NOT NULL REFERENCES public.workspaces(id),
 kind text NOT NULL CHECK (kind IN ('api','widget','webhook')),
 label text NOT NULL DEFAULT '' CHECK (length(label) <= 80),
 key_hash text NOT NULL UNIQUE,
 key_prefix text NOT NULL,
 public_key text UNIQUE,
 last_used_at timestamptz,
 revoked_at timestamptz,
 created_by uuid NOT NULL DEFAULT auth.uid(),
 created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.workspace_integration_keys TO authenticated;
GRANT ALL ON public.workspace_integration_keys TO service_role;
ALTER TABLE public.workspace_integration_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read integration keys" ON public.workspace_integration_keys FOR SELECT TO authenticated USING (public.workspace_role(workspace_id) = 'admin');
CREATE INDEX workspace_integration_keys_ws ON public.workspace_integration_keys(workspace_id);

CREATE TABLE public.integration_lead_receipts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 workspace_id bigint NOT NULL REFERENCES public.workspaces(id),
 key_id uuid NOT NULL REFERENCES public.workspace_integration_keys(id),
 request_id text NOT NULL,
 customer_id bigint NOT NULL REFERENCES public.workspace_records(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (key_id, request_id)
);
GRANT ALL ON public.integration_lead_receipts TO service_role;
ALTER TABLE public.integration_lead_receipts ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.receive_integration_lead(_hash text, _request_id text, _data jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE k public.workspace_integration_keys; cid bigint; old_id bigint;
BEGIN
 SELECT * INTO k FROM public.workspace_integration_keys WHERE key_hash=_hash AND revoked_at IS NULL FOR UPDATE;
 IF k.id IS NULL THEN RAISE EXCEPTION 'Invalid intake credential'; END IF;
 SELECT customer_id INTO old_id FROM public.integration_lead_receipts WHERE key_id=k.id AND request_id=_request_id;
 IF old_id IS NOT NULL THEN RETURN jsonb_build_object('duplicate',true); END IF;
 IF (SELECT count(*) FROM public.integration_lead_receipts WHERE workspace_id=k.workspace_id AND created_at > now()-interval '1 minute') >= 30 THEN RAISE EXCEPTION 'Quote rate limit exceeded'; END IF;
 IF jsonb_typeof(_data)<>'object' OR length(_data::text)>12000 OR length(coalesce(_data->>'name','')) NOT BETWEEN 1 AND 180 THEN RAISE EXCEPTION 'Invalid quote'; END IF;
 INSERT INTO public.workspace_records(workspace_id,kind,data) VALUES(k.workspace_id,'customer',_data || jsonb_build_object('status','new','source',CASE k.kind WHEN 'widget' THEN 'Website widget' WHEN 'webhook' THEN 'Form webhook' ELSE 'Website API' END,'score',0)) RETURNING id INTO cid;
 INSERT INTO public.integration_lead_receipts(workspace_id,key_id,request_id,customer_id) VALUES(k.workspace_id,k.id,_request_id,cid);
 UPDATE public.workspace_integration_keys SET last_used_at=now() WHERE id=k.id;
 RETURN jsonb_build_object('duplicate',false);
END $$;
REVOKE ALL ON FUNCTION public.receive_integration_lead(text,text,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.receive_integration_lead(text,text,jsonb) TO service_role;