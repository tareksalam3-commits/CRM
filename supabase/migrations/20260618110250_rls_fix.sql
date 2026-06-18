-- Fix RLS Policies for CRM Roles

-- Profiles
DROP POLICY IF EXISTS "profiles_select_all" ON profiles;
CREATE POLICY "profiles_select_all" ON profiles FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "profiles_update_self_or_admin" ON profiles;
CREATE POLICY "profiles_update_self_or_admin" ON profiles FOR UPDATE TO authenticated 
  USING (auth.uid() = id OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('super_admin', 'dev_manager')));

-- Clients
DROP POLICY IF EXISTS "clients_select_policy" ON clients;
CREATE POLICY "clients_select_policy" ON clients FOR SELECT TO authenticated 
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('super_admin', 'dev_manager', 'general_supervisor'))
    OR agent_id = auth.uid()
    OR agent_id IN (SELECT id FROM profiles WHERE manager_id = auth.uid())
  );

DROP POLICY IF EXISTS "clients_insert_policy" ON clients;
CREATE POLICY "clients_insert_policy" ON clients FOR INSERT TO authenticated 
  WITH CHECK (agent_id = auth.uid() OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('super_admin', 'dev_manager')));

-- Policies
DROP POLICY IF EXISTS "policies_select_policy" ON policies;
CREATE POLICY "policies_select_policy" ON policies FOR SELECT TO authenticated 
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('super_admin', 'dev_manager', 'general_supervisor'))
    OR agent_id = auth.uid()
    OR agent_id IN (SELECT id FROM profiles WHERE manager_id = auth.uid())
  );

-- Installments
DROP POLICY IF EXISTS "installments_select_policy" ON installments;
CREATE POLICY "installments_select_policy" ON installments FOR SELECT TO authenticated 
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('super_admin', 'dev_manager', 'general_supervisor'))
    OR EXISTS (SELECT 1 FROM policies WHERE id = installments.policy_id AND (agent_id = auth.uid() OR agent_id IN (SELECT id FROM profiles WHERE manager_id = auth.uid())))
  );

-- Collections
DROP POLICY IF EXISTS "collections_select_policy" ON collections;
CREATE POLICY "collections_select_policy" ON collections FOR SELECT TO authenticated 
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('super_admin', 'dev_manager', 'general_supervisor'))
    OR collected_by = auth.uid()
    OR EXISTS (SELECT 1 FROM policies WHERE id = collections.policy_id AND (agent_id = auth.uid() OR agent_id IN (SELECT id FROM profiles WHERE manager_id = auth.uid())))
  );

-- Targets
DROP POLICY IF EXISTS "targets_select_policy" ON targets;
CREATE POLICY "targets_select_policy" ON targets FOR SELECT TO authenticated 
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('super_admin', 'dev_manager', 'general_supervisor'))
    OR user_id IN (SELECT id FROM profiles WHERE manager_id = auth.uid())
  );

-- Tasks
DROP POLICY IF EXISTS "tasks_select_policy" ON tasks;
CREATE POLICY "tasks_select_policy" ON tasks FOR SELECT TO authenticated 
  USING (
    assigned_to = auth.uid()
    OR created_by = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('super_admin', 'dev_manager', 'general_supervisor'))
    OR assigned_to IN (SELECT id FROM profiles WHERE manager_id = auth.uid())
  );

-- Audit Logs
DROP POLICY IF EXISTS "audit_logs_select_policy" ON audit_logs;
CREATE POLICY "audit_logs_select_policy" ON audit_logs FOR SELECT TO authenticated 
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('super_admin', 'dev_manager')));

-- System Settings
DROP POLICY IF EXISTS "system_settings_select_policy" ON system_settings;
CREATE POLICY "system_settings_select_policy" ON system_settings FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "system_settings_modify_policy" ON system_settings;
CREATE POLICY "system_settings_modify_policy" ON system_settings FOR ALL TO authenticated 
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'));

