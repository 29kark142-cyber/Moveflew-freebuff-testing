CREATE TABLE public.beta_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  user_email text NOT NULL DEFAULT '',
  workspace_id bigint REFERENCES public.workspaces(id) ON DELETE SET NULL,
  kind text NOT NULL DEFAULT 'feedback' CHECK (kind IN ('feedback','bug')),
  message text NOT NULL CHECK (char_length(message) BETWEEN 3 AND 4000),
  page text NOT NULL DEFAULT '' CHECK (char_length(page) <= 300),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.beta_feedback TO authenticated;
GRANT ALL ON public.beta_feedback TO service_role;
ALTER TABLE public.beta_feedback ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users send their own feedback" ON public.beta_feedback FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND (workspace_id IS NULL OR public.workspace_role(workspace_id) IS NOT NULL));
CREATE POLICY "Platform admins read feedback" ON public.beta_feedback FOR SELECT TO authenticated
  USING (public.is_platform_admin());