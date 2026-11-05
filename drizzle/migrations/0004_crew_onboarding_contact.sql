CREATE OR REPLACE FUNCTION public.crew_onboarding_info(_token text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object('workspace_name', x.workspace_name, 'crew_role', x.crew_role, 'valid', x.valid, 'email', x.email)
  FROM (
    SELECT w.name AS workspace_name, 'helper'::text AS crew_role, (i.status = 'pending' AND i.expires_at > now()) AS valid, coalesce(i.email, '') AS email
    FROM public.workspace_invitations i JOIN public.workspaces w ON w.id = i.workspace_id WHERE i.token::text = _token
    UNION ALL
    SELECT w.name, i.crew_role, (i.accepted_at IS NULL AND i.expires_at > now()), i.email
    FROM public.crew_invites i JOIN public.workspaces w ON w.id = i.workspace_id WHERE i.token = _token
  ) x LIMIT 1
$$;
REVOKE EXECUTE ON FUNCTION public.crew_onboarding_info(text) FROM public;
GRANT EXECUTE ON FUNCTION public.crew_onboarding_info(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.register_crew_invite(_token text, _name text, _phone text, _crew_role text, _email text)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE ws bigint; contact_email text := lower(trim(coalesce(_email, '')));
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Please sign in first'; END IF;
  IF contact_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' OR length(contact_email) > 254 THEN
    RAISE EXCEPTION 'Please enter a valid email address';
  END IF;
  ws := public.accept_crew_invite(_token, trim(_name), trim(_phone), _crew_role);
  UPDATE public.workspace_records
  SET data = data || jsonb_build_object('name', trim(_name), 'email', contact_email), updated_at = now()
  WHERE workspace_id = ws AND kind = 'crew' AND data->>'userId' = auth.uid()::text;
  RETURN ws;
END $$;
REVOKE EXECUTE ON FUNCTION public.register_crew_invite(text,text,text,text,text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.register_crew_invite(text,text,text,text,text) TO authenticated;