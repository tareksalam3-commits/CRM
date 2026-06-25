-- ============================================================
-- Fix Dashboard Schema: Add missing tables, columns, views, and RLS
-- ============================================================

-- 1. Create branches table
CREATE TABLE IF NOT EXISTS public.branches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  code text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Create user_branch_access table
CREATE TABLE IF NOT EXISTS public.user_branch_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'agent',
  is_active boolean NOT NULL DEFAULT true,
  assigned_at timestamptz DEFAULT now(),
  expires_at timestamptz,
  updated_at timestamptz DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, branch_id)
);

-- 3. Add missing columns to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS active_branch_id uuid REFERENCES public.branches(id);

-- 4. Add missing columns to policies
ALTER TABLE public.policies ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES public.branches(id);
ALTER TABLE public.policies ADD COLUMN IF NOT EXISTS group_id uuid;
ALTER TABLE public.policies ADD COLUMN IF NOT EXISTS product_id uuid;
ALTER TABLE public.policies ADD COLUMN IF NOT EXISTS payment_method text;
ALTER TABLE public.policies ADD COLUMN IF NOT EXISTS team_leader_id uuid REFERENCES public.profiles(id);
ALTER TABLE public.policies ADD COLUMN IF NOT EXISTS supervisor_id uuid REFERENCES public.profiles(id);
ALTER TABLE public.policies ADD COLUMN IF NOT EXISTS branch_manager_id uuid REFERENCES public.profiles(id);
ALTER TABLE public.policies ADD COLUMN IF NOT EXISTS first_year_start date;
ALTER TABLE public.policies ADD COLUMN IF NOT EXISTS first_year_end date;
ALTER TABLE public.policies ADD COLUMN IF NOT EXISTS has_new_business_counted boolean DEFAULT false;

-- 5. Add missing columns to clients
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES public.branches(id);

-- 6. Add missing columns to collections
ALTER TABLE public.collections ADD COLUMN IF NOT EXISTS is_new_business boolean DEFAULT false;
ALTER TABLE public.collections ADD COLUMN IF NOT EXISTS collection_category text DEFAULT 'first_year';
ALTER TABLE public.collections ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES public.branches(id);

-- 7. Add missing columns to targets
ALTER TABLE public.targets ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES public.branches(id);

-- 8. Add unique constraint on targets for upsert
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'targets_user_id_period_type_year_period_number_key'
  ) THEN
    ALTER TABLE public.targets ADD CONSTRAINT targets_user_id_period_type_year_period_number_key UNIQUE (user_id, period_type, year, period_number);
  END IF;
END $$;

-- 9. Create unified_performance_metrics view
-- This view joins collections with policies to expose all the columns the app expects
CREATE OR REPLACE VIEW public.unified_performance_metrics AS
SELECT
  c.id,
  c.installment_id,
  c.policy_id,
  c.amount,
  c.collection_date,
  c.collected_by AS agent_id,
  p.branch_id,
  c.is_new_business,
  c.collection_category,
  CASE
    WHEN c.collection_category = 'first_year' THEN true
    ELSE false
  END AS is_first_year_collection,
  c.receipt_number,
  c.notes,
  c.created_at
FROM public.collections c
JOIN public.policies p ON c.policy_id = p.id;

-- 10. Enable RLS on new tables
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_branch_access ENABLE ROW LEVEL SECURITY;

-- 11. RLS Policies for branches (all authenticated users can read)
CREATE POLICY "branches_select_all" ON public.branches
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "branches_insert_admin" ON public.branches
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('super_admin', 'dev_manager'))
  );

CREATE POLICY "branches_update_admin" ON public.branches
  FOR UPDATE TO authenticated USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('super_admin', 'dev_manager'))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('super_admin', 'dev_manager'))
  );

CREATE POLICY "branches_delete_admin" ON public.branches
  FOR DELETE TO authenticated USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('super_admin', 'dev_manager'))
  );

-- 12. RLS Policies for user_branch_access
CREATE POLICY "uba_select_own_or_admin" ON public.user_branch_access
  FOR SELECT TO authenticated USING (
    user_id = auth.uid() OR EXISTS (
      SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('super_admin', 'dev_manager', 'general_supervisor', 'supervisor', 'team_leader')
    )
  );

CREATE POLICY "uba_insert_admin" ON public.user_branch_access
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('super_admin', 'dev_manager'))
  );

CREATE POLICY "uba_update_admin" ON public.user_branch_access
  FOR UPDATE TO authenticated USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('super_admin', 'dev_manager'))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('super_admin', 'dev_manager'))
  );

CREATE POLICY "uba_delete_admin" ON public.user_branch_access
  FOR DELETE TO authenticated USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('super_admin', 'dev_manager'))
  );

-- 13. RLS Policies for profiles (all authenticated can read, self can update)
CREATE POLICY "profiles_select_all" ON public.profiles
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "profiles_update_self_or_admin" ON public.profiles
  FOR UPDATE TO authenticated USING (
    id = auth.uid() OR EXISTS (
      SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('super_admin', 'dev_manager')
    )
  ) WITH CHECK (
    id = auth.uid() OR EXISTS (
      SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('super_admin', 'dev_manager')
    )
  );

CREATE POLICY "profiles_insert_admin" ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (
    id = auth.uid() OR EXISTS (
      SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('super_admin', 'dev_manager')
    )
  );

-- 14. RLS Policies for clients
CREATE POLICY "clients_select_all" ON public.clients
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "clients_insert_all" ON public.clients
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "clients_update_all" ON public.clients
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "clients_delete_all" ON public.clients
  FOR DELETE TO authenticated USING (true);

-- 15. RLS Policies for policies
CREATE POLICY "policies_select_all" ON public.policies
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "policies_insert_all" ON public.policies
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "policies_update_all" ON public.policies
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "policies_delete_all" ON public.policies
  FOR DELETE TO authenticated USING (true);

-- 16. RLS Policies for installments
CREATE POLICY "installments_select_all" ON public.installments
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "installments_insert_all" ON public.installments
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "installments_update_all" ON public.installments
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "installments_delete_all" ON public.installments
  FOR DELETE TO authenticated USING (true);

-- 17. RLS Policies for collections
CREATE POLICY "collections_select_all" ON public.collections
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "collections_insert_all" ON public.collections
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "collections_update_all" ON public.collections
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "collections_delete_all" ON public.collections
  FOR DELETE TO authenticated USING (true);

-- 18. RLS Policies for targets
CREATE POLICY "targets_select_all" ON public.targets
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "targets_insert_all" ON public.targets
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "targets_update_all" ON public.targets
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "targets_delete_all" ON public.targets
  FOR DELETE TO authenticated USING (true);

-- 19. RLS Policies for tasks
CREATE POLICY "tasks_select_all" ON public.tasks
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "tasks_insert_all" ON public.tasks
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "tasks_update_all" ON public.tasks
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "tasks_delete_all" ON public.tasks
  FOR DELETE TO authenticated USING (true);

-- 20. RLS Policies for notifications
CREATE POLICY "notifications_select_all" ON public.notifications
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "notifications_insert_all" ON public.notifications
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "notifications_update_all" ON public.notifications
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "notifications_delete_all" ON public.notifications
  FOR DELETE TO authenticated USING (true);

-- 21. RLS Policies for month_closings
CREATE POLICY "month_closings_select_all" ON public.month_closings
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "month_closings_insert_all" ON public.month_closings
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "month_closings_update_all" ON public.month_closings
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "month_closings_delete_all" ON public.month_closings
  FOR DELETE TO authenticated USING (true);

-- 22. RLS Policies for audit_logs
CREATE POLICY "audit_logs_select_all" ON public.audit_logs
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "audit_logs_insert_all" ON public.audit_logs
  FOR INSERT TO authenticated WITH CHECK (true);

-- 23. RLS Policies for system_settings
CREATE POLICY "settings_select_all" ON public.system_settings
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "settings_insert_admin" ON public.system_settings
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

CREATE POLICY "settings_update_admin" ON public.system_settings
  FOR UPDATE TO authenticated USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin')
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

CREATE POLICY "settings_delete_admin" ON public.system_settings
  FOR DELETE TO authenticated USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

-- 24. Grant access to the unified_performance_metrics view
GRANT SELECT ON public.unified_performance_metrics TO authenticated;
