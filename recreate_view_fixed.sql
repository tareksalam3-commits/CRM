-- Recreate the view with SECURITY INVOKER property to respect RLS of underlying tables
DROP VIEW IF EXISTS public.unified_performance_metrics CASCADE;

CREATE VIEW public.unified_performance_metrics 
WITH (security_invoker = true) -- This is CRITICAL for Supabase RLS to work on Views
AS
SELECT 
    c.id as collection_id,
    c.amount,
    c.collection_date,
    c.collection_category,
    c.is_new_business,
    (c.collection_category = 'first_year') as is_first_year_collection,
    (c.collection_category = 'renewal') as is_renewal_collection,
    c.branch_id,
    p.id as policy_id,
    p.agent_id,
    p.team_leader_id,
    p.supervisor_id,
    p.branch_manager_id,
    p.first_year_start,
    p.first_year_end,
    EXTRACT(YEAR FROM c.collection_date)::int as collection_year,
    EXTRACT(MONTH FROM c.collection_date)::int as collection_month,
    -- Add names for UI ranking
    pa.full_name as agent_name,
    ptl.full_name as team_leader_name
FROM public.collections c
JOIN public.policies p ON c.policy_id = p.id
LEFT JOIN public.profiles pa ON p.agent_id = pa.id
LEFT JOIN public.profiles ptl ON p.team_leader_id = ptl.id;

-- Grant access
GRANT SELECT ON public.unified_performance_metrics TO authenticated;
GRANT SELECT ON public.unified_performance_metrics TO anon;
GRANT SELECT ON public.unified_performance_metrics TO service_role;

-- Ensure underlying tables have permissive RLS for Super Admin
DROP POLICY IF EXISTS "Super Admin full access on collections" ON collections;
CREATE POLICY "Super Admin full access on collections" ON collections
FOR ALL TO authenticated USING (
  (SELECT role FROM profiles WHERE id = auth.uid()) = 'super_admin'
);

DROP POLICY IF EXISTS "Super Admin full access on policies" ON policies;
CREATE POLICY "Super Admin full access on policies" ON policies
FOR ALL TO authenticated USING (
  (SELECT role FROM profiles WHERE id = auth.uid()) = 'super_admin'
);

DROP POLICY IF EXISTS "Super Admin full access on profiles" ON profiles;
CREATE POLICY "Super Admin full access on profiles" ON profiles
FOR ALL TO authenticated USING (
  (SELECT role FROM profiles WHERE id = auth.uid()) = 'super_admin'
);
