-- ================================================================
-- Insurance CRM Pro — Fix: Missing Functions, Constraints, Indexes
-- 2026-06-16
-- ================================================================

-- FIX #SQL1: mark_overdue_installments — WAS MISSING FROM DB
-- Called by AuthContext on every login → was failing silently (RPC 404)
CREATE OR REPLACE FUNCTION mark_overdue_installments()
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE installments SET status = 'overdue', updated_at = now()
  WHERE status = 'pending' AND due_date < CURRENT_DATE;
$$;
GRANT EXECUTE ON FUNCTION mark_overdue_installments() TO authenticated;

-- FIX #SQL2: No duplicate installment numbers per policy
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'installments_policy_num_unique') THEN
    ALTER TABLE installments ADD CONSTRAINT installments_policy_num_unique UNIQUE (policy_id, installment_number);
  END IF;
END $$;

-- FIX #SQL3: No double-collection of same installment
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'collections_installment_id_key') THEN
    ALTER TABLE collections ADD CONSTRAINT collections_installment_id_key UNIQUE (installment_id);
  END IF;
END $$;

-- FIX #SQL4: Ensure national_id exists on clients table before creating index
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'clients' AND column_name = 'national_id') THEN
    ALTER TABLE clients ADD COLUMN national_id text;
  END IF;
END $$;

-- FIX #SQL5: Performance indexes
CREATE INDEX IF NOT EXISTS idx_notifications_unread   ON notifications (user_id, is_read) WHERE is_read = false;
CREATE INDEX IF NOT EXISTS idx_notifications_read     ON notifications (user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created     ON audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity      ON audit_logs (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_date             ON audit_logs (created_at);
CREATE INDEX IF NOT EXISTS idx_installments_pending   ON installments (status, due_date) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_installments_status    ON installments (status);
CREATE INDEX IF NOT EXISTS idx_policies_agent         ON policies (agent_id, status);
CREATE INDEX IF NOT EXISTS idx_policies_status        ON policies (status);
CREATE INDEX IF NOT EXISTS idx_clients_agent          ON clients (agent_id);
CREATE INDEX IF NOT EXISTS idx_clients_national_id   ON clients (national_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status           ON tasks (status);

-- FIX #SQL6: Ensure RLS on all tables
ALTER TABLE profiles       ENABLE ROW LEVEL SECURITY;

-- FIX #SQL7: Advanced RLS Policies for tasks (requires created_by column)
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

DROP POLICY IF EXISTS "tasks_delete" ON tasks;
CREATE POLICY "tasks_delete" ON tasks FOR DELETE
  TO authenticated
  USING (created_by = auth.uid() OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('super_admin', 'dev_manager')));
ALTER TABLE clients        ENABLE ROW LEVEL SECURITY;
ALTER TABLE policies       ENABLE ROW LEVEL SECURITY;
ALTER TABLE installments   ENABLE ROW LEVEL SECURITY;
ALTER TABLE collections    ENABLE ROW LEVEL SECURITY;
ALTER TABLE targets        ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks          ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications  ENABLE ROW LEVEL SECURITY;
ALTER TABLE month_closings ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs     ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;
