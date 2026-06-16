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

-- FIX #SQL4: Performance indexes
CREATE INDEX IF NOT EXISTS idx_notifications_unread   ON notifications (user_id, is_read) WHERE is_read = false;
CREATE INDEX IF NOT EXISTS idx_audit_logs_created     ON audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity      ON audit_logs (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_installments_pending   ON installments (status, due_date) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_policies_agent         ON policies (agent_id, status);
CREATE INDEX IF NOT EXISTS idx_clients_agent          ON clients (agent_id);

-- FIX #SQL5: Ensure RLS on all tables
ALTER TABLE profiles       ENABLE ROW LEVEL SECURITY;
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
