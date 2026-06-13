-- ================================================================
-- Insurance CRM Pro - Upgrade Migration
-- Renames roles: sales_manager -> dev_manager, group_leader -> team_leader
-- Adds org-chart helpers & updated RLS policies
-- ================================================================

-- 1. Update role CHECK constraint on profiles
-- Drop old constraint, add new one
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('super_admin','dev_manager','general_supervisor','supervisor','team_leader','agent'));

-- 2. Migrate existing data: rename old role values
UPDATE profiles SET role = 'dev_manager'   WHERE role = 'sales_manager';
UPDATE profiles SET role = 'team_leader'   WHERE role = 'group_leader';

-- 3. Update targets RLS role list (delete & recreate policies)
DROP POLICY IF EXISTS "targets_insert" ON targets;
CREATE POLICY "targets_insert" ON targets FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role IN ('super_admin','dev_manager','general_supervisor','supervisor','team_leader')
    )
  );

DROP POLICY IF EXISTS "targets_delete" ON targets;
CREATE POLICY "targets_delete" ON targets FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role IN ('super_admin','dev_manager')
    )
  );

-- 4. Update month_closings policies
DROP POLICY IF EXISTS "month_closings_insert" ON month_closings;
CREATE POLICY "month_closings_insert" ON month_closings FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('super_admin','dev_manager'))
  );

DROP POLICY IF EXISTS "month_closings_update" ON month_closings;
CREATE POLICY "month_closings_update" ON month_closings FOR UPDATE
  TO authenticated
  USING   (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('super_admin','dev_manager')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('super_admin','dev_manager')));

-- 5. Update audit_logs policy
DROP POLICY IF EXISTS "audit_logs_select" ON audit_logs;
CREATE POLICY "audit_logs_select" ON audit_logs FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('super_admin','dev_manager'))
  );

-- 6. Profiles insert: allow managers to create users below them
DROP POLICY IF EXISTS "profiles_insert" ON profiles;
CREATE POLICY "profiles_insert" ON profiles FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = id
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role IN ('super_admin','dev_manager','general_supervisor','supervisor','team_leader')
    )
  );

-- 7. Update system_settings insert/update/delete (super_admin only)
-- (These are already correct in previous migration, no change needed)

-- 8. Rebuild get_subordinate_ids to include inactive users for admin viewing
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

-- 9. Add helper: get all manager ids in chain above a user
CREATE OR REPLACE FUNCTION get_manager_chain(user_uuid uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  WITH RECURSIVE chain AS (
    SELECT manager_id AS id FROM profiles WHERE id = user_uuid AND manager_id IS NOT NULL
    UNION ALL
    SELECT p.manager_id FROM profiles p
    INNER JOIN chain c ON p.id = c.id
    WHERE p.manager_id IS NOT NULL
  )
  SELECT id FROM chain WHERE id IS NOT NULL;
$$;

-- 10. Update can_access_user to use new role names
CREATE OR REPLACE FUNCTION can_access_user(accessor_uuid uuid, target_uuid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    accessor_uuid = target_uuid
    OR target_uuid IN (SELECT get_subordinate_ids(accessor_uuid))
    OR EXISTS (SELECT 1 FROM profiles WHERE id = accessor_uuid AND role = 'super_admin')
    OR EXISTS (SELECT 1 FROM profiles WHERE id = accessor_uuid AND role = 'dev_manager');
$$;

-- 11. Refresh mark_overdue_installments (unchanged but safe to re-run)
CREATE OR REPLACE FUNCTION mark_overdue_installments()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE installments
  SET status = 'overdue', updated_at = now()
  WHERE status = 'pending'
    AND due_date < CURRENT_DATE;
$$;
