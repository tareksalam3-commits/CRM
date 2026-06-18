-- ================================================================
-- Insurance CRM Pro — Audit Logs & Performance Improvements
-- Migration Date: 2026-06-18
-- ================================================================

-- Ensure audit_logs table has all required columns and proper constraints
DO $$ 
BEGIN
  -- Check if entity_type exists, if not the table might be empty or in old state
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='audit_logs' AND column_name='entity_type') THEN
    -- This shouldn't happen if 20260612050353 ran, but let's be safe
    ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS entity_type text NOT NULL DEFAULT 'unknown';
  END IF;

  -- Add changes column if it doesn't exist (it was old_data/new_data before)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='audit_logs' AND column_name='changes') THEN
    ALTER TABLE audit_logs ADD COLUMN changes jsonb;
  END IF;

  -- Ensure entity_id is NOT NULL if that's the new requirement
  ALTER TABLE audit_logs ALTER COLUMN entity_id SET NOT NULL;
END $$;

-- Create indexes for audit_logs (using existing or new column names)
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);

-- Create month_closings table
CREATE TABLE IF NOT EXISTS month_closings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  month int NOT NULL CHECK (month >= 1 AND month <= 12),
  year int NOT NULL,
  closed_by uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  closed_at timestamp with time zone DEFAULT now(),
  total_premiums numeric(12,2) NOT NULL DEFAULT 0,
  total_collections numeric(12,2) NOT NULL DEFAULT 0,
  collection_rate numeric(5,2) NOT NULL DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  UNIQUE(month, year)
);

CREATE INDEX IF NOT EXISTS idx_month_closings_period ON month_closings(year, month);
CREATE INDEX IF NOT EXISTS idx_month_closings_closed_by ON month_closings(closed_by);

-- RLS for audit_logs (read-only for authorized users)
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audit_logs_select" ON audit_logs; CREATE POLICY "audit_logs_select" ON audit_logs
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR can_access_user(auth.uid(), user_id)
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('super_admin', 'dev_manager'))
  );

-- RLS for month_closings
ALTER TABLE month_closings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "month_closings_select" ON month_closings
  FOR SELECT TO authenticated
  USING (
    closed_by = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('super_admin', 'dev_manager'))
  );

CREATE POLICY "month_closings_insert" ON month_closings
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('super_admin', 'dev_manager'))
  );

-- Create system_settings table
CREATE TABLE IF NOT EXISTS system_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key varchar(255) NOT NULL UNIQUE,
  value text,
  updated_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  updated_at timestamp with time zone DEFAULT now()
);

ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "system_settings_select" ON system_settings
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "system_settings_update" ON system_settings
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

-- Performance index on frequently searched fields
CREATE INDEX IF NOT EXISTS idx_policies_agent_status ON policies(agent_id, status);
CREATE INDEX IF NOT EXISTS idx_collections_date_range ON collections(collection_date);
CREATE INDEX IF NOT EXISTS idx_installments_status_date ON installments(status, due_date);

-- Add trigger for marking installments as overdue automatically
CREATE OR REPLACE FUNCTION mark_overdue_installments()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE installments
  SET status = 'overdue', updated_at = now()
  WHERE status = 'pending'
    AND due_date < now()::date
    AND updated_at < now() - INTERVAL '1 hour';
END;
$$;

-- Function to get subordinate IDs (used in RLS)
CREATE OR REPLACE FUNCTION get_subordinate_ids(manager_id uuid)
RETURNS TABLE(id uuid)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
WITH RECURSIVE subordinates AS (
  SELECT id FROM profiles WHERE manager_id = $1
  UNION ALL
  SELECT p.id FROM profiles p
  INNER JOIN subordinates s ON p.manager_id = s.id
)
SELECT id FROM subordinates;
$$;
