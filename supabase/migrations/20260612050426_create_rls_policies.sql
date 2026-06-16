/*
# Insurance CRM Pro - Helper Functions and RLS Policies

Adds hierarchical access control functions and RLS policies for all tables.
- get_subordinate_ids: recursively finds all subordinates of a user
- can_access_user: checks if one user can access another's data
- All tables get SELECT/INSERT/UPDATE/DELETE policies
*/

-- Helper function to get all subordinate user IDs recursively
CREATE OR REPLACE FUNCTION get_subordinate_ids(manager_uuid uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  WITH RECURSIVE subordinates AS (
    SELECT id FROM profiles WHERE manager_id = manager_uuid AND is_active = true
    UNION ALL
    SELECT p.id FROM profiles p
    INNER JOIN subordinates s ON p.manager_id = s.id
    WHERE p.is_active = true
  )
  SELECT id FROM subordinates;
$$;

-- Helper function to check if user can access target user's data
CREATE OR REPLACE FUNCTION can_access_user(accessor_uuid uuid, target_uuid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT 
    accessor_uuid = target_uuid
    OR target_uuid IN (SELECT get_subordinate_ids(accessor_uuid))
    OR EXISTS (SELECT 1 FROM profiles WHERE id = accessor_uuid AND role = 'super_admin');
$$;

-- RLS Policies for profiles
-- BUG FIX: agents need to see all active profiles for dropdowns (agent picker, manager picker).
-- We allow SELECT on all active profiles; sensitive actions (UPDATE/DELETE) remain restricted.
DROP POLICY IF EXISTS "profiles_select" ON profiles;
CREATE POLICY "profiles_select" ON profiles FOR SELECT
  TO authenticated
  USING (is_active = true OR can_access_user(auth.uid(), id));

DROP POLICY IF EXISTS "profiles_insert" ON profiles;
CREATE POLICY "profiles_insert" ON profiles FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('super_admin', 'dev_manager', 'general_supervisor', 'supervisor', 'team_leader'))
    OR auth.uid() = id
  );

DROP POLICY IF EXISTS "profiles_update" ON profiles;
CREATE POLICY "profiles_update" ON profiles FOR UPDATE
  TO authenticated
  USING (can_access_user(auth.uid(), id))
  WITH CHECK (can_access_user(auth.uid(), id));

DROP POLICY IF EXISTS "profiles_delete" ON profiles;
CREATE POLICY "profiles_delete" ON profiles FOR DELETE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'));

-- RLS Policies for clients
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
  USING (can_access_user(auth.uid(), agent_id));

-- RLS Policies for policies
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

DROP POLICY IF EXISTS "policies_delete" ON policies;
CREATE POLICY "policies_delete" ON policies FOR DELETE
  TO authenticated
  USING (can_access_user(auth.uid(), agent_id));

-- RLS Policies for installments
DROP POLICY IF EXISTS "installments_select" ON installments;
CREATE POLICY "installments_select" ON installments FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM policies WHERE policies.id = policy_id AND can_access_user(auth.uid(), policies.agent_id)));

DROP POLICY IF EXISTS "installments_insert" ON installments;
CREATE POLICY "installments_insert" ON installments FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM policies WHERE policies.id = policy_id AND can_access_user(auth.uid(), policies.agent_id)));

DROP POLICY IF EXISTS "installments_update" ON installments;
CREATE POLICY "installments_update" ON installments FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM policies WHERE policies.id = policy_id AND can_access_user(auth.uid(), policies.agent_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM policies WHERE policies.id = policy_id AND can_access_user(auth.uid(), policies.agent_id)));

DROP POLICY IF EXISTS "installments_delete" ON installments;
CREATE POLICY "installments_delete" ON installments FOR DELETE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM policies WHERE policies.id = policy_id AND can_access_user(auth.uid(), policies.agent_id)));

-- RLS Policies for collections
DROP POLICY IF EXISTS "collections_select" ON collections;
CREATE POLICY "collections_select" ON collections FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM policies WHERE policies.id = policy_id AND can_access_user(auth.uid(), policies.agent_id)));

DROP POLICY IF EXISTS "collections_insert" ON collections;
CREATE POLICY "collections_insert" ON collections FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM policies WHERE policies.id = policy_id AND can_access_user(auth.uid(), policies.agent_id)));

DROP POLICY IF EXISTS "collections_update" ON collections;
CREATE POLICY "collections_update" ON collections FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM policies WHERE policies.id = policy_id AND can_access_user(auth.uid(), policies.agent_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM policies WHERE policies.id = policy_id AND can_access_user(auth.uid(), policies.agent_id)));

DROP POLICY IF EXISTS "collections_delete" ON collections;
CREATE POLICY "collections_delete" ON collections FOR DELETE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM policies WHERE policies.id = policy_id AND can_access_user(auth.uid(), policies.agent_id)));

-- RLS Policies for targets
DROP POLICY IF EXISTS "targets_select" ON targets;
CREATE POLICY "targets_select" ON targets FOR SELECT
  TO authenticated
  USING (can_access_user(auth.uid(), user_id));

DROP POLICY IF EXISTS "targets_insert" ON targets;
CREATE POLICY "targets_insert" ON targets FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('super_admin', 'dev_manager', 'general_supervisor', 'supervisor', 'team_leader'))
  );

DROP POLICY IF EXISTS "targets_update" ON targets;
CREATE POLICY "targets_update" ON targets FOR UPDATE
  TO authenticated
  USING (can_access_user(auth.uid(), user_id))
  WITH CHECK (can_access_user(auth.uid(), user_id));

DROP POLICY IF EXISTS "targets_delete" ON targets;
CREATE POLICY "targets_delete" ON targets FOR DELETE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('super_admin', 'dev_manager')));

-- RLS Policies for tasks (Simplified to avoid missing columns in preview)
DROP POLICY IF EXISTS "tasks_select" ON tasks;
CREATE POLICY "tasks_select" ON tasks FOR SELECT
  TO authenticated
  USING (assigned_to = auth.uid() OR can_access_user(auth.uid(), assigned_to));

DROP POLICY IF EXISTS "tasks_insert" ON tasks;
CREATE POLICY "tasks_insert" ON tasks FOR INSERT
  TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "tasks_update" ON tasks;
CREATE POLICY "tasks_update" ON tasks FOR UPDATE
  TO authenticated
  USING (assigned_to = auth.uid() OR can_access_user(auth.uid(), assigned_to))
  WITH CHECK (assigned_to = auth.uid() OR can_access_user(auth.uid(), assigned_to));

DROP POLICY IF EXISTS "tasks_delete" ON tasks;
CREATE POLICY "tasks_delete" ON tasks FOR DELETE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('super_admin', 'dev_manager')));

-- RLS Policies for notifications
DROP POLICY IF EXISTS "notifications_select" ON notifications;
CREATE POLICY "notifications_select" ON notifications FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "notifications_insert" ON notifications;
CREATE POLICY "notifications_insert" ON notifications FOR INSERT
  TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "notifications_update" ON notifications;
CREATE POLICY "notifications_update" ON notifications FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "notifications_delete" ON notifications;
CREATE POLICY "notifications_delete" ON notifications FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- RLS Policies for month_closings
DROP POLICY IF EXISTS "month_closings_select" ON month_closings;
CREATE POLICY "month_closings_select" ON month_closings FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "month_closings_insert" ON month_closings;
CREATE POLICY "month_closings_insert" ON month_closings FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('super_admin', 'dev_manager')));

DROP POLICY IF EXISTS "month_closings_update" ON month_closings;
CREATE POLICY "month_closings_update" ON month_closings FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('super_admin', 'dev_manager')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('super_admin', 'dev_manager')));

DROP POLICY IF EXISTS "month_closings_delete" ON month_closings;
CREATE POLICY "month_closings_delete" ON month_closings FOR DELETE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'));

-- RLS Policies for audit_logs
DROP POLICY IF EXISTS "audit_logs_select" ON audit_logs;
CREATE POLICY "audit_logs_select" ON audit_logs FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('super_admin', 'dev_manager'))
    OR user_id = auth.uid()
  );

DROP POLICY IF EXISTS "audit_logs_insert" ON audit_logs;
CREATE POLICY "audit_logs_insert" ON audit_logs FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "audit_logs_update" ON audit_logs;
CREATE POLICY "audit_logs_update" ON audit_logs FOR UPDATE
  TO authenticated
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS "audit_logs_delete" ON audit_logs;
CREATE POLICY "audit_logs_delete" ON audit_logs FOR DELETE
  TO authenticated
  USING (false);

-- RLS Policies for system_settings
DROP POLICY IF EXISTS "system_settings_select" ON system_settings;
CREATE POLICY "system_settings_select" ON system_settings FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "system_settings_insert" ON system_settings;
CREATE POLICY "system_settings_insert" ON system_settings FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'));

DROP POLICY IF EXISTS "system_settings_update" ON system_settings;
CREATE POLICY "system_settings_update" ON system_settings FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'));

DROP POLICY IF EXISTS "system_settings_delete" ON system_settings;
CREATE POLICY "system_settings_delete" ON system_settings FOR DELETE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'));

-- Insert default system settings
INSERT INTO system_settings (key, value) VALUES
  ('company_name', '"Insurance CRM Pro"'::jsonb),
  ('insurance_products', '["حياة فردي", "حياة جماعي", "تكافل", "استثمار", "حوادث شخصية", "تأمين صحي"]'::jsonb),
  ('insurance_companies', '["شركة مصر لتأمينات الحياة", "أليانز", "أكسا", "المصرية للتأمين التكافلي", "MetLife"]'::jsonb)
ON CONFLICT (key) DO NOTHING;
