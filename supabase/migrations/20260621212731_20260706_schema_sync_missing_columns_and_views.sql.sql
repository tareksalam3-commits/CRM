/*
 * Schema Sync: Add all columns expected by the codebase that don't yet exist in the DB.
 * Also create the unified_performance_metrics view and RPC helper functions.
 *
 * Affected tables: policies, clients, targets, profiles (already has active_branch_id)
 * New objects: unified_performance_metrics view, get_branch_performance_report, get_agent_performance_report
 */

-- ============================================================
-- 1. Add missing columns to existing tables
-- ============================================================

-- policies: branch_id, product_id, payment_method, team_leader_id, supervisor_id,
--           branch_manager_id, first_year_start, first_year_end, has_new_business_counted
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='policies' AND column_name='branch_id') THEN
    ALTER TABLE public.policies ADD COLUMN branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='policies' AND column_name='product_id') THEN
    ALTER TABLE public.policies ADD COLUMN product_id uuid;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='policies' AND column_name='payment_method') THEN
    ALTER TABLE public.policies ADD COLUMN payment_method text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='policies' AND column_name='team_leader_id') THEN
    ALTER TABLE public.policies ADD COLUMN team_leader_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='policies' AND column_name='supervisor_id') THEN
    ALTER TABLE public.policies ADD COLUMN supervisor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='policies' AND column_name='branch_manager_id') THEN
    ALTER TABLE public.policies ADD COLUMN branch_manager_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='policies' AND column_name='first_year_start') THEN
    ALTER TABLE public.policies ADD COLUMN first_year_start date;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='policies' AND column_name='first_year_end') THEN
    ALTER TABLE public.policies ADD COLUMN first_year_end date;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='policies' AND column_name='has_new_business_counted') THEN
    ALTER TABLE public.policies ADD COLUMN has_new_business_counted boolean NOT NULL DEFAULT false;
  END IF;
END$$;

-- Populate first_year_start/first_year_end from start_date (for existing rows)
UPDATE public.policies
SET
  first_year_start = start_date,
  first_year_end   = start_date + interval '1 year'
WHERE first_year_start IS NULL AND start_date IS NOT NULL;

-- clients: branch_id
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='clients' AND column_name='branch_id') THEN
    ALTER TABLE public.clients ADD COLUMN branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL;
  END IF;
END$$;

-- targets: branch_id
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='targets' AND column_name='branch_id') THEN
    ALTER TABLE public.targets ADD COLUMN branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL;
  END IF;
END$$;

-- tasks: branch_id (used by some components)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='tasks' AND column_name='branch_id') THEN
    ALTER TABLE public.tasks ADD COLUMN branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL;
  END IF;
END$$;

-- notifications: related_entity_type, related_entity_id, branch_id
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='notifications' AND column_name='related_entity_type') THEN
    ALTER TABLE public.notifications ADD COLUMN related_entity_type text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='notifications' AND column_name='related_entity_id') THEN
    ALTER TABLE public.notifications ADD COLUMN related_entity_id uuid;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='notifications' AND column_name='branch_id') THEN
    ALTER TABLE public.notifications ADD COLUMN branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL;
  END IF;
END$$;

-- month_closings: branch_id, total_premiums, total_collections, collection_rate
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='month_closings' AND column_name='branch_id') THEN
    ALTER TABLE public.month_closings ADD COLUMN branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='month_closings' AND column_name='total_premiums') THEN
    ALTER TABLE public.month_closings ADD COLUMN total_premiums numeric(14,2) NOT NULL DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='month_closings' AND column_name='total_collections') THEN
    ALTER TABLE public.month_closings ADD COLUMN total_collections numeric(14,2) NOT NULL DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='month_closings' AND column_name='collection_rate') THEN
    ALTER TABLE public.month_closings ADD COLUMN collection_rate numeric(5,2) NOT NULL DEFAULT 0;
  END IF;
END$$;

-- collections: updated_at (some components may expect it)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='collections' AND column_name='updated_at') THEN
    ALTER TABLE public.collections ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
  END IF;
END$$;

-- insurance_groups: updated_at
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='insurance_groups' AND column_name='updated_at') THEN
    ALTER TABLE public.insurance_groups ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
  END IF;
END$$;

-- ============================================================
-- 2. Indexes for the new FK columns (performance)
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_policies_branch ON public.policies(branch_id);
CREATE INDEX IF NOT EXISTS idx_policies_team_leader ON public.policies(team_leader_id);
CREATE INDEX IF NOT EXISTS idx_clients_branch ON public.clients(branch_id);
CREATE INDEX IF NOT EXISTS idx_targets_branch ON public.targets(branch_id);
CREATE INDEX IF NOT EXISTS idx_tasks_branch ON public.tasks(branch_id);

-- ============================================================
-- 3. Trigger: auto-set first_year_start/first_year_end on INSERT
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_policy_first_year()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.first_year_start IS NULL AND NEW.start_date IS NOT NULL THEN
    NEW.first_year_start := NEW.start_date;
    NEW.first_year_end   := NEW.start_date + interval '1 year';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS policies_set_first_year ON public.policies;
CREATE TRIGGER policies_set_first_year
  BEFORE INSERT OR UPDATE OF start_date ON public.policies
  FOR EACH ROW EXECUTE FUNCTION public.set_policy_first_year();

-- ============================================================
-- 4. unified_performance_metrics VIEW
--    Joins collections → installments → policies to determine
--    is_new_business (first installment) and is_first_year_collection.
-- ============================================================
DROP VIEW IF EXISTS public.unified_performance_metrics CASCADE;
CREATE VIEW public.unified_performance_metrics AS
SELECT
  c.id,
  c.installment_id,
  c.policy_id,
  c.amount,
  c.collection_date,
  c.collected_by,
  p.agent_id,
  p.branch_id,
  p.team_leader_id,
  p.supervisor_id,
  p.branch_manager_id,
  p.first_year_start,
  p.first_year_end,
  -- First installment of a policy = new business
  (i.installment_number = 1) AS is_new_business,
  -- Any installment within the first year = first-year collection
  (
    p.first_year_end IS NOT NULL
    AND c.collection_date <= p.first_year_end
    AND c.collection_date >= COALESCE(p.first_year_start, p.start_date)
  ) AS is_first_year_collection
FROM public.collections c
JOIN public.installments i ON i.id = c.installment_id
JOIN public.policies p ON p.id = c.policy_id;

-- Grant SELECT to authenticated
GRANT SELECT ON public.unified_performance_metrics TO authenticated;

-- ============================================================
-- 5. RLS on the view — views inherit calling user's RLS by default,
--    but explicitly allow authenticated reads for safety.
-- ============================================================

-- ============================================================
-- 6. RPC: get_agent_performance_report(p_month, p_year)
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_agent_performance_report(
  p_month int DEFAULT NULL,
  p_year  int DEFAULT NULL
)
RETURNS TABLE (
  agent_id            uuid,
  agent_name          text,
  new_business_amount numeric,
  collections_amount  numeric,
  total_production    numeric,
  target_amount       numeric,
  achievement_rate    numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year  int := COALESCE(p_year,  date_part('year',  now())::int);
  v_month int := COALESCE(p_month, date_part('month', now())::int);
  v_start date := make_date(v_year, v_month, 1);
  v_end   date := (v_start + interval '1 month - 1 day')::date;
BEGIN
  RETURN QUERY
  SELECT
    pr.id                     AS agent_id,
    pr.full_name              AS agent_name,
    COALESCE(SUM(CASE WHEN upm.is_new_business THEN upm.amount ELSE 0 END), 0) AS new_business_amount,
    COALESCE(SUM(CASE WHEN NOT upm.is_new_business AND upm.is_first_year_collection THEN upm.amount ELSE 0 END), 0) AS collections_amount,
    COALESCE(SUM(CASE WHEN upm.is_new_business OR upm.is_first_year_collection THEN upm.amount ELSE 0 END), 0) AS total_production,
    COALESCE((
      SELECT SUM(t.target_amount)
      FROM public.targets t
      WHERE t.user_id = pr.id AND t.period_type = 'monthly' AND t.year = v_year AND t.period_number = v_month
    ), 0) AS target_amount,
    CASE
      WHEN COALESCE((
        SELECT SUM(t.target_amount) FROM public.targets t
        WHERE t.user_id = pr.id AND t.period_type = 'monthly' AND t.year = v_year AND t.period_number = v_month
      ), 0) = 0 THEN 0
      ELSE ROUND(
        COALESCE(SUM(CASE WHEN upm.is_new_business OR upm.is_first_year_collection THEN upm.amount ELSE 0 END), 0)
        / (SELECT SUM(t.target_amount) FROM public.targets t
           WHERE t.user_id = pr.id AND t.period_type = 'monthly' AND t.year = v_year AND t.period_number = v_month) * 100, 2
      )
    END AS achievement_rate
  FROM public.profiles pr
  LEFT JOIN public.unified_performance_metrics upm
    ON upm.agent_id = pr.id
    AND upm.collection_date BETWEEN v_start AND v_end
  WHERE pr.role = 'agent' AND pr.is_active = true
  GROUP BY pr.id, pr.full_name
  ORDER BY total_production DESC;
END;
$$;

-- ============================================================
-- 7. RPC: get_branch_performance_report(p_month, p_year)
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_branch_performance_report(
  p_month int DEFAULT NULL,
  p_year  int DEFAULT NULL
)
RETURNS TABLE (
  branch_id           uuid,
  branch_name         text,
  new_business_amount numeric,
  collections_amount  numeric,
  total_production    numeric,
  target_amount       numeric,
  achievement_rate    numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year  int := COALESCE(p_year,  date_part('year',  now())::int);
  v_month int := COALESCE(p_month, date_part('month', now())::int);
  v_start date := make_date(v_year, v_month, 1);
  v_end   date := (v_start + interval '1 month - 1 day')::date;
BEGIN
  RETURN QUERY
  SELECT
    b.id                      AS branch_id,
    b.name                    AS branch_name,
    COALESCE(SUM(CASE WHEN upm.is_new_business THEN upm.amount ELSE 0 END), 0) AS new_business_amount,
    COALESCE(SUM(CASE WHEN NOT upm.is_new_business AND upm.is_first_year_collection THEN upm.amount ELSE 0 END), 0) AS collections_amount,
    COALESCE(SUM(CASE WHEN upm.is_new_business OR upm.is_first_year_collection THEN upm.amount ELSE 0 END), 0) AS total_production,
    COALESCE((
      SELECT SUM(t.target_amount)
      FROM public.targets t
      WHERE t.branch_id = b.id AND t.period_type = 'monthly' AND t.year = v_year AND t.period_number = v_month
    ), 0) AS target_amount,
    CASE
      WHEN COALESCE((
        SELECT SUM(t.target_amount) FROM public.targets t
        WHERE t.branch_id = b.id AND t.period_type = 'monthly' AND t.year = v_year AND t.period_number = v_month
      ), 0) = 0 THEN 0
      ELSE ROUND(
        COALESCE(SUM(CASE WHEN upm.is_new_business OR upm.is_first_year_collection THEN upm.amount ELSE 0 END), 0)
        / (SELECT SUM(t.target_amount) FROM public.targets t
           WHERE t.branch_id = b.id AND t.period_type = 'monthly' AND t.year = v_year AND t.period_number = v_month) * 100, 2
      )
    END AS achievement_rate
  FROM public.branches b
  LEFT JOIN public.unified_performance_metrics upm
    ON upm.branch_id = b.id
    AND upm.collection_date BETWEEN v_start AND v_end
  WHERE b.is_active = true
  GROUP BY b.id, b.name
  ORDER BY total_production DESC;
END;
$$;

-- ============================================================
-- 8. Grant execute on RPC functions to authenticated users
-- ============================================================
GRANT EXECUTE ON FUNCTION public.get_agent_performance_report(int, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_branch_performance_report(int, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_subordinate(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_view_profile(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_profile(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_create_profile(uuid, text, uuid) TO authenticated;
