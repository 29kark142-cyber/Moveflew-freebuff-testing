CREATE TABLE public.subscription_plans (
  id text PRIMARY KEY,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  price_cents integer NOT NULL DEFAULT 0 CHECK (price_cents >= 0),
  billing_interval text NOT NULL DEFAULT 'month' CHECK (billing_interval IN ('month','year','none')),
  trial_days integer NOT NULL DEFAULT 0 CHECK (trial_days >= 0),
  features jsonb NOT NULL DEFAULT '[]'::jsonb,
  limits jsonb NOT NULL DEFAULT '{}'::jsonb,
  stripe_price_id text,
  available boolean NOT NULL DEFAULT false,
  is_default boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.subscription_plans TO anon, authenticated;
GRANT ALL ON public.subscription_plans TO service_role;
ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read plans" ON public.subscription_plans FOR SELECT TO anon, authenticated USING (true);

INSERT INTO public.subscription_plans (id, name, description, price_cents, billing_interval, trial_days, features, limits, available, is_default, sort_order) VALUES
 ('beta', 'Beta Access', 'Free full access while the platform is in testing.', 0, 'none', 0, '["All CRM features","Unlimited users","Website integrations","AI assistant"]'::jsonb, '{}'::jsonb, true, true, 0),
 ('starter', 'Starter', 'For small moving teams.', 9900, 'month', 14, '[]'::jsonb, '{}'::jsonb, false, false, 1),
 ('professional', 'Professional', 'For growing moving companies.', 19900, 'month', 14, '[]'::jsonb, '{}'::jsonb, false, false, 2);

ALTER TABLE public.workspaces
  ADD COLUMN plan_id text NOT NULL DEFAULT 'beta' REFERENCES public.subscription_plans(id),
  ADD COLUMN subscription_status text NOT NULL DEFAULT 'beta' CHECK (subscription_status IN ('beta','trialing','active','past_due','canceled')),
  ADD COLUMN trial_ends_at timestamptz,
  ADD COLUMN stripe_customer_id text,
  ADD COLUMN company_phone text NOT NULL DEFAULT '',
  ADD COLUMN onboarding_completed_at timestamptz;

UPDATE public.workspaces SET onboarding_completed_at = now() WHERE onboarding_completed_at IS NULL;

CREATE OR REPLACE FUNCTION public.protect_workspace_billing()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF current_user IN ('authenticated','anon') AND (
    NEW.plan_id IS DISTINCT FROM OLD.plan_id OR
    NEW.subscription_status IS DISTINCT FROM OLD.subscription_status OR
    NEW.trial_ends_at IS DISTINCT FROM OLD.trial_ends_at OR
    NEW.stripe_customer_id IS DISTINCT FROM OLD.stripe_customer_id) THEN
    RAISE EXCEPTION 'Billing fields can only be changed by the billing system';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER protect_workspace_billing BEFORE UPDATE ON public.workspaces
  FOR EACH ROW EXECUTE FUNCTION public.protect_workspace_billing();

CREATE OR REPLACE FUNCTION public.workspace_writable(_ws bigint)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.workspaces WHERE id = _ws AND subscription_status IN ('beta','trialing','active'))
$$;
GRANT EXECUTE ON FUNCTION public.workspace_writable(bigint) TO authenticated;

CREATE POLICY "Writable subscription required to add" ON public.workspace_records AS RESTRICTIVE
  FOR INSERT TO authenticated WITH CHECK (public.workspace_writable(workspace_id));
CREATE POLICY "Writable subscription required to change" ON public.workspace_records AS RESTRICTIVE
  FOR UPDATE TO authenticated USING (public.workspace_writable(workspace_id));
CREATE POLICY "Writable subscription required to delete" ON public.workspace_records AS RESTRICTIVE
  FOR DELETE TO authenticated USING (public.workspace_writable(workspace_id));

CREATE OR REPLACE FUNCTION public.register_company(_company text, _owner text, _phone text)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE ws bigint; uid uuid := auth.uid(); em text;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  IF length(trim(coalesce(_company,''))) < 2 OR length(_company) > 120 THEN RAISE EXCEPTION 'Company name is invalid'; END IF;
  IF length(trim(coalesce(_owner,''))) < 1 OR length(_owner) > 120 THEN RAISE EXCEPTION 'Owner name is invalid'; END IF;
  IF length(coalesce(_phone,'')) > 40 THEN RAISE EXCEPTION 'Phone number is invalid'; END IF;
  SELECT id INTO ws FROM public.workspaces WHERE created_by = uid ORDER BY id LIMIT 1;
  IF ws IS NOT NULL THEN RETURN ws; END IF;
  SELECT email INTO em FROM auth.users WHERE id = uid;
  INSERT INTO public.workspaces(name, created_by, company_phone) VALUES (trim(_company), uid, trim(coalesce(_phone,''))) RETURNING id INTO ws;
  INSERT INTO public.workspace_members(workspace_id, user_id, email, name, role)
    VALUES (ws, uid, coalesce(em,''), trim(_owner), 'admin');
  RETURN ws;
END $$;
REVOKE EXECUTE ON FUNCTION public.register_company(text,text,text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.register_company(text,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.complete_workspace_onboarding(_ws bigint)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.workspace_role(_ws) IS DISTINCT FROM 'admin' THEN RAISE EXCEPTION 'Only workspace admins can finish setup'; END IF;
  UPDATE public.workspaces SET onboarding_completed_at = coalesce(onboarding_completed_at, now()) WHERE id = _ws;
END $$;
REVOKE EXECUTE ON FUNCTION public.complete_workspace_onboarding(bigint) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.complete_workspace_onboarding(bigint) TO authenticated;