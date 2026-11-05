ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS dispatch_address text,
  ADD COLUMN IF NOT EXISTS travel_pricing_type text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS travel_flat_rate numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS travel_mileage_rate numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fuel_surcharge_type text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS fuel_flat_rate numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fuel_per_mile_rate numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fuel_percentage_rate numeric NOT NULL DEFAULT 0;
ALTER TABLE public.workspaces
  ADD CONSTRAINT workspaces_travel_type_check CHECK (travel_pricing_type IN ('hourly','flat_fee','per_mile','none')),
  ADD CONSTRAINT workspaces_fuel_type_check CHECK (fuel_surcharge_type IN ('per_mile','percentage','flat_fee','none')),
  ADD CONSTRAINT workspaces_travel_rates_check CHECK (travel_flat_rate BETWEEN 0 AND 100000 AND travel_mileage_rate BETWEEN 0 AND 1000 AND fuel_flat_rate BETWEEN 0 AND 100000 AND fuel_per_mile_rate BETWEEN 0 AND 1000 AND fuel_percentage_rate BETWEEN 0 AND 100),
  ADD CONSTRAINT workspaces_dispatch_address_check CHECK (dispatch_address IS NULL OR length(dispatch_address) <= 300);
CREATE OR REPLACE FUNCTION public.protect_workspace_travel_rules() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF (NEW.dispatch_address, NEW.travel_pricing_type, NEW.travel_flat_rate, NEW.travel_mileage_rate, NEW.fuel_surcharge_type, NEW.fuel_flat_rate, NEW.fuel_per_mile_rate, NEW.fuel_percentage_rate)
    IS NOT DISTINCT FROM (OLD.dispatch_address, OLD.travel_pricing_type, OLD.travel_flat_rate, OLD.travel_mileage_rate, OLD.fuel_surcharge_type, OLD.fuel_flat_rate, OLD.fuel_per_mile_rate, OLD.fuel_percentage_rate) THEN RETURN NEW; END IF;
 IF auth.role()<>'service_role' AND public.workspace_role(NEW.id) IS DISTINCT FROM 'admin' THEN RAISE EXCEPTION 'Only workspace admins may change travel and fuel settings'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER protect_workspace_travel_rules BEFORE UPDATE ON public.workspaces FOR EACH ROW EXECUTE FUNCTION public.protect_workspace_travel_rules();