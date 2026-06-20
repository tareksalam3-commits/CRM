-- ================================================================
-- Fix: super_admin/dev_manager get no rows because is_user_super_admin()
-- checks user_branch_access for a 'super_admin' row — which never exists
-- for these roles (AuthContext deliberately skips that fetch).
-- Fix: rewrite is_user_super_admin() to read profiles.role directly,
-- and add an OR branch in every data-table policy that grants full
-- access when profiles.role IN ('super_admin','dev_manager').
-- ================================================================

-- ----------------------------------------------------------------
-- 1. Fix is_user_super_admin() — use profiles.role, not branch access
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_user_super_admin(p_user_id uuid)
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = p_user_id
      AND role IN ('super_admin', 'dev_manager')
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.is_user_super_admin(uuid) TO authenticated;

-- ----------------------------------------------------------------
-- 2. Fix check_user_branch_access() — inherits fix from above,
--    but restate clearly so it is self-contained
-- ----------------------------------------------------------------
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

GRANT EXECUTE ON FUNCTION public.check_user_branch_access(uuid, uuid) TO authenticated;

-- ----------------------------------------------------------------
-- 3. clients
-- ----------------------------------------------------------------
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

-- ----------------------------------------------------------------
-- 4. policies
-- ----------------------------------------------------------------
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

-- ----------------------------------------------------------------
-- 5. collections
-- ----------------------------------------------------------------
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

-- ----------------------------------------------------------------
-- 6. targets
-- ----------------------------------------------------------------
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

-- ----------------------------------------------------------------
-- 7. tasks
-- ----------------------------------------------------------------
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

-- ----------------------------------------------------------------
-- 8. installments
-- ----------------------------------------------------------------
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

DROP POLICY IF EXISTS "installments_insert" ON public.installments;
CREATE POLICY "installments_insert" ON public.installments FOR INSERT TO authenticated
WITH CHECK (
  public.is_user_super_admin(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.policies p
    WHERE p.id = policy_id
      AND public.check_user_branch_access(auth.uid(), p.branch_id)
  )
);

DROP POLICY IF EXISTS "installments_update" ON public.installments;
CREATE POLICY "installments_update" ON public.installments FOR UPDATE TO authenticated
USING (
  public.is_user_super_admin(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.policies p
    WHERE p.id = policy_id
      AND public.check_user_branch_access(auth.uid(), p.branch_id)
  )
);

DROP POLICY IF EXISTS "installments_delete" ON public.installments;
CREATE POLICY "installments_delete" ON public.installments FOR DELETE TO authenticated
USING (
  public.is_user_super_admin(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.policies p
    WHERE p.id = policy_id
      AND public.check_user_branch_access(auth.uid(), p.branch_id)
  )
);

-- ----------------------------------------------------------------
-- 9. branches
-- ----------------------------------------------------------------
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

-- ----------------------------------------------------------------
-- 10. audit_logs
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "audit_logs_select" ON public.audit_logs;
CREATE POLICY "audit_logs_select" ON public.audit_logs FOR SELECT TO authenticated
USING (
  public.is_user_super_admin(auth.uid())
  OR user_id = auth.uid()
);

-- ----------------------------------------------------------------
-- Done
-- ----------------------------------------------------------------
DO $$
BEGIN
  RAISE NOTICE 'Migration 20260704000000_fix_super_admin_rls completed.';
  RAISE NOTICE 'is_user_super_admin() now reads profiles.role (not user_branch_access).';
  RAISE NOTICE 'All data-table RLS policies updated to honour the fix.';
END $$;
