ALTER TABLE public.workspaces
  ADD COLUMN is_custom_pricing boolean NOT NULL DEFAULT false,
  ADD COLUMN pricing_mode text NOT NULL DEFAULT 'standard',
  ADD COLUMN custom_monthly_price numeric(10,2),
  ADD COLUMN custom_annual_price numeric(10,2),
  ADD COLUMN discount_percent numeric(5,2),
  ADD CONSTRAINT workspaces_pricing_mode_chk CHECK (pricing_mode IN ('standard','flat','percent')),
  ADD CONSTRAINT workspaces_custom_monthly_chk CHECK (custom_monthly_price IS NULL OR (custom_monthly_price >= 0 AND custom_monthly_price <= 100000)),
  ADD CONSTRAINT workspaces_custom_annual_chk CHECK (custom_annual_price IS NULL OR (custom_annual_price >= 0 AND custom_annual_price <= 1000000)),
  ADD CONSTRAINT workspaces_discount_chk CHECK (discount_percent IS NULL OR (discount_percent >= 0 AND discount_percent <= 100));

CREATE TABLE public.workspace_admin_notes (
  workspace_id bigint PRIMARY KEY REFERENCES public.workspaces(id) ON DELETE CASCADE,
  pricing_notes text NOT NULL DEFAULT '',
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.workspace_admin_notes TO service_role;
ALTER TABLE public.workspace_admin_notes ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.protect_workspace_billing()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
BEGIN
  IF current_user IN ('authenticated','anon') AND (
    NEW.plan_id IS DISTINCT FROM OLD.plan_id OR
    NEW.subscription_status IS DISTINCT FROM OLD.subscription_status OR
    NEW.trial_ends_at IS DISTINCT FROM OLD.trial_ends_at OR
    NEW.stripe_customer_id IS DISTINCT FROM OLD.stripe_customer_id OR
    NEW.beta_ends_at IS DISTINCT FROM OLD.beta_ends_at OR
    NEW.feature_flags IS DISTINCT FROM OLD.feature_flags OR
    NEW.limit_overrides IS DISTINCT FROM OLD.limit_overrides OR
    NEW.is_custom_pricing IS DISTINCT FROM OLD.is_custom_pricing OR
    NEW.pricing_mode IS DISTINCT FROM OLD.pricing_mode OR
    NEW.custom_monthly_price IS DISTINCT FROM OLD.custom_monthly_price OR
    NEW.custom_annual_price IS DISTINCT FROM OLD.custom_annual_price OR
    NEW.discount_percent IS DISTINCT FROM OLD.discount_percent) THEN
    RAISE EXCEPTION 'Billing fields can only be changed by the billing system';
  END IF;
  RETURN NEW;
END $function$;