-- Fixes, Functions, and Indexes
DROP FUNCTION IF EXISTS mark_overdue_installments() CASCADE;
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
