CREATE TABLE public.workspaces (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name text NOT NULL,
  pricing jsonb,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.workspace_members (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  workspace_id bigint NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  name text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  role text NOT NULL DEFAULT 'admin',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, user_id)
);
CREATE TABLE public.workspace_records (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  workspace_id bigint NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  kind text NOT NULL,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX workspace_records_ws_kind ON public.workspace_records(workspace_id, kind);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspaces, public.workspace_members, public.workspace_records TO authenticated;
GRANT ALL ON public.workspaces, public.workspace_members, public.workspace_records TO service_role;

ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_records ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.workspace_role(_ws bigint)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM public.workspace_members WHERE workspace_id = _ws AND user_id = auth.uid() LIMIT 1
$$;

CREATE POLICY "members read workspace" ON public.workspaces FOR SELECT TO authenticated
  USING (public.workspace_role(id) IS NOT NULL);
CREATE POLICY "admins update workspace" ON public.workspaces FOR UPDATE TO authenticated
  USING (public.workspace_role(id) IN ('admin','office_admin'));

CREATE POLICY "members read members" ON public.workspace_members FOR SELECT TO authenticated
  USING (public.workspace_role(workspace_id) IS NOT NULL);
CREATE POLICY "admins manage members" ON public.workspace_members FOR ALL TO authenticated
  USING (public.workspace_role(workspace_id) = 'admin')
  WITH CHECK (public.workspace_role(workspace_id) = 'admin');

CREATE POLICY "members read records" ON public.workspace_records FOR SELECT TO authenticated
  USING (public.workspace_role(workspace_id) IS NOT NULL);
CREATE POLICY "members write records" ON public.workspace_records FOR INSERT TO authenticated
  WITH CHECK (public.workspace_role(workspace_id) IS NOT NULL);
CREATE POLICY "members update records" ON public.workspace_records FOR UPDATE TO authenticated
  USING (public.workspace_role(workspace_id) IS NOT NULL);
CREATE POLICY "admins delete records" ON public.workspace_records FOR DELETE TO authenticated
  USING (public.workspace_role(workspace_id) IN ('admin','office_admin'));

CREATE OR REPLACE FUNCTION public.create_workspace(_name text)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE ws bigint; uid uuid := auth.uid(); em text;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  IF length(trim(_name)) < 2 OR length(_name) > 120 THEN RAISE EXCEPTION 'Workspace name is invalid'; END IF;
  SELECT email INTO em FROM auth.users WHERE id = uid;
  INSERT INTO public.workspaces(name, created_by) VALUES (trim(_name), uid) RETURNING id INTO ws;
  INSERT INTO public.workspace_members(workspace_id, user_id, email, name, role)
    VALUES (ws, uid, coalesce(em,''), coalesce(split_part(em,'@',1),''), 'admin');
  RETURN ws;
END $$;
REVOKE EXECUTE ON FUNCTION public.create_workspace(text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.create_workspace(text) TO authenticated;