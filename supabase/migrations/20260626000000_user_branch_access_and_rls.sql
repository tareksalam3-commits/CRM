-- Phase 3: Multi-Branch Access and RLS Policies Update

-- 1. Create user_branch_access table
CREATE TABLE IF NOT EXISTS public.user_branch_access (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
    created_at timestamptz DEFAULT now(),
    UNIQUE(user_id, branch_id)
);

-- 2. Enable RLS on user_branch_access
ALTER TABLE public.user_branch_access ENABLE ROW LEVEL SECURITY;

-- 3. RLS for user_branch_access
DROP POLICY IF EXISTS "user_branch_access_select" ON user_branch_access;
CREATE POLICY "user_branch_access_select" ON user_branch_access FOR SELECT TO authenticated 
    USING (user_id = auth.uid() OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('super_admin', 'dev_manager')));

DROP POLICY IF EXISTS "user_branch_access_modify" ON user_branch_access;
CREATE POLICY "user_branch_access_modify" ON user_branch_access FOR ALL TO authenticated 
    USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('super_admin', 'dev_manager')));

-- 4. Update RLS Policies for all tables to use user_branch_access

-- Helper function to check branch access
CREATE OR REPLACE FUNCTION public.check_branch_access(target_branch_id uuid)
RETURNS boolean AS $$
BEGIN
    -- Super admin and Dev manager see everything
    IF EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('super_admin')) THEN
        RETURN true;
    END IF;

    -- Check if user has access to the specific branch
    RETURN EXISTS (
        SELECT 1 FROM user_branch_access 
        WHERE user_id = auth.uid() AND branch_id = target_branch_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Clients RLS
DROP POLICY IF EXISTS "clients_select_policy" ON clients;
CREATE POLICY "clients_select_policy" ON clients FOR SELECT TO authenticated 
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
    OR (
        check_branch_access(branch_id) 
        AND (
            agent_id = auth.uid()
            OR agent_id IN (SELECT id FROM profiles WHERE manager_id = auth.uid())
            OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('dev_manager', 'general_supervisor', 'supervisor'))
        )
    )
  );

-- Policies RLS
DROP POLICY IF EXISTS "policies_select_policy" ON policies;
CREATE POLICY "policies_select_policy" ON policies FOR SELECT TO authenticated 
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
    OR (
        check_branch_access(branch_id)
        AND (
            agent_id = auth.uid()
            OR agent_id IN (SELECT id FROM profiles WHERE manager_id = auth.uid())
            OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('dev_manager', 'general_supervisor', 'supervisor'))
        )
    )
  );

-- Collections RLS
DROP POLICY IF EXISTS "collections_select_policy" ON collections;
CREATE POLICY "collections_select_policy" ON collections FOR SELECT TO authenticated 
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
    OR (
        check_branch_access(branch_id)
        AND (
            collected_by = auth.uid()
            OR EXISTS (SELECT 1 FROM policies WHERE id = collections.policy_id AND (agent_id = auth.uid() OR agent_id IN (SELECT id FROM profiles WHERE manager_id = auth.uid())))
            OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('dev_manager', 'general_supervisor', 'supervisor'))
        )
    )
  );

-- Targets RLS
DROP POLICY IF EXISTS "targets_select_policy" ON targets;
CREATE POLICY "targets_select_policy" ON targets FOR SELECT TO authenticated 
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
    OR (
        check_branch_access(branch_id)
        AND (
            user_id = auth.uid()
            OR user_id IN (SELECT id FROM profiles WHERE manager_id = auth.uid())
            OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('dev_manager', 'general_supervisor', 'supervisor'))
        )
    )
  );

-- Tasks RLS
DROP POLICY IF EXISTS "tasks_select_policy" ON tasks;
CREATE POLICY "tasks_select_policy" ON tasks FOR SELECT TO authenticated 
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
    OR (
        check_branch_access(branch_id)
        AND (
            assigned_to = auth.uid()
            OR created_by = auth.uid()
            OR assigned_to IN (SELECT id FROM profiles WHERE manager_id = auth.uid())
            OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('dev_manager', 'general_supervisor', 'supervisor'))
        )
    )
  );
