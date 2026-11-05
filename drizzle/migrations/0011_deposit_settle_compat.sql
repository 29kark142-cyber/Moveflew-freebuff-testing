-- Older deployed webhook code still calls the 5-argument version; route it through the new rules.
CREATE OR REPLACE FUNCTION public.settle_proposal_checkout(_session text,_environment text,_subtotal integer,_paid integer,_currency text) RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
 SELECT public.settle_proposal_checkout(_session,_environment,_subtotal,_paid,_currency,_environment='live');
$$;
REVOKE ALL ON FUNCTION public.settle_proposal_checkout(text,text,integer,integer,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.settle_proposal_checkout(text,text,integer,integer,text) TO service_role;