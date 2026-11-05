ALTER TABLE public.workspaces ADD COLUMN office_email text NOT NULL DEFAULT '';
CREATE TABLE public.field_document_snapshots (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id bigint NOT NULL REFERENCES public.workspaces(id), job_id bigint NOT NULL REFERENCES public.workspace_records(id),
 operation_id uuid NOT NULL UNIQUE, snapshot jsonb NOT NULL, storage_path text, pdf_hash text, created_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(workspace_id,job_id)
);
GRANT SELECT ON public.field_document_snapshots TO authenticated;
GRANT ALL ON public.field_document_snapshots TO service_role;
ALTER TABLE public.field_document_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Assigned crew and office read field snapshots" ON public.field_document_snapshots FOR SELECT TO authenticated USING (EXISTS(SELECT 1 FROM public.workspace_records j WHERE j.id=job_id AND j.workspace_id=field_document_snapshots.workspace_id AND j.kind='job' AND public.can_access_record(j.workspace_id,j.kind,j.data)));
CREATE TABLE public.field_operation_receipts (
 operation_id uuid PRIMARY KEY, workspace_id bigint NOT NULL REFERENCES public.workspaces(id), job_id bigint NOT NULL REFERENCES public.workspace_records(id), kind text NOT NULL, result jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.field_operation_receipts TO service_role;
ALTER TABLE public.field_operation_receipts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Assigned field snapshot storage reads" ON storage.objects FOR SELECT TO authenticated USING (bucket_id='field-documents' AND EXISTS(SELECT 1 FROM public.field_document_snapshots d WHERE d.storage_path=name AND EXISTS(SELECT 1 FROM public.workspace_records j WHERE j.id=d.job_id AND j.workspace_id=d.workspace_id AND public.can_access_record(j.workspace_id,j.kind,j.data))));
CREATE OR REPLACE FUNCTION public.commit_field_signoff(_ws bigint,_job bigint,_actor uuid,_operation uuid,_signature text,_snapshot jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE j public.workspace_records; doc uuid;
BEGIN
 SELECT * INTO j FROM public.workspace_records WHERE id=_job AND workspace_id=_ws AND kind='job' FOR UPDATE;
 IF j.id IS NULL OR j.data->'timeline'->>'complete' IS NULL THEN RAISE EXCEPTION 'Complete the job first'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.workspace_members WHERE workspace_id=_ws AND user_id=_actor AND (role IN ('admin','office_admin','dispatcher') OR (role='crew' AND EXISTS(SELECT 1 FROM public.workspace_records c WHERE c.workspace_id=_ws AND c.kind='crew' AND c.data->>'userId'=_actor::text AND coalesce(j.data->'crewIds','[]') @> jsonb_build_array(c.id))))) THEN RAISE EXCEPTION 'Job access denied'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.workspaces WHERE id=_ws AND subscription_status IN ('beta','trialing','active')) THEN RAISE EXCEPTION 'Workspace is read-only'; END IF;
 SELECT id INTO doc FROM public.field_document_snapshots WHERE workspace_id=_ws AND job_id=_job;
 IF doc IS NOT NULL THEN RETURN doc; END IF;
 IF length(_signature)>400000 OR _signature NOT LIKE 'data:image/png;base64,iVBOR%' THEN RAISE EXCEPTION 'Invalid signature'; END IF;
 INSERT INTO public.field_document_snapshots(workspace_id,job_id,operation_id,snapshot,created_by) VALUES(_ws,_job,_operation,_snapshot,_actor) RETURNING id INTO doc;
 UPDATE public.workspace_records SET data=data || jsonb_build_object('completedSignature',_signature,'signedOffAt',now(),'fieldDocumentId',doc),updated_at=now() WHERE id=_job;
 RETURN doc;
END $$;
REVOKE ALL ON FUNCTION public.commit_field_signoff(bigint,bigint,uuid,uuid,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.commit_field_signoff(bigint,bigint,uuid,uuid,text,jsonb) TO service_role;