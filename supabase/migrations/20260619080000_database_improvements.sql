-- ================================================================
-- CRM Pro — Database Improvements & Logic Fixes
-- Migration Date: 2026-06-19
-- ================================================================

-- 1. Ensure Collections Table has is_new_business column
ALTER TABLE public.collections ADD COLUMN IF NOT EXISTS is_new_business boolean DEFAULT false;

-- Update existing collections: Only the first installment is new business
UPDATE public.collections c
SET is_new_business = true
FROM public.installments i
WHERE c.installment_id = i.id
AND i.installment_number = 1;

UPDATE public.collections c
SET is_new_business = false
FROM public.installments i
WHERE c.installment_id = i.id
AND i.installment_number > 1;

-- 2. Improve Hierarchy & Access Functions
CREATE OR REPLACE FUNCTION public.is_subordinate(manager_uuid uuid, subordinate_uuid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    WITH RECURSIVE subordinates AS (
      SELECT id FROM public.profiles WHERE manager_id = manager_uuid
      UNION ALL
      SELECT p.id FROM public.profiles p
      INNER JOIN subordinates s ON p.manager_id = s.id
    )
    SELECT 1 FROM subordinates WHERE id = subordinate_uuid
  );
$$;

CREATE OR REPLACE FUNCTION public.can_access_user(accessor_uuid uuid, target_uuid uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
    accessor_role text;
BEGIN
    SELECT role INTO accessor_role FROM public.profiles WHERE id = accessor_uuid;
    RETURN (
        accessor_uuid = target_uuid
        OR accessor_role = 'super_admin'
        OR accessor_role = 'dev_manager'
        OR public.is_subordinate(accessor_uuid, target_uuid)
    );
END;
$$;

-- 3. Update RLS Policies for Profiles
DROP POLICY IF EXISTS "profiles_select" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_all" ON public.profiles;
CREATE POLICY "profiles_select" ON public.profiles FOR SELECT
  TO authenticated
  USING (
    id = auth.uid() 
    OR public.is_subordinate(auth.uid(), id)
    OR id IN (SELECT manager_id FROM public.profiles WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('super_admin', 'dev_manager', 'general_supervisor'))
  );

-- 4. Ensure RLS for Collections
DROP POLICY IF EXISTS "collections_select" ON public.collections;
DROP POLICY IF EXISTS "collections_select_policy" ON public.collections;
CREATE POLICY "collections_select" ON public.collections FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.policies 
      WHERE policies.id = collections.policy_id 
      AND public.can_access_user(auth.uid(), policies.agent_id)
    )
  );

-- 5. Trigger to automatically mark collection as production (new business) or not
CREATE OR REPLACE FUNCTION public.mark_collection_as_production()
RETURNS TRIGGER AS $$
BEGIN
    IF (SELECT installment_number FROM public.installments WHERE id = NEW.installment_id) = 1 THEN
        NEW.is_new_business := true;
    ELSE
        NEW.is_new_business := false;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_mark_production ON public.collections;
CREATE TRIGGER trg_mark_production
BEFORE INSERT ON public.collections
FOR EACH ROW
EXECUTE FUNCTION public.mark_collection_as_production();

-- 6. Update calculate_agent_performance to use is_new_business
DROP FUNCTION IF EXISTS public.calculate_agent_performance CASCADE;
CREATE OR REPLACE FUNCTION public.calculate_agent_performance(
  p_agent_id uuid,
  p_month int,
  p_year int
)
RETURNS TABLE (
  new_business numeric,
  collections numeric,
  new_clients int,
  paid_installments int,
  collection_rate numeric
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    -- New Business: Sum of collections where is_new_business is true
    COALESCE(SUM(CASE WHEN c.is_new_business = true THEN c.amount ELSE 0 END), 0)::numeric,
    -- Collections: Sum of collections where is_new_business is false
    COALESCE(SUM(CASE WHEN c.is_new_business = false THEN c.amount ELSE 0 END), 0)::numeric,
    -- New Clients
    (SELECT COUNT(DISTINCT id)::int FROM public.clients cl WHERE cl.agent_id = p_agent_id AND EXTRACT(MONTH FROM cl.created_at) = p_month AND EXTRACT(YEAR FROM cl.created_at) = p_year),
    -- Paid Installments
    COUNT(DISTINCT c.installment_id)::int,
    -- Collection Rate (simplified for now, can be expanded)
    0::numeric
  FROM public.collections c
  JOIN public.policies p ON c.policy_id = p.id
  WHERE p.agent_id = p_agent_id
    AND EXTRACT(MONTH FROM c.collection_date) = p_month
    AND EXTRACT(YEAR FROM c.collection_date) = p_year;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
