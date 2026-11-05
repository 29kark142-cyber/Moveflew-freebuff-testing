CREATE OR REPLACE FUNCTION public.validate_workspace_deposit_rule() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE amount numeric;
BEGIN
 IF NEW.deposit_rule IS NOT DISTINCT FROM OLD.deposit_rule THEN RETURN NEW; END IF;
 IF auth.role()<>'service_role' AND public.workspace_role(NEW.id) IS DISTINCT FROM 'admin' THEN RAISE EXCEPTION 'Only workspace admins may change deposit defaults'; END IF;
 IF NEW.deposit_rule IS NULL THEN RETURN NEW; END IF;
 IF jsonb_typeof(NEW.deposit_rule)<>'object' OR NEW.deposit_rule->>'mode' NOT IN ('fixed','percentage') OR jsonb_typeof(NEW.deposit_rule->'value') IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'Invalid deposit rule'; END IF;
 amount=(NEW.deposit_rule->>'value')::numeric;
 IF amount<0 OR amount>100000 OR (NEW.deposit_rule->>'mode'='percentage' AND amount>100) THEN RAISE EXCEPTION 'Invalid deposit value'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER protect_workspace_deposit_defaults BEFORE UPDATE OF deposit_rule ON public.workspaces FOR EACH ROW EXECUTE FUNCTION public.validate_workspace_deposit_rule();