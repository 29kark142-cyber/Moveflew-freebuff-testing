CREATE TABLE public.workspace_invitations (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  workspace_id bigint NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'link',
  email text,
  role text NOT NULL DEFAULT 'crew',
  hourly_rate numeric(10,2) NOT NULL DEFAULT 0,
  candidate_id bigint,
  token uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'pending',
  send_count int NOT NULL DEFAULT 0,
  last_sent_at timestamptz,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  accepted_by uuid,
  accepted_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT now() + interval '14 days',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT workspace_invitations_status_chk CHECK (status IN ('pending','accepted','revoked')),
  CONSTRAINT workspace_invitations_role_chk CHECK (role IN ('crew','dispatcher','estimator','office_admin','admin'))
);
CREATE INDEX workspace_invitations_ws_idx ON public.workspace_invitations(workspace_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE ON public.workspace_invitations TO authenticated;
GRANT ALL ON public.workspace_invitations TO service_role;
ALTER TABLE public.workspace_invitations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Managers view invitations" ON public.workspace_invitations FOR SELECT TO authenticated
  USING (public.workspace_role(workspace_id) IN ('admin','office_admin'));
CREATE POLICY "Managers create invitations" ON public.workspace_invitations FOR INSERT TO authenticated
  WITH CHECK (public.workspace_role(workspace_id) IN ('admin','office_admin'));
CREATE POLICY "Managers update invitations" ON public.workspace_invitations FOR UPDATE TO authenticated
  USING (public.workspace_role(workspace_id) IN ('admin','office_admin'))
  WITH CHECK (public.workspace_role(workspace_id) IN ('admin','office_admin'));

CREATE OR REPLACE FUNCTION public.crew_invite_info(_token text)
RETURNS TABLE(workspace_name text, crew_role text, valid boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT w.name, 'helper'::text, (i.status = 'pending' AND i.expires_at > now())
  FROM public.workspace_invitations i JOIN public.workspaces w ON w.id = i.workspace_id
  WHERE i.token::text = _token
  UNION ALL
  SELECT w.name, i.crew_role, (i.accepted_at IS NULL AND i.expires_at > now())
  FROM public.crew_invites i JOIN public.workspaces w ON w.id = i.workspace_id
  WHERE i.token = _token
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.accept_crew_invite(_token text, _name text, _phone text, _crew_role text)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE inv public.crew_invites; wi public.workspace_invitations; uid uuid := auth.uid(); mail text;
  ws bigint; mrole text := 'crew'; rate numeric := 0; cand bigint;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Please sign in first'; END IF;
  IF _crew_role NOT IN ('driver','helper','crew_lead') THEN RAISE EXCEPTION 'Choose Driver, Helper or Crew Lead'; END IF;
  IF length(coalesce(trim(_name),'')) < 2 THEN RAISE EXCEPTION 'Please enter your name'; END IF;
  SELECT * INTO wi FROM public.workspace_invitations WHERE token::text = _token FOR UPDATE;
  IF wi.id IS NOT NULL THEN
    IF wi.status <> 'pending' OR wi.expires_at < now() THEN RAISE EXCEPTION 'This invite link has expired, was revoked, or was already used'; END IF;
    ws := wi.workspace_id; mrole := wi.role; rate := wi.hourly_rate; cand := wi.candidate_id;
    UPDATE public.workspace_invitations SET status = 'accepted', accepted_by = uid, accepted_at = now() WHERE id = wi.id;
  ELSE
    SELECT * INTO inv FROM public.crew_invites WHERE token = _token FOR UPDATE;
    IF inv.id IS NULL THEN RAISE EXCEPTION 'This invite link is not valid'; END IF;
    IF inv.accepted_at IS NOT NULL OR inv.expires_at < now() THEN RAISE EXCEPTION 'This invite link has expired or was already used'; END IF;
    ws := inv.workspace_id;
    UPDATE public.crew_invites SET accepted_by = uid, accepted_at = now() WHERE id = inv.id;
  END IF;
  SELECT email INTO mail FROM auth.users WHERE id = uid;
  INSERT INTO public.workspace_members(workspace_id, user_id, name, email, role)
    VALUES (ws, uid, trim(_name), coalesce(mail,''), mrole)
    ON CONFLICT (workspace_id, user_id) DO NOTHING;
  IF cand IS NOT NULL AND EXISTS (SELECT 1 FROM public.workspace_records WHERE id = cand AND workspace_id = ws AND kind = 'crew') THEN
    UPDATE public.workspace_records SET data = data || jsonb_build_object('userId', uid, 'phone', coalesce(_phone,''),
      'isDriver', _crew_role = 'driver', 'crewRole', _crew_role, 'hourlyRate', rate, 'status', 'active'), updated_at = now()
      WHERE id = cand;
  ELSE
    INSERT INTO public.workspace_records(workspace_id, kind, data) VALUES (ws, 'crew',
      jsonb_build_object('userId', uid, 'name', trim(_name), 'email', coalesce(mail,''), 'phone', coalesce(_phone,''),
        'isDriver', _crew_role = 'driver', 'crewRole', _crew_role, 'skillLevel', CASE WHEN _crew_role='crew_lead' THEN 3 ELSE 1 END,
        'hourlyRate', rate, 'status', 'active'));
  END IF;
  RETURN ws;
END $$;
REVOKE EXECUTE ON FUNCTION public.accept_crew_invite(text,text,text,text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.accept_crew_invite(text,text,text,text) TO authenticated;