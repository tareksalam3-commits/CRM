-- ================================================================
-- Restore roles to profiles table for super_admin and dev_manager
-- and ensure super_admin can see everything
-- ================================================================

-- 1. Add role and branch_id columns back to profiles table
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS role text CHECK (role IS NULL OR role IN ('super_admin', 'dev_manager', 'general_supervisor', 'supervisor', 'team_leader', 'branch_manager', 'agent')),
ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL;

-- 2. Create index for role column
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);

-- 3. Update RLS policy for profiles to allow super_admin to see everything
DROP POLICY IF EXISTS "profiles_select" ON public.profiles;
CREATE POLICY "profiles_select" ON public.profiles FOR SELECT TO authenticated
USING (
  -- Super admin and dev_manager can see all profiles
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('super_admin', 'dev_manager'))
  -- Users can see their own profile
  OR id = auth.uid()
  -- Users can see profiles of users they manage
  OR manager_id = auth.uid()
);

DROP POLICY IF EXISTS "profiles_update" ON public.profiles;
CREATE POLICY "profiles_update" ON public.profiles FOR UPDATE TO authenticated
USING (
  -- Super admin can update any profile
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin')
  -- Users can update their own profile
  OR id = auth.uid()
)
WITH CHECK (
  -- Super admin can update any profile
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin')
  -- Users can update their own profile
  OR id = auth.uid()
);

-- 4. Update is_user_super_admin function to check profiles.role first
CREATE OR REPLACE FUNCTION public.is_user_super_admin(p_user_id uuid)
RETURNS boolean AS $$
BEGIN
  -- Check profiles.role first (for super_admin and dev_manager)
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = p_user_id
      AND role IN ('super_admin', 'dev_manager')
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- 5. Update check_user_branch_access to allow super_admin full access
CREATE OR REPLACE FUNCTION public.check_user_branch_access(p_user_id uuid, p_branch_id uuid)
RETURNS boolean AS $$
BEGIN
  -- Super admin / dev manager can access every branch
  IF public.is_user_super_admin(p_user_id) THEN
    RETURN true;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.user_branch_access
    WHERE user_id   = p_user_id
      AND branch_id = p_branch_id
      AND is_active = true
      AND (expires_at IS NULL OR expires_at > now())
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- 6. Update RLS policies for all tables to grant full access to super_admin

-- Clients
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

DROP POLICY IF EXISTS "clients_insert" ON public.clients;
CREATE POLICY "clients_insert" ON public.clients FOR INSERT TO authenticated
WITH CHECK (
  public.is_user_super_admin(auth.uid())
  OR public.check_user_branch_access(auth.uid(), branch_id)
);

DROP POLICY IF EXISTS "clients_update" ON public.clients;
CREATE POLICY "clients_update" ON public.clients FOR UPDATE TO authenticated
USING (
  public.is_user_super_admin(auth.uid())
  OR public.check_user_branch_access(auth.uid(), branch_id)
)
WITH CHECK (
  public.is_user_super_admin(auth.uid())
  OR public.check_user_branch_access(auth.uid(), branch_id)
);

DROP POLICY IF EXISTS "clients_delete" ON public.clients;
CREATE POLICY "clients_delete" ON public.clients FOR DELETE TO authenticated
USING (
  public.is_user_super_admin(auth.uid())
  OR public.check_user_branch_access(auth.uid(), branch_id)
);

-- Policies
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

DROP POLICY IF EXISTS "policies_insert" ON public.policies;
CREATE POLICY "policies_insert" ON public.policies FOR INSERT TO authenticated
WITH CHECK (
  public.is_user_super_admin(auth.uid())
  OR public.check_user_branch_access(auth.uid(), branch_id)
);

DROP POLICY IF EXISTS "policies_update" ON public.policies;
CREATE POLICY "policies_update" ON public.policies FOR UPDATE TO authenticated
USING (
  public.is_user_super_admin(auth.uid())
  OR public.check_user_branch_access(auth.uid(), branch_id)
)
WITH CHECK (
  public.is_user_super_admin(auth.uid())
  OR public.check_user_branch_access(auth.uid(), branch_id)
);

DROP POLICY IF EXISTS "policies_delete" ON public.policies;
CREATE POLICY "policies_delete" ON public.policies FOR DELETE TO authenticated
USING (
  public.is_user_super_admin(auth.uid())
  OR public.check_user_branch_access(auth.uid(), branch_id)
);

-- Collections
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

DROP POLICY IF EXISTS "collections_insert" ON public.collections;
CREATE POLICY "collections_insert" ON public.collections FOR INSERT TO authenticated
WITH CHECK (
  public.is_user_super_admin(auth.uid())
  OR public.check_user_branch_access(auth.uid(), branch_id)
);

DROP POLICY IF EXISTS "collections_update" ON public.collections;
CREATE POLICY "collections_update" ON public.collections FOR UPDATE TO authenticated
USING (
  public.is_user_super_admin(auth.uid())
  OR public.check_user_branch_access(auth.uid(), branch_id)
)
WITH CHECK (
  public.is_user_super_admin(auth.uid())
  OR public.check_user_branch_access(auth.uid(), branch_id)
);

DROP POLICY IF EXISTS "collections_delete" ON public.collections;
CREATE POLICY "collections_delete" ON public.collections FOR DELETE TO authenticated
USING (
  public.is_user_super_admin(auth.uid())
  OR public.check_user_branch_access(auth.uid(), branch_id)
);

-- Targets
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

DROP POLICY IF EXISTS "targets_insert" ON public.targets;
CREATE POLICY "targets_insert" ON public.targets FOR INSERT TO authenticated
WITH CHECK (
  public.is_user_super_admin(auth.uid())
  OR public.check_user_branch_access(auth.uid(), branch_id)
);

DROP POLICY IF EXISTS "targets_update" ON public.targets;
CREATE POLICY "targets_update" ON public.targets FOR UPDATE TO authenticated
USING (
  public.is_user_super_admin(auth.uid())
  OR public.check_user_branch_access(auth.uid(), branch_id)
)
WITH CHECK (
  public.is_user_super_admin(auth.uid())
  OR public.check_user_branch_access(auth.uid(), branch_id)
);

DROP POLICY IF EXISTS "targets_delete" ON public.targets;
CREATE POLICY "targets_delete" ON public.targets FOR DELETE TO authenticated
USING (
  public.is_user_super_admin(auth.uid())
  OR public.check_user_branch_access(auth.uid(), branch_id)
);

-- Tasks
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

DROP POLICY IF EXISTS "tasks_insert" ON public.tasks;
CREATE POLICY "tasks_insert" ON public.tasks FOR INSERT TO authenticated
WITH CHECK (
  public.is_user_super_admin(auth.uid())
  OR public.check_user_branch_access(auth.uid(), branch_id)
);

DROP POLICY IF EXISTS "tasks_update" ON public.tasks;
CREATE POLICY "tasks_update" ON public.tasks FOR UPDATE TO authenticated
USING (
  public.is_user_super_admin(auth.uid())
  OR public.check_user_branch_access(auth.uid(), branch_id)
)
WITH CHECK (
  public.is_user_super_admin(auth.uid())
  OR public.check_user_branch_access(auth.uid(), branch_id)
);

DROP POLICY IF EXISTS "tasks_delete" ON public.tasks;
CREATE POLICY "tasks_delete" ON public.tasks FOR DELETE TO authenticated
USING (
  public.is_user_super_admin(auth.uid())
  OR public.check_user_branch_access(auth.uid(), branch_id)
);

-- Branches - Super admin can see all branches
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

-- Audit logs - Super admin can see all logs
DROP POLICY IF EXISTS "audit_logs_select" ON public.audit_logs;
CREATE POLICY "audit_logs_select" ON public.audit_logs FOR SELECT TO authenticated
USING (
  public.is_user_super_admin(auth.uid())
  OR user_id = auth.uid()
);

-- Done
DO $$
BEGIN
  RAISE NOTICE 'Migration 20260621000001_restore_roles_to_profiles completed.';
  RAISE NOTICE 'Roles restored to profiles table for super_admin and dev_manager.';
  RAISE NOTICE 'Super admin now has full access to all branches and data.';
END $$;
