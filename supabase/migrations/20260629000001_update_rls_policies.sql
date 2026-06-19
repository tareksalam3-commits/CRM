-- Phase 7: Update RLS Policies for All Tables

-- Helper function to get current user's role in a branch
CREATE OR REPLACE FUNCTION public.get_user_role_in_branch(target_branch_id uuid)
RETURNS text AS $$
BEGIN
    RETURN (
        SELECT role FROM public.user_branch_access 
        WHERE user_id = auth.uid() AND branch_id = target_branch_id AND is_active = true AND (expires_at IS NULL OR expires_at > now())
        LIMIT 1
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Clients RLS
DROP POLICY IF EXISTS "clients_select_policy" ON clients;
CREATE POLICY "clients_select_policy" ON clients FOR SELECT TO authenticated 
  USING (
    EXISTS (SELECT 1 FROM public.user_branch_access WHERE user_id = auth.uid() AND role = 'super_admin')
    OR (
        check_branch_access(branch_id) 
        AND (
            agent_id = auth.uid()
            OR agent_id IN (SELECT id FROM profiles WHERE manager_id = auth.uid())
            OR get_user_role_in_branch(branch_id) IN ('dev_manager', 'general_supervisor', 'supervisor', 'branch_manager')
        )
    )
  );

-- Policies RLS
DROP POLICY IF EXISTS "policies_select_policy" ON policies;
CREATE POLICY "policies_select_policy" ON policies FOR SELECT TO authenticated 
  USING (
    EXISTS (SELECT 1 FROM public.user_branch_access WHERE user_id = auth.uid() AND role = 'super_admin')
    OR (
        check_branch_access(branch_id)
        AND (
            agent_id = auth.uid()
            OR agent_id IN (SELECT id FROM profiles WHERE manager_id = auth.uid())
            OR get_user_role_in_branch(branch_id) IN ('dev_manager', 'general_supervisor', 'supervisor', 'branch_manager')
        )
    )
  );

-- Collections RLS
DROP POLICY IF EXISTS "collections_select_policy" ON collections;
CREATE POLICY "collections_select_policy" ON collections FOR SELECT TO authenticated 
  USING (
    EXISTS (SELECT 1 FROM public.user_branch_access WHERE user_id = auth.uid() AND role = 'super_admin')
    OR (
        check_branch_access(branch_id)
        AND (
            collected_by = auth.uid()
            OR EXISTS (SELECT 1 FROM policies WHERE id = collections.policy_id AND (agent_id = auth.uid() OR agent_id IN (SELECT id FROM profiles WHERE manager_id = auth.uid())))
            OR get_user_role_in_branch(branch_id) IN ('dev_manager', 'general_supervisor', 'supervisor', 'branch_manager')
        )
    )
  );

-- Targets RLS
DROP POLICY IF EXISTS "targets_select_policy" ON targets;
CREATE POLICY "targets_select_policy" ON targets FOR SELECT TO authenticated 
  USING (
    EXISTS (SELECT 1 FROM public.user_branch_access WHERE user_id = auth.uid() AND role = 'super_admin')
    OR (
        check_branch_access(branch_id)
        AND (
            user_id = auth.uid()
            OR user_id IN (SELECT id FROM profiles WHERE manager_id = auth.uid())
            OR get_user_role_in_branch(branch_id) IN ('dev_manager', 'general_supervisor', 'supervisor', 'branch_manager')
        )
    )
  );

-- Tasks RLS
DROP POLICY IF EXISTS "tasks_select_policy" ON tasks;
CREATE POLICY "tasks_select_policy" ON tasks FOR SELECT TO authenticated 
  USING (
    EXISTS (SELECT 1 FROM public.user_branch_access WHERE user_id = auth.uid() AND role = 'super_admin')
    OR (
        check_branch_access(branch_id)
        AND (
            assigned_to = auth.uid()
            OR created_by = auth.uid()
            OR assigned_to IN (SELECT id FROM profiles WHERE manager_id = auth.uid())
            OR get_user_role_in_branch(branch_id) IN ('dev_manager', 'general_supervisor', 'supervisor', 'branch_manager')
        )
    )
  );
