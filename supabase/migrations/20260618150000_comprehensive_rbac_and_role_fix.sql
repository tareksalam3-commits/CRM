-- ================================================================
-- Insurance CRM Pro — Comprehensive RBAC & Role Fix
-- Migration Date: 2026-06-18
-- ================================================================

-- 1. Update Profiles Table Roles
-- The user requested: Super Admin, Branch Manager, Development Manager, General Supervisor, Supervisor, Group Leader, Agent.
-- We will map these to consistent internal keys:
-- super_admin, branch_manager, dev_manager, general_supervisor, supervisor, team_leader (Group Leader), agent.

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN (
    'super_admin',
    'branch_manager',
    'dev_manager',
    'general_supervisor',
    'supervisor',
    'team_leader',
    'agent'
  ));

-- 2. Update Helper Functions for Hierarchy
-- get_subordinate_ids: recursively finds all subordinates
CREATE OR REPLACE FUNCTION get_subordinate_ids(manager_uuid uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  WITH RECURSIVE subordinates AS (
    SELECT id FROM profiles WHERE manager_id = manager_uuid
    UNION ALL
    SELECT p.id FROM profiles p
    INNER JOIN subordinates s ON p.manager_id = s.id
  )
  SELECT id FROM subordinates;
$$;

-- can_access_user: core logic for RLS
CREATE OR REPLACE FUNCTION can_access_user(accessor_uuid uuid, target_uuid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    accessor_uuid = target_uuid -- Self access
    OR target_uuid IN (SELECT get_subordinate_ids(accessor_uuid)) -- Manager access
    OR EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = accessor_uuid 
      AND role IN ('super_admin', 'branch_manager', 'dev_manager') -- Admin/Top Manager access
    );
$$;

-- 3. Standardize RLS Policies Across All Tables

-- Profiles
DROP POLICY IF EXISTS "profiles_select" ON profiles;
CREATE POLICY "profiles_select" ON profiles FOR SELECT
  TO authenticated
  USING (is_active = true OR can_access_user(auth.uid(), id));

DROP POLICY IF EXISTS "profiles_insert" ON profiles;
CREATE POLICY "profiles_insert" ON profiles FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = id
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('super_admin', 'branch_manager', 'dev_manager', 'general_supervisor', 'supervisor', 'team_leader')
    )
  );

DROP POLICY IF EXISTS "profiles_update" ON profiles;
CREATE POLICY "profiles_update" ON profiles FOR UPDATE
  TO authenticated
  USING (can_access_user(auth.uid(), id))
  WITH CHECK (can_access_user(auth.uid(), id));

-- Clients
DROP POLICY IF EXISTS "clients_select" ON clients;
CREATE POLICY "clients_select" ON clients FOR SELECT
  TO authenticated
  USING (can_access_user(auth.uid(), agent_id));

DROP POLICY IF EXISTS "clients_insert" ON clients;
CREATE POLICY "clients_insert" ON clients FOR INSERT
  TO authenticated
  WITH CHECK (can_access_user(auth.uid(), agent_id));

DROP POLICY IF EXISTS "clients_update" ON clients;
CREATE POLICY "clients_update" ON clients FOR UPDATE
  TO authenticated
  USING (can_access_user(auth.uid(), agent_id))
  WITH CHECK (can_access_user(auth.uid(), agent_id));

DROP POLICY IF EXISTS "clients_delete" ON clients;
CREATE POLICY "clients_delete" ON clients FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
      AND role IN ('super_admin', 'branch_manager', 'dev_manager')
    )
    OR can_access_user(auth.uid(), agent_id)
  );

-- Policies
DROP POLICY IF EXISTS "policies_select" ON policies;
CREATE POLICY "policies_select" ON policies FOR SELECT
  TO authenticated
  USING (can_access_user(auth.uid(), agent_id));

DROP POLICY IF EXISTS "policies_insert" ON policies;
CREATE POLICY "policies_insert" ON policies FOR INSERT
  TO authenticated
  WITH CHECK (can_access_user(auth.uid(), agent_id));

DROP POLICY IF EXISTS "policies_update" ON policies;
CREATE POLICY "policies_update" ON policies FOR UPDATE
  TO authenticated
  USING (can_access_user(auth.uid(), agent_id))
  WITH CHECK (can_access_user(auth.uid(), agent_id));

-- Installments & Collections (Cascaded from Policy access)
DROP POLICY IF EXISTS "installments_select" ON installments;
CREATE POLICY "installments_select" ON installments FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM policies WHERE policies.id = policy_id AND can_access_user(auth.uid(), policies.agent_id)));

DROP POLICY IF EXISTS "collections_select" ON collections;
CREATE POLICY "collections_select" ON collections FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM policies WHERE policies.id = policy_id AND can_access_user(auth.uid(), policies.agent_id)));

-- Tasks
DROP POLICY IF EXISTS "tasks_select" ON tasks;
CREATE POLICY "tasks_select" ON tasks FOR SELECT
  TO authenticated
  USING (assigned_to = auth.uid() OR created_by = auth.uid() OR can_access_user(auth.uid(), assigned_to));

DROP POLICY IF EXISTS "tasks_insert" ON tasks;
CREATE POLICY "tasks_insert" ON tasks FOR INSERT
  TO authenticated
  WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS "tasks_update" ON tasks;
CREATE POLICY "tasks_update" ON tasks FOR UPDATE
  TO authenticated
  USING (assigned_to = auth.uid() OR created_by = auth.uid() OR can_access_user(auth.uid(), assigned_to))
  WITH CHECK (assigned_to = auth.uid() OR created_by = auth.uid() OR can_access_user(auth.uid(), assigned_to));

-- Audit Logs (Restricted)
DROP POLICY IF EXISTS "audit_logs_select" ON audit_logs;
CREATE POLICY "audit_logs_select" ON audit_logs FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
      AND role IN ('super_admin', 'branch_manager', 'dev_manager')
    )
  );

-- Month Closings
DROP POLICY IF EXISTS "month_closings_select" ON month_closings;
CREATE POLICY "month_closings_select" ON month_closings FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "month_closings_insert" ON month_closings;
CREATE POLICY "month_closings_insert" ON month_closings FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
      AND role IN ('super_admin', 'branch_manager', 'dev_manager')
    )
  );

DROP POLICY IF EXISTS "month_closings_update" ON month_closings;
CREATE POLICY "month_closings_update" ON month_closings FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
      AND role IN ('super_admin', 'branch_manager', 'dev_manager')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
      AND role IN ('super_admin', 'branch_manager', 'dev_manager')
    )
  );

-- System Settings (Super Admin Only)
DROP POLICY IF EXISTS "system_settings_update" ON system_settings;
CREATE POLICY "system_settings_update" ON system_settings FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'));
