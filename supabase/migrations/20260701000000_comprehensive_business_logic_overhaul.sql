-- ================================================================
-- CRM Pro - Comprehensive Business Logic Overhaul
-- Migration Date: 2026-07-01
-- ================================================================
-- This migration implements the complete business logic requirements:
-- 1. Production & Collection Logic (First installment only = new business)
-- 2. Policy Schema Cleanup (Remove unnecessary fields)
-- 3. Branch-based Dashboard & Data Isolation
-- 4. Super Admin Permissions (No branch restrictions)
-- 5. Unified Data Source for all calculations
-- ================================================================

-- ================================================================
-- PHASE 1: Update Policy Schema
-- ================================================================

-- 1.1 Remove unnecessary columns from policies table
ALTER TABLE public.policies 
DROP COLUMN IF EXISTS insurance_company,
DROP COLUMN IF EXISTS start_date,
DROP COLUMN IF EXISTS policy_duration;

-- 1.2 Ensure required columns exist
ALTER TABLE public.policies
ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES public.branches(id) ON DELETE RESTRICT,
ADD COLUMN IF NOT EXISTS team_leader_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS first_year_start date,
ADD COLUMN IF NOT EXISTS first_year_end date,
ADD COLUMN IF NOT EXISTS has_new_business_counted boolean DEFAULT false;

-- 1.3 Add payment_method column if missing
ALTER TABLE public.policies
ADD COLUMN IF NOT EXISTS payment_method text;

-- 1.4 Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_policies_branch ON public.policies(branch_id);
CREATE INDEX IF NOT EXISTS idx_policies_team_leader ON public.policies(team_leader_id);
CREATE INDEX IF NOT EXISTS idx_policies_issue_date ON public.policies(issue_date);

-- ================================================================
-- PHASE 2: Update Collections Table
-- ================================================================

-- 2.1 Add is_new_business column if missing
ALTER TABLE public.collections
ADD COLUMN IF NOT EXISTS is_new_business boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES public.branches(id) ON DELETE RESTRICT;

-- 2.2 Create indexes
CREATE INDEX IF NOT EXISTS idx_collections_branch ON public.collections(branch_id);
CREATE INDEX IF NOT EXISTS idx_collections_is_new_business ON public.collections(is_new_business);

-- ================================================================
-- PHASE 3: Update Installments Table
-- ================================================================

-- 3.1 Add first_year_end reference for filtering
ALTER TABLE public.installments
ADD COLUMN IF NOT EXISTS first_year_end date;

-- ================================================================
-- PHASE 4: Update Profiles Table
-- ================================================================

-- 4.1 Ensure profiles has branch_id for backward compatibility
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_branch ON public.profiles(branch_id);

-- ================================================================
-- PHASE 5: Business Logic Functions
-- ================================================================

-- 5.1 Calculate first year dates for a policy
CREATE OR REPLACE FUNCTION public.calculate_policy_first_year()
RETURNS TRIGGER AS $$
BEGIN
    -- First year starts from the beginning of the issue month
    NEW.first_year_start := date_trunc('month', NEW.issue_date)::date;
    -- First year ends at the end of the 12th month
    NEW.first_year_end := (date_trunc('month', NEW.issue_date) + INTERVAL '12 months' - INTERVAL '1 day')::date;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 5.2 Drop and recreate trigger
DROP TRIGGER IF EXISTS trg_calculate_first_year ON public.policies;
CREATE TRIGGER trg_calculate_first_year
BEFORE INSERT OR UPDATE OF issue_date ON public.policies
FOR EACH ROW
EXECUTE FUNCTION public.calculate_policy_first_year();

-- 5.3 Update existing policies
UPDATE public.policies 
SET 
    first_year_start = date_trunc('month', issue_date)::date,
    first_year_end = (date_trunc('month', issue_date) + INTERVAL '12 months' - INTERVAL '1 day')::date
WHERE first_year_start IS NULL OR first_year_end IS NULL;

-- 5.4 Mark new business collections (first installment only)
CREATE OR REPLACE FUNCTION public.mark_collection_as_new_business()
RETURNS TRIGGER AS $$
DECLARE
    v_installment_number int;
    v_has_counted boolean;
BEGIN
    -- Get installment number
    SELECT installment_number INTO v_installment_number 
    FROM public.installments WHERE id = NEW.installment_id;

    -- Get if policy already has new business counted
    SELECT has_new_business_counted INTO v_has_counted 
    FROM public.policies WHERE id = NEW.policy_id;

    -- First installment only = new business (only once per policy)
    IF v_installment_number = 1 AND NOT COALESCE(v_has_counted, false) THEN
        NEW.is_new_business := true;
        -- Mark policy as having new business counted
        UPDATE public.policies SET has_new_business_counted = true WHERE id = NEW.policy_id;
    ELSE
        NEW.is_new_business := false;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 5.5 Drop and recreate trigger for collections
DROP TRIGGER IF EXISTS trg_mark_new_business ON public.collections;
CREATE TRIGGER trg_mark_new_business
BEFORE INSERT ON public.collections
FOR EACH ROW
EXECUTE FUNCTION public.mark_collection_as_new_business();

-- ================================================================
-- PHASE 6: Unified Performance Metrics View
-- ================================================================

-- 6.1 Drop existing view if it exists
DROP VIEW IF EXISTS public.unified_performance_metrics CASCADE;

-- 6.2 Create unified view (single source of truth)
CREATE VIEW public.unified_performance_metrics AS
SELECT 
    c.id as collection_id,
    c.amount,
    c.collection_date,
    c.is_new_business,
    c.branch_id,
    p.id as policy_id,
    p.agent_id,
    p.team_leader_id,
    p.first_year_start,
    p.first_year_end,
    -- A collection is valid if it's within the first year
    (c.collection_date <= p.first_year_end) as is_first_year_collection,
    -- Extract month and year for reporting
    EXTRACT(YEAR FROM c.collection_date)::int as collection_year,
    EXTRACT(MONTH FROM c.collection_date)::int as collection_month
FROM public.collections c
JOIN public.policies p ON c.policy_id = p.id
WHERE p.first_year_end IS NOT NULL;

-- ================================================================
-- PHASE 7: Super Admin RLS Policy Fixes
-- ================================================================

-- 7.1 Helper function to check if user is super admin
CREATE OR REPLACE FUNCTION public.is_user_super_admin(p_user_id uuid)
RETURNS boolean AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.user_branch_access 
        WHERE user_id = p_user_id 
        AND role = 'super_admin' 
        AND is_active = true 
        AND (expires_at IS NULL OR expires_at > now())
    );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- 7.2 Helper function to check branch access
CREATE OR REPLACE FUNCTION public.check_user_branch_access(p_user_id uuid, p_branch_id uuid)
RETURNS boolean AS $$
BEGIN
    -- Super admin can access all branches
    IF public.is_user_super_admin(p_user_id) THEN
        RETURN true;
    END IF;

    -- Check if user has active access to this branch
    RETURN EXISTS (
        SELECT 1 FROM public.user_branch_access 
        WHERE user_id = p_user_id 
        AND branch_id = p_branch_id 
        AND is_active = true 
        AND (expires_at IS NULL OR expires_at > now())
    );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ================================================================
-- PHASE 8: Update RLS Policies for Branch Isolation
-- ================================================================

-- 8.1 Clients RLS - Branch isolation with super admin bypass
DROP POLICY IF EXISTS "clients_select" ON public.clients;
CREATE POLICY "clients_select" ON public.clients FOR SELECT TO authenticated
USING (
    public.is_user_super_admin(auth.uid())
    OR (branch_id IS NOT NULL AND public.check_user_branch_access(auth.uid(), branch_id))
    OR (branch_id IS NULL AND EXISTS (
        SELECT 1 FROM public.user_branch_access 
        WHERE user_id = auth.uid() 
        AND is_active = true 
        AND (expires_at IS NULL OR expires_at > now())
    ))
);

-- 8.2 Policies RLS - Branch isolation with super admin bypass
DROP POLICY IF EXISTS "policies_select" ON public.policies;
CREATE POLICY "policies_select" ON public.policies FOR SELECT TO authenticated
USING (
    public.is_user_super_admin(auth.uid())
    OR (branch_id IS NOT NULL AND public.check_user_branch_access(auth.uid(), branch_id))
    OR (branch_id IS NULL AND EXISTS (
        SELECT 1 FROM public.user_branch_access 
        WHERE user_id = auth.uid() 
        AND is_active = true 
        AND (expires_at IS NULL OR expires_at > now())
    ))
);

-- 8.3 Collections RLS - Branch isolation with super admin bypass
DROP POLICY IF EXISTS "collections_select" ON public.collections;
CREATE POLICY "collections_select" ON public.collections FOR SELECT TO authenticated
USING (
    public.is_user_super_admin(auth.uid())
    OR (branch_id IS NOT NULL AND public.check_user_branch_access(auth.uid(), branch_id))
    OR (branch_id IS NULL AND EXISTS (
        SELECT 1 FROM public.user_branch_access 
        WHERE user_id = auth.uid() 
        AND is_active = true 
        AND (expires_at IS NULL OR expires_at > now())
    ))
);

-- 8.4 Targets RLS - Branch isolation with super admin bypass
DROP POLICY IF EXISTS "targets_select" ON public.targets;
CREATE POLICY "targets_select" ON public.targets FOR SELECT TO authenticated
USING (
    public.is_user_super_admin(auth.uid())
    OR (branch_id IS NOT NULL AND public.check_user_branch_access(auth.uid(), branch_id))
    OR (branch_id IS NULL AND EXISTS (
        SELECT 1 FROM public.user_branch_access 
        WHERE user_id = auth.uid() 
        AND is_active = true 
        AND (expires_at IS NULL OR expires_at > now())
    ))
);

-- 8.5 Tasks RLS - Branch isolation with super admin bypass
DROP POLICY IF EXISTS "tasks_select" ON public.tasks;
CREATE POLICY "tasks_select" ON public.tasks FOR SELECT TO authenticated
USING (
    public.is_user_super_admin(auth.uid())
    OR (branch_id IS NOT NULL AND public.check_user_branch_access(auth.uid(), branch_id))
    OR (branch_id IS NULL AND EXISTS (
        SELECT 1 FROM public.user_branch_access 
        WHERE user_id = auth.uid() 
        AND is_active = true 
        AND (expires_at IS NULL OR expires_at > now())
    ))
);

-- 8.6 Installments RLS - Branch isolation with super admin bypass
DROP POLICY IF EXISTS "installments_select" ON public.installments;
CREATE POLICY "installments_select" ON public.installments FOR SELECT TO authenticated
USING (
    public.is_user_super_admin(auth.uid())
    OR EXISTS (
        SELECT 1 FROM public.policies p
        WHERE p.id = policy_id
        AND (
            public.is_user_super_admin(auth.uid())
            OR (p.branch_id IS NOT NULL AND public.check_user_branch_access(auth.uid(), p.branch_id))
        )
    )
);

-- 8.7 Branches RLS - Super admin sees all, others see their accessible branches
DROP POLICY IF EXISTS "branches_select" ON public.branches;
CREATE POLICY "branches_select" ON public.branches FOR SELECT TO authenticated
USING (
    public.is_user_super_admin(auth.uid())
    OR is_active = true
    OR EXISTS (
        SELECT 1 FROM public.user_branch_access 
        WHERE user_id = auth.uid() 
        AND branch_id = branches.id
        AND is_active = true
    )
);

-- 8.8 Audit Logs RLS - Branch isolation with super admin bypass
DROP POLICY IF EXISTS "audit_logs_select" ON public.audit_logs;
CREATE POLICY "audit_logs_select" ON public.audit_logs FOR SELECT TO authenticated
USING (
    public.is_user_super_admin(auth.uid())
    OR user_id = auth.uid()
);

-- ================================================================
-- PHASE 9: Performance Calculation Functions
-- ================================================================

-- 9.1 Calculate agent performance for a specific month
CREATE OR REPLACE FUNCTION public.calculate_agent_performance(
  p_agent_id uuid,
  p_month int,
  p_year int,
  p_branch_id uuid DEFAULT NULL
)
RETURNS TABLE (
  new_business numeric,
  collections numeric,
  total_production numeric,
  collection_rate numeric
) AS $$
DECLARE
    v_month_start date;
    v_month_end date;
    v_total_due numeric;
    v_total_collected_in_period numeric;
BEGIN
    v_month_start := make_date(p_year, p_month, 1);
    v_month_end := (v_month_start + INTERVAL '1 month' - INTERVAL '1 day')::date;

    -- 1. Total New Business (First installment collections in this month)
    SELECT COALESCE(SUM(amount), 0) INTO new_business
    FROM public.unified_performance_metrics
    WHERE agent_id = p_agent_id
      AND is_new_business = true
      AND collection_date BETWEEN v_month_start AND v_month_end
      AND (p_branch_id IS NULL OR branch_id = p_branch_id);

    -- 2. Total Collections (Subsequent installments in first year, this month)
    SELECT COALESCE(SUM(amount), 0) INTO collections
    FROM public.unified_performance_metrics
    WHERE agent_id = p_agent_id
      AND is_new_business = false
      AND is_first_year_collection = true
      AND collection_date BETWEEN v_month_start AND v_month_end
      AND (p_branch_id IS NULL OR branch_id = p_branch_id);

    total_production := new_business + collections;

    -- 3. Collection Rate Calculation
    -- المحصل فعلياً خلال الفترة ÷ المستحق تحصيله خلال نفس الفترة × 100
    
    -- Actual collected in period (all valid first year collections)
    SELECT COALESCE(SUM(amount), 0) INTO v_total_collected_in_period
    FROM public.unified_performance_metrics
    WHERE agent_id = p_agent_id
      AND is_first_year_collection = true
      AND collection_date BETWEEN v_month_start AND v_month_end
      AND (p_branch_id IS NULL OR branch_id = p_branch_id);

    -- Total due in period (all installments due in this month that belong to first year)
    SELECT COALESCE(SUM(i.amount), 0) INTO v_total_due
    FROM public.installments i
    JOIN public.policies p ON i.policy_id = p.id
    WHERE p.agent_id = p_agent_id
      AND i.due_date BETWEEN v_month_start AND v_month_end
      AND i.due_date <= p.first_year_end
      AND (p_branch_id IS NULL OR p.branch_id = p_branch_id);

    IF v_total_due > 0 THEN
        collection_rate := ROUND((v_total_collected_in_period / v_total_due) * 100, 2);
    ELSE
        collection_rate := 0;
    END IF;

    RETURN NEXT;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- 9.2 Calculate branch performance for a specific month
CREATE OR REPLACE FUNCTION public.calculate_branch_performance(
  p_branch_id uuid,
  p_month int,
  p_year int
)
RETURNS TABLE (
  new_business numeric,
  collections numeric,
  total_production numeric,
  collection_rate numeric
) AS $$
DECLARE
    v_month_start date;
    v_month_end date;
    v_total_due numeric;
    v_total_collected_in_period numeric;
BEGIN
    v_month_start := make_date(p_year, p_month, 1);
    v_month_end := (v_month_start + INTERVAL '1 month' - INTERVAL '1 day')::date;

    -- 1. Total New Business
    SELECT COALESCE(SUM(amount), 0) INTO new_business
    FROM public.unified_performance_metrics
    WHERE branch_id = p_branch_id
      AND is_new_business = true
      AND collection_date BETWEEN v_month_start AND v_month_end;

    -- 2. Total Collections
    SELECT COALESCE(SUM(amount), 0) INTO collections
    FROM public.unified_performance_metrics
    WHERE branch_id = p_branch_id
      AND is_new_business = false
      AND is_first_year_collection = true
      AND collection_date BETWEEN v_month_start AND v_month_end;

    total_production := new_business + collections;

    -- 3. Collection Rate
    SELECT COALESCE(SUM(amount), 0) INTO v_total_collected_in_period
    FROM public.unified_performance_metrics
    WHERE branch_id = p_branch_id
      AND is_first_year_collection = true
      AND collection_date BETWEEN v_month_start AND v_month_end;

    SELECT COALESCE(SUM(i.amount), 0) INTO v_total_due
    FROM public.installments i
    JOIN public.policies p ON i.policy_id = p.id
    WHERE p.branch_id = p_branch_id
      AND i.due_date BETWEEN v_month_start AND v_month_end
      AND i.due_date <= p.first_year_end;

    IF v_total_due > 0 THEN
        collection_rate := ROUND((v_total_collected_in_period / v_total_due) * 100, 2);
    ELSE
        collection_rate := 0;
    END IF;

    RETURN NEXT;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ================================================================
-- PHASE 10: Ensure Data Consistency
-- ================================================================

-- 10.1 Update existing collections to mark new business correctly
UPDATE public.collections c
SET is_new_business = true
WHERE c.id IN (
    SELECT c.id FROM public.collections c
    JOIN public.installments i ON c.installment_id = i.id
    WHERE i.installment_number = 1
    AND c.is_new_business = false
    LIMIT 10000
);

-- 10.2 Mark policies that have new business
UPDATE public.policies p
SET has_new_business_counted = true
WHERE p.id IN (
    SELECT DISTINCT c.policy_id FROM public.collections c
    JOIN public.installments i ON c.installment_id = i.id
    WHERE i.installment_number = 1
    AND c.is_new_business = true
);

-- ================================================================
-- PHASE 11: Ensure Branch Assignment for Existing Data
-- ================================================================

-- 11.1 Assign branch_id to policies if missing (from agent's branch)
UPDATE public.policies p
SET branch_id = (
    SELECT COALESCE(uba.branch_id, b.id)
    FROM public.user_branch_access uba
    LEFT JOIN public.branches b ON b.code = 'MAIN'
    WHERE uba.user_id = p.agent_id
    AND uba.is_active = true
    LIMIT 1
)
WHERE p.branch_id IS NULL;

-- 11.2 Assign branch_id to collections if missing (from policy)
UPDATE public.collections c
SET branch_id = p.branch_id
FROM public.policies p
WHERE c.policy_id = p.id
AND c.branch_id IS NULL;

-- ================================================================
-- PHASE 12: Grant Permissions
-- ================================================================

-- 12.1 Grant permissions on new functions to authenticated users
GRANT EXECUTE ON FUNCTION public.is_user_super_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_user_branch_access(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_agent_performance(uuid, int, int, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_branch_performance(uuid, int, int) TO authenticated;

-- 12.2 Grant select on unified view
GRANT SELECT ON public.unified_performance_metrics TO authenticated;

-- ================================================================
-- End of Migration
-- ================================================================
