CREATE TABLE public.intake_ip_limits (
 ip_hash text PRIMARY KEY CHECK (length(ip_hash)=64),
 requests timestamptz[] NOT NULL DEFAULT '{}',
 updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.intake_ip_limits TO service_role;
ALTER TABLE public.intake_ip_limits ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.consume_intake_ip_limit(_hash text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE stamps timestamptz[]; t timestamptz := clock_timestamp(); wait_seconds integer;
BEGIN
 IF _hash IS NULL OR _hash !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'Invalid IP hash'; END IF;
 INSERT INTO public.intake_ip_limits(ip_hash) VALUES(_hash) ON CONFLICT DO NOTHING;
 SELECT requests INTO stamps FROM public.intake_ip_limits WHERE ip_hash=_hash FOR UPDATE;
 t := clock_timestamp();
 SELECT coalesce(array_agg(s ORDER BY s), '{}') INTO stamps FROM unnest(stamps) s WHERE s > t - interval '60 seconds';
 IF cardinality(stamps) >= 10 THEN
  wait_seconds := greatest(1, ceil(extract(epoch FROM (stamps[1] + interval '60 seconds' - t)))::integer);
  RETURN jsonb_build_object('allowed',false,'retryAfter',wait_seconds);
 END IF;
 UPDATE public.intake_ip_limits SET requests=array_append(stamps,t),updated_at=t WHERE ip_hash=_hash;
 DELETE FROM public.intake_ip_limits WHERE ip_hash IN (SELECT ip_hash FROM public.intake_ip_limits WHERE updated_at < t - interval '1 day' LIMIT 100);
 RETURN jsonb_build_object('allowed',true,'retryAfter',0);
END $$;
REVOKE ALL ON FUNCTION public.consume_intake_ip_limit(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.consume_intake_ip_limit(text) TO service_role;
ALTER TABLE public.moving_proposals ADD COLUMN test_approved_at timestamptz;
ALTER TABLE public.moving_proposals ADD COLUMN test_approved_by uuid;
CREATE OR REPLACE FUNCTION public.book_job_for_preview(_ws bigint, _job bigint, _actor uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE j public.workspace_records; stamp timestamptz:=now();
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.workspace_members WHERE workspace_id=_ws AND user_id=_actor AND role IN ('admin','office_admin')) THEN RAISE EXCEPTION 'Only admins can approve test bookings'; END IF;
 IF EXISTS(SELECT 1 FROM public.workspaces WHERE id=_ws AND subscription_status IN ('past_due','canceled','suspended')) THEN RAISE EXCEPTION 'Workspace is read-only'; END IF;
 SELECT * INTO j FROM public.workspace_records WHERE workspace_id=_ws AND id=_job AND kind='job' FOR UPDATE;
 IF j.id IS NULL THEN RAISE EXCEPTION 'Job not found'; END IF;
 IF j.data->>'status'='booked' AND j.data->'testApproval' IS NOT NULL THEN RETURN j.data; END IF;
 IF coalesce(j.data->>'status','') <> 'estimate' THEN RAISE EXCEPTION 'Only estimates can be approved for testing'; END IF;
 UPDATE public.moving_proposals SET test_approved_at=stamp,test_approved_by=_actor WHERE workspace_id=_ws AND job_id=_job AND revoked_at IS NULL;
 UPDATE public.workspace_records SET data=data || jsonb_build_object('status','booked','testApproval',jsonb_build_object('at',stamp,'by',_actor,'paymentBypassed',true)),updated_at=stamp WHERE id=j.id;
 RETURN j.data || jsonb_build_object('status','booked');
END $$;
REVOKE ALL ON FUNCTION public.book_job_for_preview(bigint,bigint,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.book_job_for_preview(bigint,bigint,uuid) TO service_role;