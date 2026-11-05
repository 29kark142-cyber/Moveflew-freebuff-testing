DROP POLICY IF EXISTS "Anyone can read plans" ON public.subscription_plans;
REVOKE SELECT ON public.subscription_plans FROM anon;
CREATE POLICY "Signed-in users read offered plans" ON public.subscription_plans FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);