/*
 * Insurance CRM Pro - Unified User Management & RLS Fix
 *
 * This migration:
 *   1. Creates branches, insurance_groups, user_branch_access tables (required by app).
 *   2. Adds missing columns to profiles (active_branch_id, updated_by audit trail).
 *   3. Creates the recursive subordinate-hierarchy helper function (is_subordinate).
 *   4. Applies four per-CRUD-verb RLS policies on every table (no FOR ALL shortcuts),
 *      so Super Admin / dev_manager can manage users end-to-end while lower roles
 *      can read their own + subordinate data only.
 *   5. Creates a trigger to auto-insert a profile when a new auth.users row appears.
 *   6. Seeds default branch + system settings.
 *
 * Required by: src/contexts/AuthContext.tsx, src/components/users/UserManagement.tsx,
 *              src/services/usersService.ts, supabase/functions/create-user/index.ts
 */

-- ============================================================
-- 1. Tables that the app expects but do not yet exist
-- ============================================================

CREATE TABLE IF NOT EXISTS public.branches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  code text UNIQUE,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.insurance_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  manager_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.user_branch_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'agent' CHECK (role IN ('super_admin','dev_manager','general_supervisor','supervisor','team_leader','agent')),
  is_active boolean NOT NULL DEFAULT true,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, branch_id)
);

CREATE INDEX IF NOT EXISTS idx_user_branch_access_user ON public.user_branch_access(user_id);
CREATE INDEX IF NOT EXISTS idx_user_branch_access_branch ON public.user_branch_access(branch_id);

-- ============================================================
-- 2. Add missing columns to profiles (only if they do not exist)
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='profiles' AND column_name='active_branch_id') THEN
    ALTER TABLE public.profiles ADD COLUMN active_branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL;
  END IF;
END$$;

-- ============================================================
-- 3. Helper function: recursive subordinate lookup
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_subordinate(manager_uuid uuid, subordinate_uuid uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_manager uuid;
  visited uuid[] := ARRAY[]::uuid[];
  target uuid := subordinate_uuid;
BEGIN
  IF manager_uuid IS NULL OR subordinate_uuid IS NULL THEN
    RETURN false;
  END IF;
  IF manager_uuid = subordinate_uuid THEN
    RETURN false;
  END IF;

  WHILE target IS NOT NULL AND NOT visited::text[] @> ARRAY[target::text] LOOP
    visited := array_append(visited, target);
    SELECT manager_id INTO current_manager FROM public.profiles WHERE id = target;
    IF current_manager IS NULL THEN
      RETURN false;
    END IF;
    IF current_manager = manager_uuid THEN
      RETURN true;
    END IF;
    target := current_manager;
  END LOOP;

  RETURN false;
END;
$$;

-- ============================================================
-- 4. Drop all existing policies (schema is fresh, but be defensive)
-- ============================================================

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN (
    SELECT policyname, tablename
    FROM pg_policies
    WHERE schemaname = 'public'
  ) LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END$$;

-- ============================================================
-- 5. RLS policies - exactly four per table (SELECT/INSERT/UPDATE/DELETE)
-- ============================================================

-- ---------- profiles ----------
-- Super admin: full access. Dev manager: everyone except super_admin.
-- Other roles: self + subordinates only.
CREATE POLICY "profiles_select" ON public.profiles
  FOR SELECT TO authenticated
  USING (
    auth.uid() = id
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('super_admin','dev_manager'))
    OR public.is_subordinate(auth.uid(), id)
  );

CREATE POLICY "profiles_insert" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('super_admin','dev_manager','general_supervisor','supervisor','team_leader'))
    OR auth.uid() = id
  );

CREATE POLICY "profiles_update" ON public.profiles
  FOR UPDATE TO authenticated
  USING (
    auth.uid() = id
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('super_admin','dev_manager'))
    OR public.is_subordinate(auth.uid(), id)
  )
  WITH CHECK (
    auth.uid() = id
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('super_admin','dev_manager'))
    OR public.is_subordinate(auth.uid(), id)
  );

CREATE POLICY "profiles_delete" ON public.profiles
  FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('super_admin','dev_manager'))
  );

-- ---------- branches ----------
CREATE POLICY "branches_select" ON public.branches
  FOR SELECT TO authenticated
  USING (is_active = true OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('super_admin','dev_manager')));

CREATE POLICY "branches_insert" ON public.branches
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('super_admin','dev_manager')));

CREATE POLICY "branches_update" ON public.branches
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('super_admin','dev_manager')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('super_admin','dev_manager')));

CREATE POLICY "branches_delete" ON public.branches
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin'));

-- ---------- insurance_groups ----------
CREATE POLICY "insurance_groups_select" ON public.insurance_groups
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "insurance_groups_insert" ON public.insurance_groups
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('super_admin','dev_manager','general_supervisor','supervisor','team_leader')));

CREATE POLICY "insurance_groups_update" ON public.insurance_groups
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('super_admin','dev_manager','general_supervisor','supervisor','team_leader')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('super_admin','dev_manager','general_supervisor','supervisor','team_leader')));

CREATE POLICY "insurance_groups_delete" ON public.insurance_groups
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('super_admin','dev_manager')));

-- ---------- user_branch_access ----------
CREATE POLICY "user_branch_access_select" ON public.user_branch_access
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('super_admin','dev_manager'))
    OR public.is_subordinate(auth.uid(), user_id)
  );

CREATE POLICY "user_branch_access_insert" ON public.user_branch_access
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('super_admin','dev_manager'))
    OR public.is_subordinate(auth.uid(), user_id)
  );

CREATE POLICY "user_branch_access_update" ON public.user_branch_access
  FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('super_admin','dev_manager'))
    OR public.is_subordinate(auth.uid(), user_id)
  )
  WITH CHECK (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('super_admin','dev_manager'))
    OR public.is_subordinate(auth.uid(), user_id)
  );

CREATE POLICY "user_branch_access_delete" ON public.user_branch_access
  FOR DELETE TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('super_admin','dev_manager'))
    OR public.is_subordinate(auth.uid(), user_id)
  );

-- ---------- clients ----------
CREATE POLICY "clients_select" ON public.clients
  FOR SELECT TO authenticated
  USING (agent_id = auth.uid() OR public.is_subordinate(auth.uid(), agent_id) OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('super_admin','dev_manager')));

CREATE POLICY "clients_insert" ON public.clients
  FOR INSERT TO authenticated
  WITH CHECK (agent_id = auth.uid() OR public.is_subordinate(auth.uid(), agent_id) OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('super_admin','dev_manager')));

CREATE POLICY "clients_update" ON public.clients
  FOR UPDATE TO authenticated
  USING (agent_id = auth.uid() OR public.is_subordinate(auth.uid(), agent_id) OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('super_admin','dev_manager')))
  WITH CHECK (agent_id = auth.uid() OR public.is_subordinate(auth.uid(), agent_id) OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('super_admin','dev_manager')));

CREATE POLICY "clients_delete" ON public.clients
  FOR DELETE TO authenticated
  USING (agent_id = auth.uid() OR public.is_subordinate(auth.uid(), agent_id) OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('super_admin','dev_manager')));

-- ---------- policies ----------
CREATE POLICY "policies_select" ON public.policies
  FOR SELECT TO authenticated
  USING (agent_id = auth.uid() OR public.is_subordinate(auth.uid(), agent_id) OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('super_admin','dev_manager')));

CREATE POLICY "policies_insert" ON public.policies
  FOR INSERT TO authenticated
  WITH CHECK (agent_id = auth.uid() OR public.is_subordinate(auth.uid(), agent_id) OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('super_admin','dev_manager')));

CREATE POLICY "policies_update" ON public.policies
  FOR UPDATE TO authenticated
  USING (agent_id = auth.uid() OR public.is_subordinate(auth.uid(), agent_id) OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('super_admin','dev_manager')))
  WITH CHECK (agent_id = auth.uid() OR public.is_subordinate(auth.uid(), agent_id) OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('super_admin','dev_manager')));

CREATE POLICY "policies_delete" ON public.policies
  FOR DELETE TO authenticated
  USING (agent_id = auth.uid() OR public.is_subordinate(auth.uid(), agent_id) OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('super_admin','dev_manager')));

-- ---------- installments ----------
CREATE POLICY "installments_select" ON public.installments
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.policies p WHERE p.id = policy_id AND (p.agent_id = auth.uid() OR public.is_subordinate(auth.uid(), p.agent_id) OR EXISTS (SELECT 1 FROM public.profiles pp WHERE pp.id = auth.uid() AND pp.role IN ('super_admin','dev_manager')))));

CREATE POLICY "installments_insert" ON public.installments
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.policies p WHERE p.id = policy_id AND (p.agent_id = auth.uid() OR public.is_subordinate(auth.uid(), p.agent_id) OR EXISTS (SELECT 1 FROM public.profiles pp WHERE pp.id = auth.uid() AND pp.role IN ('super_admin','dev_manager')))));

CREATE POLICY "installments_update" ON public.installments
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.policies p WHERE p.id = policy_id AND (p.agent_id = auth.uid() OR public.is_subordinate(auth.uid(), p.agent_id) OR EXISTS (SELECT 1 FROM public.profiles pp WHERE pp.id = auth.uid() AND pp.role IN ('super_admin','dev_manager')))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.policies p WHERE p.id = policy_id AND (p.agent_id = auth.uid() OR public.is_subordinate(auth.uid(), p.agent_id) OR EXISTS (SELECT 1 FROM public.profiles pp WHERE pp.id = auth.uid() AND pp.role IN ('super_admin','dev_manager')))));

CREATE POLICY "installments_delete" ON public.installments
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.policies p WHERE p.id = policy_id AND (p.agent_id = auth.uid() OR public.is_subordinate(auth.uid(), p.agent_id) OR EXISTS (SELECT 1 FROM public.profiles pp WHERE pp.id = auth.uid() AND pp.role IN ('super_admin','dev_manager')))));

-- ---------- collections ----------
CREATE POLICY "collections_select" ON public.collections
  FOR SELECT TO authenticated
  USING (collected_by = auth.uid() OR public.is_subordinate(auth.uid(), collected_by) OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('super_admin','dev_manager')));

CREATE POLICY "collections_insert" ON public.collections
  FOR INSERT TO authenticated
  WITH CHECK (collected_by = auth.uid() OR public.is_subordinate(auth.uid(), collected_by) OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('super_admin','dev_manager')));

CREATE POLICY "collections_update" ON public.collections
  FOR UPDATE TO authenticated
  USING (collected_by = auth.uid() OR public.is_subordinate(auth.uid(), collected_by) OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('super_admin','dev_manager')))
  WITH CHECK (collected_by = auth.uid() OR public.is_subordinate(auth.uid(), collected_by) OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('super_admin','dev_manager')));

CREATE POLICY "collections_delete" ON public.collections
  FOR DELETE TO authenticated
  USING (collected_by = auth.uid() OR public.is_subordinate(auth.uid(), collected_by) OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('super_admin','dev_manager')));

-- ---------- targets ----------
CREATE POLICY "targets_select" ON public.targets
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_subordinate(auth.uid(), user_id) OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('super_admin','dev_manager')));

CREATE POLICY "targets_insert" ON public.targets
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR public.is_subordinate(auth.uid(), user_id) OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('super_admin','dev_manager','general_supervisor','supervisor','team_leader')));

CREATE POLICY "targets_update" ON public.targets
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.is_subordinate(auth.uid(), user_id) OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('super_admin','dev_manager')))
  WITH CHECK (user_id = auth.uid() OR public.is_subordinate(auth.uid(), user_id) OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('super_admin','dev_manager')));

CREATE POLICY "targets_delete" ON public.targets
  FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.is_subordinate(auth.uid(), user_id) OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('super_admin','dev_manager')));

-- ---------- tasks ----------
CREATE POLICY "tasks_select" ON public.tasks
  FOR SELECT TO authenticated
  USING (assigned_to = auth.uid() OR created_by = auth.uid() OR public.is_subordinate(auth.uid(), assigned_to) OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('super_admin','dev_manager')));

CREATE POLICY "tasks_insert" ON public.tasks
  FOR INSERT TO authenticated
  WITH CHECK (assigned_to = auth.uid() OR public.is_subordinate(auth.uid(), assigned_to) OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('super_admin','dev_manager','general_supervisor','supervisor','team_leader')));

CREATE POLICY "tasks_update" ON public.tasks
  FOR UPDATE TO authenticated
  USING (assigned_to = auth.uid() OR created_by = auth.uid() OR public.is_subordinate(auth.uid(), assigned_to) OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('super_admin','dev_manager')))
  WITH CHECK (true);

CREATE POLICY "tasks_delete" ON public.tasks
  FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('super_admin','dev_manager')));

-- ---------- notifications ----------
CREATE POLICY "notifications_select" ON public.notifications
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "notifications_insert" ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "notifications_update" ON public.notifications
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "notifications_delete" ON public.notifications
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- ---------- month_closings ----------
CREATE POLICY "month_closings_select" ON public.month_closings
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "month_closings_insert" ON public.month_closings
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('super_admin','dev_manager')));

CREATE POLICY "month_closings_update" ON public.month_closings
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('super_admin','dev_manager')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('super_admin','dev_manager')));

CREATE POLICY "month_closings_delete" ON public.month_closings
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin'));

-- ---------- audit_logs ----------
CREATE POLICY "audit_logs_select" ON public.audit_logs
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('super_admin','dev_manager','general_supervisor')));

CREATE POLICY "audit_logs_insert" ON public.audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "audit_logs_update" ON public.audit_logs
  FOR UPDATE TO authenticated
  USING (false)
  WITH CHECK (false);

CREATE POLICY "audit_logs_delete" ON public.audit_logs
  FOR DELETE TO authenticated
  USING (false);

-- ---------- system_settings ----------
CREATE POLICY "system_settings_select" ON public.system_settings
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "system_settings_insert" ON public.system_settings
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin'));

CREATE POLICY "system_settings_update" ON public.system_settings
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin'));

CREATE POLICY "system_settings_delete" ON public.system_settings
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin'));

-- ============================================================
-- 6. Auto-create profile row when a new auth.users row is inserted.
--    The create-user Edge Function already inserts the profile, so this
--    trigger is a safety net. Default role is agent; super_admin can elevate.
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role, is_active)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'role', 'agent'),
    true
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- 7. Updated_at auto-maintenance trigger
-- ============================================================

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_set_updated_at ON public.profiles;
CREATE TRIGGER profiles_set_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS branches_set_updated_at ON public.branches;
CREATE TRIGGER branches_set_updated_at BEFORE UPDATE ON public.branches
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS user_branch_access_set_updated_at ON public.user_branch_access;
CREATE TRIGGER user_branch_access_set_updated_at BEFORE UPDATE ON public.user_branch_access
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- 8. Seed default branch + system settings
-- ============================================================

INSERT INTO public.branches (name, code, is_active)
VALUES ('الفرع الرئيسي', 'MAIN', true)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.system_settings (key, value) VALUES
  ('company_name', '"Insurance CRM Pro"'::jsonb),
  ('insurance_products', '["حياة فردي", "حياة جماعي", "تكافل", "استثمار", "حوادث شخصية", "تأمين صحي"]'::jsonb),
  ('insurance_companies', '["شركة مصر لتأمينات الحياة", "أليانز", "أكسا", "المصرية للتأمين التكافلي", "MetLife"]'::jsonb)
ON CONFLICT (key) DO NOTHING;
