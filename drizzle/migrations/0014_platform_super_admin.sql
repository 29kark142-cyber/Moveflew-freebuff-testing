CREATE TABLE public.platform_admins (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.platform_admins TO authenticated;
GRANT ALL ON public.platform_admins TO service_role;
ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins see own platform role" ON public.platform_admins FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id = auth.uid())
$$;
GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO authenticated;

INSERT INTO public.platform_admins (user_id)
SELECT id FROM auth.users WHERE email IN ('kostyakostya2011karpov@gmail.com','kkarpov1990@gmail.com')
ON CONFLICT DO NOTHING;

ALTER TABLE public.workspaces
  ADD COLUMN beta_ends_at timestamptz,
  ADD COLUMN feature_flags jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN limit_overrides jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE OR REPLACE FUNCTION public.protect_workspace_billing()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF current_user IN ('authenticated','anon') AND (
    NEW.plan_id IS DISTINCT FROM OLD.plan_id OR
    NEW.subscription_status IS DISTINCT FROM OLD.subscription_status OR
    NEW.trial_ends_at IS DISTINCT FROM OLD.trial_ends_at OR
    NEW.stripe_customer_id IS DISTINCT FROM OLD.stripe_customer_id OR
    NEW.beta_ends_at IS DISTINCT FROM OLD.beta_ends_at OR
    NEW.feature_flags IS DISTINCT FROM OLD.feature_flags OR
    NEW.limit_overrides IS DISTINCT FROM OLD.limit_overrides) THEN
    RAISE EXCEPTION 'Billing fields can only be changed by the billing system';
  END IF;
  RETURN NEW;
END $$;

CREATE TABLE public.platform_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source text NOT NULL,
  level text NOT NULL DEFAULT 'info',
  workspace_id bigint,
  message text NOT NULL,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.platform_events TO service_role;
ALTER TABLE public.platform_events ENABLE ROW LEVEL SECURITY;
CREATE INDEX platform_events_created_idx ON public.platform_events (created_at DESC);