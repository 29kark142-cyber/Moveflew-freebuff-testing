CREATE OR REPLACE FUNCTION public.view_moving_proposal(_token text) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT p.snapshot || jsonb_build_object('depositCents',p.deposit_cents,'signed',p.signed_at IS NOT NULL,'proposalId',p.id,'testApproved',p.test_approved_at IS NOT NULL,'paid',EXISTS(SELECT 1 FROM public.proposal_checkouts c WHERE c.proposal_id=p.id AND c.status='paid' AND c.environment='live'))
 FROM public.moving_proposals p JOIN public.workspace_records j ON j.id=p.job_id AND j.workspace_id=p.workspace_id
 WHERE p.token=_token AND length(_token)=32 AND p.revoked_at IS NULL AND j.kind='job' AND coalesce(j.data->>'status','') NOT IN ('cancelled','declined')
$$;
REVOKE ALL ON FUNCTION public.view_moving_proposal(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.view_moving_proposal(text) TO anon,authenticated,service_role;