CREATE OR REPLACE FUNCTION public.can_access_record(_ws bigint, _kind text, _data jsonb)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE r text := public.workspace_role(_ws); jd jsonb;
BEGIN
  IF r IS NULL THEN RETURN false; END IF;
  IF r <> 'crew' THEN RETURN true; END IF;
  IF _kind IN ('customer','sequence','reminder') THEN RETURN false; END IF;
  IF _kind = 'damage' THEN
    SELECT data INTO jd FROM public.workspace_records WHERE workspace_id = _ws AND kind = 'job' AND id = nullif(_data->>'jobId','')::bigint;
    IF jd IS NULL THEN RETURN false; END IF;
    _data := jd; _kind := 'job';
  END IF;
  IF _kind = 'job' THEN
    RETURN EXISTS (SELECT 1 FROM public.workspace_records c WHERE c.workspace_id = _ws AND c.kind = 'crew'
      AND c.data->>'userId' = auth.uid()::text AND coalesce(_data->'crewIds','[]'::jsonb) @> jsonb_build_array(c.id));
  END IF;
  RETURN true;
END $$;
REVOKE EXECUTE ON FUNCTION public.can_access_record(bigint, text, jsonb) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.can_access_record(bigint, text, jsonb) TO authenticated;

DROP POLICY IF EXISTS "members read records" ON public.workspace_records;
CREATE POLICY "members read records" ON public.workspace_records FOR SELECT TO authenticated
  USING (public.can_access_record(workspace_id, kind, data));
DROP POLICY IF EXISTS "members update records" ON public.workspace_records;
CREATE POLICY "members update records" ON public.workspace_records FOR UPDATE TO authenticated
  USING (public.can_access_record(workspace_id, kind, data));