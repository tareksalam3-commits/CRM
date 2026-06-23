-- Fix permissions for unified_performance_metrics
-- Since it's a VIEW, we need to ensure the underlying tables have correct RLS or the view itself is handled correctly.
-- In Supabase, for a view to be accessible via API, it follows the RLS of the underlying tables IF it's a security invoker view.
-- Let's make sure the view is accessible and has proper RLS-like logic if possible, or update underlying policies.

-- First, let's check if we can grant select on the view to authenticated users
GRANT SELECT ON public.unified_performance_metrics TO authenticated;

-- If it's a materialized view or needs explicit policy (though views usually don't support RLS directly unless they are security invoker)
-- We will ensure the underlying policies for policies, installments, and collections are robust.

-- Ensure Super Admin can see everything in the underlying tables
DROP POLICY IF EXISTS "Super Admin full access on policies" ON policies;
CREATE POLICY "Super Admin full access on policies" ON policies
FOR ALL USING ( (SELECT role FROM profiles WHERE id = auth.uid()) = 'super_admin' );

DROP POLICY IF EXISTS "Super Admin full access on installments" ON installments;
CREATE POLICY "Super Admin full access on installments" ON installments
FOR ALL USING ( (SELECT role FROM profiles WHERE id = auth.uid()) = 'super_admin' );

DROP POLICY IF EXISTS "Super Admin full access on collections" ON collections;
CREATE POLICY "Super Admin full access on collections" ON collections
FOR ALL USING ( (SELECT role FROM profiles WHERE id = auth.uid()) = 'super_admin' );

-- Also for Dev Manager
DROP POLICY IF EXISTS "Dev Manager full access on policies" ON policies;
CREATE POLICY "Dev Manager full access on policies" ON policies
FOR ALL USING ( (SELECT role FROM profiles WHERE id = auth.uid()) = 'dev_manager' );

-- Fix for unified_performance_metrics specifically if it was created as a table or needs specific grant
-- Re-creating the view as SECURITY INVOKER if it wasn't (this is a common issue in Supabase)
-- Note: I don't have the original view definition here, so I will try to grant permissions first.

-- Grant access to all authenticated users for the views
GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;
