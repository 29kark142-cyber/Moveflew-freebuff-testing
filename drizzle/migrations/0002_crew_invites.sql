CREATE TABLE public.crew_invites (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  workspace_id bigint NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE DEFAULT replace(gen_random_uuid()::text, '-', ''),
  email text NOT NULL DEFAULT '',
  crew_role text NOT NULL DEFAULT 'helper',
  created_by uuid NOT NULL DEFAULT auth.uid(),
  accepted_by uuid,
  accepted_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT now() + interval '14 days',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.crew_invites TO authenticated;
GRANT ALL ON public.crew_invites TO service_role;
ALTER TABLE public.crew_invites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins view invites" ON public.crew_invites FOR SELECT TO authenticated
  USING (public.workspace_role(workspace_id) IN ('admin','office_admin','dispatcher'));
CREATE POLICY "Admins create invites" ON public.crew_invites FOR INSERT TO authenticated
  WITH CHECK (public.workspace_role(workspace_id) IN ('admin','office_admin','dispatcher'));
CREATE POLICY "Admins delete invites" ON public.crew_invites FOR DELETE TO authenticated
  USING (public.workspace_role(workspace_id) IN ('admin','office_admin','dispatcher'));

CREATE OR REPLACE FUNCTION public.crew_invite_info(_token text)
RETURNS TABLE(workspace_name text, crew_role text, valid boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT w.name, i.crew_role, (i.accepted_at IS NULL AND i.expires_at > now())
  FROM public.crew_invites i JOIN public.workspaces w ON w.id = i.workspace_id
  WHERE i.token = _token
$$;
GRANT EXECUTE ON FUNCTION public.crew_invite_info(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.accept_crew_invite(_token text, _name text, _phone text, _crew_role text)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE inv public.crew_invites; uid uuid := auth.uid(); mail text;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Please sign in first'; END IF;
  IF _crew_role NOT IN ('driver','helper','crew_lead') THEN RAISE EXCEPTION 'Choose Driver, Helper or Crew Lead'; END IF;
  IF length(coalesce(trim(_name),'')) < 2 THEN RAISE EXCEPTION 'Please enter your name'; END IF;
  SELECT * INTO inv FROM public.crew_invites WHERE token = _token FOR UPDATE;
  IF inv.id IS NULL THEN RAISE EXCEPTION 'This invite link is not valid'; END IF;
  IF inv.accepted_at IS NOT NULL OR inv.expires_at < now() THEN RAISE EXCEPTION 'This invite link has expired or was already used'; END IF;
  SELECT email INTO mail FROM auth.users WHERE id = uid;
  INSERT INTO public.workspace_members(workspace_id, user_id, name, email, role)
    VALUES (inv.workspace_id, uid, trim(_name), coalesce(mail,''), 'crew')
    ON CONFLICT (workspace_id, user_id) DO NOTHING;
  INSERT INTO public.workspace_records(workspace_id, kind, data) VALUES (inv.workspace_id, 'crew',
    jsonb_build_object('userId', uid, 'name', trim(_name), 'email', coalesce(mail,''), 'phone', coalesce(_phone,''),
      'isDriver', _crew_role = 'driver', 'crewRole', _crew_role, 'skillLevel', CASE WHEN _crew_role='crew_lead' THEN 3 ELSE 1 END,
      'hourlyRate', 0, 'status', 'active'));
  UPDATE public.crew_invites SET accepted_by = uid, accepted_at = now() WHERE id = inv.id;
  RETURN inv.workspace_id;
END $$;
REVOKE EXECUTE ON FUNCTION public.accept_crew_invite(text,text,text,text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.accept_crew_invite(text,text,text,text) TO authenticated;