/*
# Life Insurance CRM - RLS Policies

1. Security Changes
- Add RLS policies for all tables
- Users table: all authenticated can read, only self can update
- Clients: agent can manage own clients, supervisors can see their team's
- Policies: agent can manage own, supervisors can see their team's
- Installments: linked to policy visibility
- Collections: collector can manage own, supervisors can see their team's
- Targets: user can see own, supervisors can see team's
- Activity logs: all authenticated can read
- Settings: all authenticated can read, only admin can modify

2. Notes
- Uses EXISTS for hierarchical access (manager sees subordinates)
- Admin roles have full access
*/

-- Users policies
DROP POLICY IF EXISTS "users_select_all" ON users;
CREATE POLICY "users_select_all"
ON users FOR SELECT
TO authenticated USING (true);

DROP POLICY IF EXISTS "users_insert_admin" ON users;
CREATE POLICY "users_insert_admin"
ON users FOR INSERT
TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM users u WHERE u.auth_id = auth.uid() AND u.role IN ('super_admin', 'dev_manager', 'general_supervisor'))
);

DROP POLICY IF EXISTS "users_update_self_or_admin" ON users;
CREATE POLICY "users_update_self_or_admin"
ON users FOR UPDATE
TO authenticated USING (
  id = (SELECT id FROM users WHERE auth_id = auth.uid())
  OR EXISTS (SELECT 1 FROM users u WHERE u.auth_id = auth.uid() AND u.role IN ('super_admin', 'dev_manager', 'general_supervisor'))
) WITH CHECK (
  id = (SELECT id FROM users WHERE auth_id = auth.uid())
  OR EXISTS (SELECT 1 FROM users u WHERE u.auth_id = auth.uid() AND u.role IN ('super_admin', 'dev_manager', 'general_supervisor'))
);

DROP POLICY IF EXISTS "users_delete_admin" ON users;
CREATE POLICY "users_delete_admin"
ON users FOR DELETE
TO authenticated USING (
  EXISTS (SELECT 1 FROM users u WHERE u.auth_id = auth.uid() AND u.role = 'super_admin')
);

-- Clients policies
DROP POLICY IF EXISTS "clients_select_own_or_team" ON clients;
CREATE POLICY "clients_select_own_or_team"
ON clients FOR SELECT
TO authenticated USING (
  agent_id = (SELECT id FROM users WHERE auth_id = auth.uid())
  OR EXISTS (
    SELECT 1 FROM users u
    WHERE u.auth_id = auth.uid()
    AND u.role IN ('super_admin', 'dev_manager', 'general_supervisor', 'supervisor', 'group_leader')
    AND (
      u.id = agent_id
      OR EXISTS (SELECT 1 FROM users sub WHERE sub.id = agent_id AND sub.manager_id = u.id)
      OR EXISTS (
        SELECT 1 FROM users sub
        WHERE sub.id = agent_id
        AND EXISTS (SELECT 1 FROM users mgr WHERE mgr.id = sub.manager_id AND mgr.manager_id = u.id)
      )
    )
  )
);

DROP POLICY IF EXISTS "clients_insert_own" ON clients;
CREATE POLICY "clients_insert_own"
ON clients FOR INSERT
TO authenticated WITH CHECK (
  agent_id = (SELECT id FROM users WHERE auth_id = auth.uid())
  OR EXISTS (SELECT 1 FROM users u WHERE u.auth_id = auth.uid() AND u.role IN ('super_admin', 'dev_manager', 'general_supervisor'))
);

DROP POLICY IF EXISTS "clients_update_own_or_team" ON clients;
CREATE POLICY "clients_update_own_or_team"
ON clients FOR UPDATE
TO authenticated USING (
  agent_id = (SELECT id FROM users WHERE auth_id = auth.uid())
  OR EXISTS (SELECT 1 FROM users u WHERE u.auth_id = auth.uid() AND u.role IN ('super_admin', 'dev_manager', 'general_supervisor'))
) WITH CHECK (
  agent_id = (SELECT id FROM users WHERE auth_id = auth.uid())
  OR EXISTS (SELECT 1 FROM users u WHERE u.auth_id = auth.uid() AND u.role IN ('super_admin', 'dev_manager', 'general_supervisor'))
);

DROP POLICY IF EXISTS "clients_delete_own_or_admin" ON clients;
CREATE POLICY "clients_delete_own_or_admin"
ON clients FOR DELETE
TO authenticated USING (
  agent_id = (SELECT id FROM users WHERE auth_id = auth.uid())
  OR EXISTS (SELECT 1 FROM users u WHERE u.auth_id = auth.uid() AND u.role IN ('super_admin', 'dev_manager'))
);

-- Policy types policies (public read, admin write)
DROP POLICY IF EXISTS "policy_types_select_all" ON policy_types;
CREATE POLICY "policy_types_select_all"
ON policy_types FOR SELECT
TO authenticated USING (true);

DROP POLICY IF EXISTS "policy_types_insert_admin" ON policy_types;
CREATE POLICY "policy_types_insert_admin"
ON policy_types FOR INSERT
TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM users u WHERE u.auth_id = auth.uid() AND u.role IN ('super_admin', 'dev_manager'))
);

DROP POLICY IF EXISTS "policy_types_update_admin" ON policy_types;
CREATE POLICY "policy_types_update_admin"
ON policy_types FOR UPDATE
TO authenticated USING (
  EXISTS (SELECT 1 FROM users u WHERE u.auth_id = auth.uid() AND u.role IN ('super_admin', 'dev_manager'))
) WITH CHECK (
  EXISTS (SELECT 1 FROM users u WHERE u.auth_id = auth.uid() AND u.role IN ('super_admin', 'dev_manager'))
);

DROP POLICY IF EXISTS "policy_types_delete_admin" ON policy_types;
CREATE POLICY "policy_types_delete_admin"
ON policy_types FOR DELETE
TO authenticated USING (
  EXISTS (SELECT 1 FROM users u WHERE u.auth_id = auth.uid() AND u.role IN ('super_admin', 'dev_manager'))
);

-- Policies table policies
DROP POLICY IF EXISTS "policies_select_own_or_team" ON policies;
CREATE POLICY "policies_select_own_or_team"
ON policies FOR SELECT
TO authenticated USING (
  agent_id = (SELECT id FROM users WHERE auth_id = auth.uid())
  OR EXISTS (
    SELECT 1 FROM users u
    WHERE u.auth_id = auth.uid()
    AND u.role IN ('super_admin', 'dev_manager', 'general_supervisor', 'supervisor', 'group_leader')
    AND (
      u.id = agent_id
      OR EXISTS (SELECT 1 FROM users sub WHERE sub.id = agent_id AND sub.manager_id = u.id)
      OR EXISTS (
        SELECT 1 FROM users sub
        WHERE sub.id = agent_id
        AND EXISTS (SELECT 1 FROM users mgr WHERE mgr.id = sub.manager_id AND mgr.manager_id = u.id)
      )
    )
  )
);

DROP POLICY IF EXISTS "policies_insert_own_or_admin" ON policies;
CREATE POLICY "policies_insert_own_or_admin"
ON policies FOR INSERT
TO authenticated WITH CHECK (
  agent_id = (SELECT id FROM users WHERE auth_id = auth.uid())
  OR EXISTS (SELECT 1 FROM users u WHERE u.auth_id = auth.uid() AND u.role IN ('super_admin', 'dev_manager', 'general_supervisor'))
);

DROP POLICY IF EXISTS "policies_update_own_or_admin" ON policies;
CREATE POLICY "policies_update_own_or_admin"
ON policies FOR UPDATE
TO authenticated USING (
  agent_id = (SELECT id FROM users WHERE auth_id = auth.uid())
  OR EXISTS (SELECT 1 FROM users u WHERE u.auth_id = auth.uid() AND u.role IN ('super_admin', 'dev_manager', 'general_supervisor'))
) WITH CHECK (
  agent_id = (SELECT id FROM users WHERE auth_id = auth.uid())
  OR EXISTS (SELECT 1 FROM users u WHERE u.auth_id = auth.uid() AND u.role IN ('super_admin', 'dev_manager', 'general_supervisor'))
);

DROP POLICY IF EXISTS "policies_delete_admin" ON policies;
CREATE POLICY "policies_delete_admin"
ON policies FOR DELETE
TO authenticated USING (
  EXISTS (SELECT 1 FROM users u WHERE u.auth_id = auth.uid() AND u.role IN ('super_admin', 'dev_manager'))
);

-- Installments policies (visibility through policy)
DROP POLICY IF EXISTS "installments_select_through_policy" ON installments;
CREATE POLICY "installments_select_through_policy"
ON installments FOR SELECT
TO authenticated USING (
  EXISTS (
    SELECT 1 FROM policies p
    WHERE p.id = installments.policy_id
    AND (
      p.agent_id = (SELECT id FROM users WHERE auth_id = auth.uid())
      OR EXISTS (
        SELECT 1 FROM users u
        WHERE u.auth_id = auth.uid()
        AND u.role IN ('super_admin', 'dev_manager', 'general_supervisor', 'supervisor', 'group_leader')
        AND (
          u.id = p.agent_id
          OR EXISTS (SELECT 1 FROM users sub WHERE sub.id = p.agent_id AND sub.manager_id = u.id)
          OR EXISTS (
            SELECT 1 FROM users sub
            WHERE sub.id = p.agent_id
            AND EXISTS (SELECT 1 FROM users mgr WHERE mgr.id = sub.manager_id AND mgr.manager_id = u.id)
          )
        )
      )
    )
  )
);

DROP POLICY IF EXISTS "installments_insert_through_policy" ON installments;
CREATE POLICY "installments_insert_through_policy"
ON installments FOR INSERT
TO authenticated WITH CHECK (
  EXISTS (
    SELECT 1 FROM policies p
    WHERE p.id = installments.policy_id
    AND (
      p.agent_id = (SELECT id FROM users WHERE auth_id = auth.uid())
      OR EXISTS (SELECT 1 FROM users u WHERE u.auth_id = auth.uid() AND u.role IN ('super_admin', 'dev_manager', 'general_supervisor'))
    )
  )
);

DROP POLICY IF EXISTS "installments_update_through_policy" ON installments;
CREATE POLICY "installments_update_through_policy"
ON installments FOR UPDATE
TO authenticated USING (
  EXISTS (
    SELECT 1 FROM policies p
    WHERE p.id = installments.policy_id
    AND (
      p.agent_id = (SELECT id FROM users WHERE auth_id = auth.uid())
      OR EXISTS (SELECT 1 FROM users u WHERE u.auth_id = auth.uid() AND u.role IN ('super_admin', 'dev_manager', 'general_supervisor'))
    )
  )
) WITH CHECK (
  EXISTS (
    SELECT 1 FROM policies p
    WHERE p.id = installments.policy_id
    AND (
      p.agent_id = (SELECT id FROM users WHERE auth_id = auth.uid())
      OR EXISTS (SELECT 1 FROM users u WHERE u.auth_id = auth.uid() AND u.role IN ('super_admin', 'dev_manager', 'general_supervisor'))
    )
  )
);

DROP POLICY IF EXISTS "installments_delete_admin" ON installments;
CREATE POLICY "installments_delete_admin"
ON installments FOR DELETE
TO authenticated USING (
  EXISTS (SELECT 1 FROM users u WHERE u.auth_id = auth.uid() AND u.role IN ('super_admin', 'dev_manager'))
);

-- Collections policies
DROP POLICY IF EXISTS "collections_select_own_or_team" ON collections;
CREATE POLICY "collections_select_own_or_team"
ON collections FOR SELECT
TO authenticated USING (
  collector_id = (SELECT id FROM users WHERE auth_id = auth.uid())
  OR EXISTS (
    SELECT 1 FROM users u
    WHERE u.auth_id = auth.uid()
    AND u.role IN ('super_admin', 'dev_manager', 'general_supervisor', 'supervisor', 'group_leader')
    AND (
      u.id = collector_id
      OR EXISTS (SELECT 1 FROM users sub WHERE sub.id = collector_id AND sub.manager_id = u.id)
      OR EXISTS (
        SELECT 1 FROM users sub
        WHERE sub.id = collector_id
        AND EXISTS (SELECT 1 FROM users mgr WHERE mgr.id = sub.manager_id AND mgr.manager_id = u.id)
      )
    )
  )
);

DROP POLICY IF EXISTS "collections_insert_own" ON collections;
CREATE POLICY "collections_insert_own"
ON collections FOR INSERT
TO authenticated WITH CHECK (
  collector_id = (SELECT id FROM users WHERE auth_id = auth.uid())
  OR EXISTS (SELECT 1 FROM users u WHERE u.auth_id = auth.uid() AND u.role IN ('super_admin', 'dev_manager', 'general_supervisor'))
);

DROP POLICY IF EXISTS "collections_update_own_or_admin" ON collections;
CREATE POLICY "collections_update_own_or_admin"
ON collections FOR UPDATE
TO authenticated USING (
  collector_id = (SELECT id FROM users WHERE auth_id = auth.uid())
  OR EXISTS (SELECT 1 FROM users u WHERE u.auth_id = auth.uid() AND u.role IN ('super_admin', 'dev_manager', 'general_supervisor'))
) WITH CHECK (
  collector_id = (SELECT id FROM users WHERE auth_id = auth.uid())
  OR EXISTS (SELECT 1 FROM users u WHERE u.auth_id = auth.uid() AND u.role IN ('super_admin', 'dev_manager', 'general_supervisor'))
);

DROP POLICY IF EXISTS "collections_delete_admin" ON collections;
CREATE POLICY "collections_delete_admin"
ON collections FOR DELETE
TO authenticated USING (
  EXISTS (SELECT 1 FROM users u WHERE u.auth_id = auth.uid() AND u.role IN ('super_admin', 'dev_manager'))
);

-- Targets policies
DROP POLICY IF EXISTS "targets_select_own_or_team" ON targets;
CREATE POLICY "targets_select_own_or_team"
ON targets FOR SELECT
TO authenticated USING (
  user_id = (SELECT id FROM users WHERE auth_id = auth.uid())
  OR EXISTS (
    SELECT 1 FROM users u
    WHERE u.auth_id = auth.uid()
    AND u.role IN ('super_admin', 'dev_manager', 'general_supervisor', 'supervisor', 'group_leader')
    AND (
      u.id = user_id
      OR EXISTS (SELECT 1 FROM users sub WHERE sub.id = user_id AND sub.manager_id = u.id)
      OR EXISTS (
        SELECT 1 FROM users sub
        WHERE sub.id = user_id
        AND EXISTS (SELECT 1 FROM users mgr WHERE mgr.id = sub.manager_id AND mgr.manager_id = u.id)
      )
    )
  )
);

DROP POLICY IF EXISTS "targets_insert_admin" ON targets;
CREATE POLICY "targets_insert_admin"
ON targets FOR INSERT
TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM users u WHERE u.auth_id = auth.uid() AND u.role IN ('super_admin', 'dev_manager', 'general_supervisor'))
);

DROP POLICY IF EXISTS "targets_update_admin" ON targets;
CREATE POLICY "targets_update_admin"
ON targets FOR UPDATE
TO authenticated USING (
  EXISTS (SELECT 1 FROM users u WHERE u.auth_id = auth.uid() AND u.role IN ('super_admin', 'dev_manager', 'general_supervisor'))
) WITH CHECK (
  EXISTS (SELECT 1 FROM users u WHERE u.auth_id = auth.uid() AND u.role IN ('super_admin', 'dev_manager', 'general_supervisor'))
);

DROP POLICY IF EXISTS "targets_delete_admin" ON targets;
CREATE POLICY "targets_delete_admin"
ON targets FOR DELETE
TO authenticated USING (
  EXISTS (SELECT 1 FROM users u WHERE u.auth_id = auth.uid() AND u.role IN ('super_admin', 'dev_manager'))
);

-- Monthly closings policies
DROP POLICY IF EXISTS "monthly_closings_select_all" ON monthly_closings;
CREATE POLICY "monthly_closings_select_all"
ON monthly_closings FOR SELECT
TO authenticated USING (true);

DROP POLICY IF EXISTS "monthly_closings_insert_admin" ON monthly_closings;
CREATE POLICY "monthly_closings_insert_admin"
ON monthly_closings FOR INSERT
TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM users u WHERE u.auth_id = auth.uid() AND u.role IN ('super_admin', 'dev_manager', 'general_supervisor'))
);

DROP POLICY IF EXISTS "monthly_closings_update_admin" ON monthly_closings;
CREATE POLICY "monthly_closings_update_admin"
ON monthly_closings FOR UPDATE
TO authenticated USING (
  EXISTS (SELECT 1 FROM users u WHERE u.auth_id = auth.uid() AND u.role IN ('super_admin', 'dev_manager', 'general_supervisor'))
) WITH CHECK (
  EXISTS (SELECT 1 FROM users u WHERE u.auth_id = auth.uid() AND u.role IN ('super_admin', 'dev_manager', 'general_supervisor'))
);

DROP POLICY IF EXISTS "monthly_closings_delete_admin" ON monthly_closings;
CREATE POLICY "monthly_closings_delete_admin"
ON monthly_closings FOR DELETE
TO authenticated USING (
  EXISTS (SELECT 1 FROM users u WHERE u.auth_id = auth.uid() AND u.role IN ('super_admin', 'dev_manager'))
);

-- Activity logs policies
DROP POLICY IF EXISTS "activity_logs_select_all" ON activity_logs;
CREATE POLICY "activity_logs_select_all"
ON activity_logs FOR SELECT
TO authenticated USING (true);

DROP POLICY IF EXISTS "activity_logs_insert_all" ON activity_logs;
CREATE POLICY "activity_logs_insert_all"
ON activity_logs FOR INSERT
TO authenticated WITH CHECK (true);

-- Settings policies
DROP POLICY IF EXISTS "settings_select_all" ON settings;
CREATE POLICY "settings_select_all"
ON settings FOR SELECT
TO authenticated USING (true);

DROP POLICY IF EXISTS "settings_update_admin" ON settings;
CREATE POLICY "settings_update_admin"
ON settings FOR UPDATE
TO authenticated USING (
  EXISTS (SELECT 1 FROM users u WHERE u.auth_id = auth.uid() AND u.role IN ('super_admin', 'dev_manager'))
) WITH CHECK (
  EXISTS (SELECT 1 FROM users u WHERE u.auth_id = auth.uid() AND u.role IN ('super_admin', 'dev_manager'))
);
