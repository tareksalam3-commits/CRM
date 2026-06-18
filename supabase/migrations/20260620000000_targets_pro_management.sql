-- ================================================================
-- Insurance CRM Pro - Professional Target Management Migration
-- Adds target_history table, improves targets table, and updates RLS
-- ================================================================

-- 1. Create target_history table if it doesn't exist
CREATE TABLE IF NOT EXISTS target_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_id uuid REFERENCES targets(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id),
  old_amount numeric(12,2),
  new_amount numeric(12,2) NOT NULL,
  changed_by uuid NOT NULL REFERENCES profiles(id),
  change_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_target_history_target ON target_history(target_id);
CREATE INDEX IF NOT EXISTS idx_target_history_user ON target_history(user_id);

-- 3. Enable RLS on target_history
ALTER TABLE target_history ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies for target_history
DROP POLICY IF EXISTS "target_history_select" ON target_history;
CREATE POLICY "target_history_select" ON target_history FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
      AND role IN ('super_admin', 'dev_manager', 'general_supervisor', 'supervisor', 'branch_manager', 'team_leader')
    )
    OR user_id = auth.uid()
  );

DROP POLICY IF EXISTS "target_history_insert" ON target_history;
CREATE POLICY "target_history_insert" ON target_history FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
      AND role IN ('super_admin', 'dev_manager', 'general_supervisor', 'supervisor', 'branch_manager', 'team_leader')
    )
  );

-- 5. Update targets table unique constraint to ensure no duplicates for same month/user
-- The existing constraint is: UNIQUE(user_id, period_type, year, period_number)
-- We will keep it as it's already correct.

-- 6. Add trigger for target history
CREATE OR REPLACE FUNCTION log_target_change()
RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'UPDATE') THEN
    IF (OLD.target_amount <> NEW.target_amount) THEN
      INSERT INTO target_history (target_id, user_id, old_amount, new_amount, changed_by)
      VALUES (NEW.id, NEW.user_id, OLD.target_amount, NEW.target_amount, auth.uid());
    END IF;
  ELSIF (TG_OP = 'INSERT') THEN
    INSERT INTO target_history (target_id, user_id, old_amount, new_amount, changed_by)
    VALUES (NEW.id, NEW.user_id, NULL, NEW.target_amount, auth.uid());
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_log_target_change ON targets;
CREATE TRIGGER trg_log_target_change
  AFTER INSERT OR UPDATE ON targets
  FOR EACH ROW EXECUTE FUNCTION log_target_change();

-- 7. Ensure RLS for targets is up to date for branch_manager
DROP POLICY IF EXISTS "targets_select" ON targets;
CREATE POLICY "targets_select" ON targets FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
      AND (
        role IN ('super_admin', 'dev_manager')
        OR (role IN ('general_supervisor', 'supervisor', 'branch_manager', 'team_leader') AND can_access_user(auth.uid(), targets.user_id))
      )
    )
  );

DROP POLICY IF EXISTS "targets_insert" ON targets;
CREATE POLICY "targets_insert" ON targets FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
      AND role IN ('super_admin', 'dev_manager', 'general_supervisor', 'supervisor', 'branch_manager', 'team_leader')
    )
  );

DROP POLICY IF EXISTS "targets_update" ON targets;
CREATE POLICY "targets_update" ON targets FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
      AND role IN ('super_admin', 'dev_manager', 'general_supervisor', 'supervisor', 'branch_manager', 'team_leader')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
      AND role IN ('super_admin', 'dev_manager', 'general_supervisor', 'supervisor', 'branch_manager', 'team_leader')
    )
  );

DROP POLICY IF EXISTS "targets_delete" ON targets;
CREATE POLICY "targets_delete" ON targets FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
      AND role IN ('super_admin', 'dev_manager')
    )
  );
