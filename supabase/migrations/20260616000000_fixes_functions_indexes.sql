-- ================================================================
-- Insurance CRM Pro — Fix: Missing Functions, Constraints, Indexes
-- 2026-06-16
-- ================================================================

-- FIX #SQL1: Removed duplicate mark_overdue_installments function from top of file

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
-- Indexes moved to final migration file to ensure safe creation after all columns are added

-- FIX #SQL6: Ensure RLS on all tables
ALTER TABLE profiles       ENABLE ROW LEVEL SECURITY;

-- FIX #SQL8: mark_overdue_installments function moved to safe block below

-- FIX #SQL7: Advanced RLS Policies for tasks moved to safe block below
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

-- FIX #SQL9: Safe creation of performance indexes
DO $$ BEGIN
  -- Notifications
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'notifications' AND column_name = 'is_read') THEN
    CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications (user_id, is_read) WHERE is_read = false;
    CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications (user_id, is_read);
  END IF;

  -- Audit Logs
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'audit_logs' AND column_name = 'created_at') THEN
    CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs (created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_audit_date ON audit_logs (created_at);
  END IF;

  -- Installments
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'installments' AND column_name = 'status') THEN
    CREATE INDEX IF NOT EXISTS idx_installments_pending ON installments (status, due_date) WHERE status = 'pending';
    CREATE INDEX IF NOT EXISTS idx_installments_status ON installments (status);
  END IF;

  -- Policies
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'policies' AND column_name = 'status') THEN
    CREATE INDEX IF NOT EXISTS idx_policies_agent ON policies (agent_id, status);
    CREATE INDEX IF NOT EXISTS idx_policies_status ON policies (status);
  END IF;

  -- Tasks
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tasks' AND column_name = 'status') THEN
    CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks (status);
  END IF;
END $$;

-- FIX #SQL10: Final safe creation of mark_overdue_installments function
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'installments' AND column_name = 'status') THEN
    DROP FUNCTION IF EXISTS mark_overdue_installments CASCADE; CREATE OR REPLACE FUNCTION mark_overdue_installments()
    RETURNS void
    LANGUAGE sql
    SECURITY DEFINER
    AS $func$
      UPDATE installments
      SET status = 'overdue', updated_at = now()
      WHERE status = 'pending'
        AND due_date < CURRENT_DATE;
    $func$;
  END IF;
END $$;

-- FIX #SQL11: Final safe creation of advanced RLS policies for tasks
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tasks' AND column_name = 'created_by') THEN
    -- tasks_select
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'tasks' AND policyname = 'tasks_select') THEN
      DROP POLICY IF EXISTS "tasks_select" ON tasks; CREATE POLICY "tasks_select" ON tasks FOR SELECT TO authenticated
        USING (assigned_to = auth.uid() OR created_by = auth.uid() OR can_access_user(auth.uid(), assigned_to));
    END IF;

    -- tasks_insert
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'tasks' AND policyname = 'tasks_insert') THEN
      DROP POLICY IF EXISTS "tasks_insert" ON tasks; CREATE POLICY "tasks_insert" ON tasks FOR INSERT TO authenticated
        WITH CHECK (created_by = auth.uid());
    END IF;

    -- tasks_update
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'tasks' AND policyname = 'tasks_update') THEN
      DROP POLICY IF EXISTS "tasks_update" ON tasks; CREATE POLICY "tasks_update" ON tasks FOR UPDATE TO authenticated
        USING (assigned_to = auth.uid() OR created_by = auth.uid() OR can_access_user(auth.uid(), assigned_to))
        WITH CHECK (assigned_to = auth.uid() OR created_by = auth.uid() OR can_access_user(auth.uid(), assigned_to));
    END IF;

    -- tasks_delete
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'tasks' AND policyname = 'tasks_delete') THEN
      DROP POLICY IF EXISTS "tasks_delete" ON tasks; CREATE POLICY "tasks_delete" ON tasks FOR DELETE TO authenticated
        USING (created_by = auth.uid() OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('super_admin', 'dev_manager')));
    END IF;
  END IF;
END $$;

-- FIX #SQL12: Update RLS Policies for clients to be more flexible for inserts
DROP POLICY IF EXISTS "clients_insert" ON clients;
DROP POLICY IF EXISTS "clients_insert" ON clients; CREATE POLICY "clients_insert" ON clients FOR INSERT 
  TO authenticated 
  WITH CHECK (true); -- Allow all authenticated users to insert, select/update still restricted by hierarchy

DROP POLICY IF EXISTS "clients_update" ON clients;
DROP POLICY IF EXISTS "clients_update" ON clients; CREATE POLICY "clients_update" ON clients FOR UPDATE
  TO authenticated
  USING (can_access_user(auth.uid(), agent_id))
  WITH CHECK (can_access_user(auth.uid(), agent_id));
