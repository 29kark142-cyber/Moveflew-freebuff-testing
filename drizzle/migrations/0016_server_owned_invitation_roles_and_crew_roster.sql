CREATE OR REPLACE FUNCTION public.accept_crew_invite(_token text, _name text, _phone text, _crew_role text)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE inv public.crew_invites; wi public.workspace_invitations; uid uuid := auth.uid(); mail text;
  ws bigint; mrole text := 'crew'; rate numeric := 0; cand bigint; assigned_role text := 'helper'; candidate_data jsonb;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Please sign in first'; END IF;
  IF length(coalesce(trim(_name),'')) < 2 THEN RAISE EXCEPTION 'Please enter your name'; END IF;
  SELECT * INTO wi FROM public.workspace_invitations WHERE token::text = _token FOR UPDATE;
  IF wi.id IS NOT NULL THEN
    IF wi.status <> 'pending' OR wi.expires_at <= now() THEN RAISE EXCEPTION 'This invite link has expired, was revoked, or was already used'; END IF;
    ws := wi.workspace_id; mrole := wi.role; rate := wi.hourly_rate; cand := wi.candidate_id;
    IF cand IS NOT NULL THEN
      SELECT data INTO candidate_data FROM public.workspace_records WHERE id = cand AND workspace_id = ws AND kind = 'crew' FOR UPDATE;
      IF candidate_data IS NOT NULL THEN
        assigned_role := coalesce(candidate_data->>'crewRole', CASE WHEN candidate_data->>'isDriver' = 'true' THEN 'driver' ELSE 'helper' END);
      END IF;
    END IF;
    UPDATE public.workspace_invitations SET status = 'accepted', accepted_by = uid, accepted_at = now() WHERE id = wi.id;
  ELSE
    SELECT * INTO inv FROM public.crew_invites WHERE token = _token FOR UPDATE;
    IF inv.id IS NULL THEN RAISE EXCEPTION 'This invite link is not valid'; END IF;
    IF inv.accepted_at IS NOT NULL OR inv.expires_at <= now() THEN RAISE EXCEPTION 'This invite link has expired or was already used'; END IF;
    ws := inv.workspace_id; assigned_role := inv.crew_role;
    UPDATE public.crew_invites SET accepted_by = uid, accepted_at = now() WHERE id = inv.id;
  END IF;
  IF assigned_role IS NULL OR assigned_role NOT IN ('driver','helper','crew_lead') THEN assigned_role := 'helper'; END IF;
  SELECT email INTO mail FROM auth.users WHERE id = uid;
  INSERT INTO public.workspace_members(workspace_id, user_id, name, email, role)
    VALUES (ws, uid, trim(_name), coalesce(mail,''), mrole)
    ON CONFLICT (workspace_id, user_id) DO NOTHING;
  IF candidate_data IS NOT NULL THEN
    UPDATE public.workspace_records SET data = data || jsonb_build_object('userId', uid, 'phone', coalesce(_phone,''),
      'isDriver', assigned_role = 'driver', 'crewRole', assigned_role, 'hourlyRate', rate, 'status', 'active'), updated_at = now()
      WHERE id = cand AND workspace_id = ws AND kind = 'crew';
  ELSE
    INSERT INTO public.workspace_records(workspace_id, kind, data) VALUES (ws, 'crew',
      jsonb_build_object('userId', uid, 'name', trim(_name), 'email', coalesce(mail,''), 'phone', coalesce(_phone,''),
        'isDriver', assigned_role = 'driver', 'crewRole', assigned_role, 'skillLevel', CASE WHEN assigned_role='crew_lead' THEN 3 ELSE 1 END,
        'hourlyRate', rate, 'status', 'active'));
  END IF;
  RETURN ws;
END $$;
REVOKE EXECUTE ON FUNCTION public.accept_crew_invite(text,text,text,text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.accept_crew_invite(text,text,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.crew_onboarding_info(_token text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object('workspace_name', x.workspace_name, 'crew_role', x.crew_role, 'valid', x.valid, 'email', x.email)
  FROM (
    SELECT w.name AS workspace_name,
      CASE WHEN c.data->>'crewRole' IN ('helper','driver','crew_lead') THEN c.data->>'crewRole'
        WHEN c.data->>'isDriver' = 'true' THEN 'driver' ELSE 'helper' END AS crew_role,
      (i.status = 'pending' AND i.expires_at > now()) AS valid, coalesce(i.email, '') AS email
    FROM public.workspace_invitations i JOIN public.workspaces w ON w.id = i.workspace_id
    LEFT JOIN public.workspace_records c ON c.id = i.candidate_id AND c.workspace_id = i.workspace_id AND c.kind = 'crew'
    WHERE i.token::text = _token
    UNION ALL
    SELECT w.name, i.crew_role, (i.accepted_at IS NULL AND i.expires_at > now()), i.email
    FROM public.crew_invites i JOIN public.workspaces w ON w.id = i.workspace_id WHERE i.token = _token
  ) x LIMIT 1
$$;
GRANT EXECUTE ON FUNCTION public.crew_onboarding_info(text) TO anon, authenticated;

CREATE POLICY "Crew cannot change roster directly" ON public.workspace_records AS RESTRICTIVE FOR UPDATE TO authenticated
USING (public.workspace_role(workspace_id) <> 'crew' OR kind <> 'crew')
WITH CHECK (public.workspace_role(workspace_id) <> 'crew' OR kind <> 'crew');
CREATE POLICY "Crew cannot create roster directly" ON public.workspace_records AS RESTRICTIVE FOR INSERT TO authenticated
WITH CHECK (public.workspace_role(workspace_id) <> 'crew' OR kind <> 'crew');