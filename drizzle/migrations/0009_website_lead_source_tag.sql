CREATE OR REPLACE FUNCTION public.receive_integration_lead(_hash text, _request_id text, _data jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE k public.workspace_integration_keys; cid bigint; old_id bigint;
BEGIN
 SELECT * INTO k FROM public.workspace_integration_keys WHERE key_hash=_hash AND revoked_at IS NULL FOR UPDATE;
 IF k.id IS NULL THEN RAISE EXCEPTION 'Invalid intake credential'; END IF;
 SELECT customer_id INTO old_id FROM public.integration_lead_receipts WHERE key_id=k.id AND request_id=_request_id;
 IF old_id IS NOT NULL THEN RETURN jsonb_build_object('duplicate',true); END IF;
 IF (SELECT count(*) FROM public.integration_lead_receipts WHERE workspace_id=k.workspace_id AND created_at > now()-interval '1 minute') >= 30 THEN RAISE EXCEPTION 'Quote rate limit exceeded'; END IF;
 IF jsonb_typeof(_data)<>'object' OR length(_data::text)>12000 OR length(coalesce(_data->>'name','')) NOT BETWEEN 1 AND 180 THEN RAISE EXCEPTION 'Invalid quote'; END IF;
 INSERT INTO public.workspace_records(workspace_id,kind,data) VALUES(k.workspace_id,'customer',_data || jsonb_build_object('status','new','source','Website Lead','sourceChannel',CASE k.kind WHEN 'widget' THEN 'Web widget' WHEN 'webhook' THEN 'Inbound webhook' ELSE 'Public API' END,'score',0)) RETURNING id INTO cid;
 INSERT INTO public.integration_lead_receipts(workspace_id,key_id,request_id,customer_id) VALUES(k.workspace_id,k.id,_request_id,cid);
 UPDATE public.workspace_integration_keys SET last_used_at=now() WHERE id=k.id;
 RETURN jsonb_build_object('duplicate',false);
END $$;
REVOKE ALL ON FUNCTION public.receive_integration_lead(text,text,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.receive_integration_lead(text,text,jsonb) TO service_role;