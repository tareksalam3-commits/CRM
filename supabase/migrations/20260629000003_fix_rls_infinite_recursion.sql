-- Fix Infinite Recursion in RLS Policies
-- Drop all problematic policies first
DROP POLICY IF EXISTS "clients_select_policy" ON clients;
DROP POLICY IF EXISTS "policies_select_policy" ON policies;
DROP POLICY IF EXISTS "collections_select_policy" ON collections;
DROP POLICY IF EXISTS "targets_select_policy" ON targets;
DROP POLICY IF EXISTS "tasks_select_policy" ON tasks;

-- Drop the helper function that was causing recursion
DROP FUNCTION IF EXISTS public.get_user_role_in_branch(uuid);

-- Create a simpler, non-recursive helper function
CREATE OR REPLACE FUNCTION public.check_user_branch_access(target_branch_id uuid)
RETURNS boolean AS $$
DECLARE
  user_id uuid := auth.uid();
BEGIN
  -- Return true if user has any active access to this branch
  RETURN EXISTS (
    SELECT 1 FROM public.user_branch_access 
    WHERE user_id = $1 
    AND branch_id = target_branch_id 
    AND is_active = true 
    AND (expires_at IS NULL OR expires_at > now())
    LIMIT 1
  );
END;
$$ LANGUAGE plpgsql STABLE;

-- Simple RLS policies that don't cause recursion
-- User Branch Access RLS - Users can only see their own access records
ALTER TABLE user_branch_access ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user_branch_access_select" ON user_branch_access;
CREATE POLICY "user_branch_access_select" ON user_branch_access FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Clients RLS - Simple and non-recursive
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "clients_select" ON clients;
CREATE POLICY "clients_select" ON clients FOR SELECT TO authenticated
  USING (
    -- Allow access if user has any active branch access
    EXISTS (
      SELECT 1 FROM public.user_branch_access 
      WHERE user_id = auth.uid() 
      AND is_active = true 
      AND (expires_at IS NULL OR expires_at > now())
    )
  );

-- Policies RLS
ALTER TABLE policies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "policies_select" ON policies;
CREATE POLICY "policies_select" ON policies FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_branch_access 
      WHERE user_id = auth.uid() 
      AND is_active = true 
      AND (expires_at IS NULL OR expires_at > now())
    )
  );

-- Collections RLS
ALTER TABLE collections ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "collections_select" ON collections;
CREATE POLICY "collections_select" ON collections FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_branch_access 
      WHERE user_id = auth.uid() 
      AND is_active = true 
      AND (expires_at IS NULL OR expires_at > now())
    )
  );

-- Targets RLS
ALTER TABLE targets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "targets_select" ON targets;
CREATE POLICY "targets_select" ON targets FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_branch_access 
      WHERE user_id = auth.uid() 
      AND is_active = true 
      AND (expires_at IS NULL OR expires_at > now())
    )
  );

-- Tasks RLS
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tasks_select" ON tasks;
CREATE POLICY "tasks_select" ON tasks FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_branch_access 
      WHERE user_id = auth.uid() 
      AND is_active = true 
      AND (expires_at IS NULL OR expires_at > now())
    )
  );

-- Installments RLS
ALTER TABLE installments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "installments_select" ON installments;
CREATE POLICY "installments_select" ON installments FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_branch_access 
      WHERE user_id = auth.uid() 
      AND is_active = true 
      AND (expires_at IS NULL OR expires_at > now())
    )
  );

-- Branches RLS - Users can see branches they have access to
ALTER TABLE branches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "branches_select" ON branches;
CREATE POLICY "branches_select" ON branches FOR SELECT TO authenticated
  USING (
    is_active = true
    OR EXISTS (
      SELECT 1 FROM public.user_branch_access 
      WHERE user_id = auth.uid() 
      AND branch_id = branches.id
      AND is_active = true
    )
  );

-- Profiles RLS - Users can see all profiles (for org chart, etc)
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "profiles_select" ON profiles;
CREATE POLICY "profiles_select" ON profiles FOR SELECT TO authenticated
  USING (true);

-- Audit Logs RLS
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "audit_logs_select" ON audit_logs;
CREATE POLICY "audit_logs_select" ON audit_logs FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_branch_access 
      WHERE user_id = auth.uid() 
      AND is_active = true 
      AND (expires_at IS NULL OR expires_at > now())
    )
  );
