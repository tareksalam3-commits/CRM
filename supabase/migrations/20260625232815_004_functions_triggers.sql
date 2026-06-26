/*
# Life Insurance CRM - Functions and Triggers

1. New Functions
- `generate_installments` - Automatically creates installments when a policy is inserted
- `update_policy_status_on_collection` - Updates policy status when all installments are collected
- `log_activity` - Logs activity to activity_logs table
- `get_subordinate_ids` - Returns all subordinate user IDs for a given user

2. Triggers
- Trigger on policies insert to auto-generate installments
- Trigger on collections insert to update installment status
- Trigger on collections delete to revert installment status

3. Notes
- All functions are idempotent
- Installments are generated based on payment method and duration
*/

-- Function to generate installments for a policy
CREATE OR REPLACE FUNCTION generate_installments()
RETURNS TRIGGER AS $$
DECLARE
  i integer;
  total_installments integer;
  installment_amount numeric(12,2);
  due_date date;
  interval_months integer;
BEGIN
  -- Determine number of installments and interval based on payment method
  CASE NEW.payment_method
    WHEN 'annual' THEN
      total_installments := NEW.duration_years;
      interval_months := 12;
    WHEN 'semi_annual' THEN
      total_installments := NEW.duration_years * 2;
      interval_months := 6;
    WHEN 'quarterly' THEN
      total_installments := NEW.duration_years * 4;
      interval_months := 3;
    WHEN 'monthly' THEN
      total_installments := NEW.duration_years * 12;
      interval_months := 1;
  END CASE;

  installment_amount := NEW.periodic_premium;

  FOR i IN 1..total_installments LOOP
    due_date := NEW.start_date + (interval_months * (i - 1) || ' months')::interval;

    INSERT INTO installments (policy_id, installment_number, due_date, amount, insurance_year, status)
    VALUES (NEW.id, i, due_date, installment_amount, 1, 'due');
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if exists
DROP TRIGGER IF EXISTS trigger_generate_installments ON policies;

-- Create trigger
CREATE TRIGGER trigger_generate_installments
AFTER INSERT ON policies
FOR EACH ROW
EXECUTE FUNCTION generate_installments();

-- Function to update installment status on collection
CREATE OR REPLACE FUNCTION update_installment_on_collection()
RETURNS TRIGGER AS $$
BEGIN
  -- Update the installment status to collected
  UPDATE installments
  SET status = 'collected'
  WHERE id = NEW.installment_id;

  -- Log the activity
  INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details)
  VALUES (NEW.collector_id, 'collection_created', 'collection', NEW.id,
    jsonb_build_object('amount', NEW.amount, 'policy_id', NEW.policy_id, 'client_id', NEW.client_id));

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if exists
DROP TRIGGER IF EXISTS trigger_collection_insert ON collections;

-- Create trigger
CREATE TRIGGER trigger_collection_insert
AFTER INSERT ON collections
FOR EACH ROW
EXECUTE FUNCTION update_installment_on_collection();

-- Function to revert installment status on collection delete
CREATE OR REPLACE FUNCTION revert_installment_on_collection_delete()
RETURNS TRIGGER AS $$
BEGIN
  -- Revert the installment status to due
  UPDATE installments
  SET status = 'due'
  WHERE id = OLD.installment_id;

  -- Log the activity
  INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details)
  VALUES (OLD.collector_id, 'collection_deleted', 'collection', OLD.id,
    jsonb_build_object('amount', OLD.amount, 'policy_id', OLD.policy_id));

  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if exists
DROP TRIGGER IF EXISTS trigger_collection_delete ON collections;

-- Create trigger
CREATE TRIGGER trigger_collection_delete
AFTER DELETE ON collections
FOR EACH ROW
EXECUTE FUNCTION revert_installment_on_collection_delete();

-- Function to update policy status when all installments are collected
CREATE OR REPLACE FUNCTION update_policy_status()
RETURNS TRIGGER AS $$
DECLARE
  total_installments integer;
  collected_installments integer;
  policy_record policies%ROWTYPE;
BEGIN
  SELECT * INTO policy_record FROM policies WHERE id = NEW.policy_id;

  SELECT COUNT(*) INTO total_installments
  FROM installments
  WHERE policy_id = NEW.policy_id;

  SELECT COUNT(*) INTO collected_installments
  FROM installments
  WHERE policy_id = NEW.policy_id AND status = 'collected';

  IF total_installments = collected_installments THEN
    UPDATE policies SET status = 'paid' WHERE id = NEW.policy_id;
  ELSIF collected_installments > 0 THEN
    UPDATE policies SET status = 'active' WHERE id = NEW.policy_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if exists
DROP TRIGGER IF EXISTS trigger_update_policy_status ON installments;

-- Create trigger
CREATE TRIGGER trigger_update_policy_status
AFTER UPDATE OF status ON installments
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION update_policy_status();

-- Function to get subordinate IDs recursively
CREATE OR REPLACE FUNCTION get_subordinate_ids(manager_uuid uuid)
RETURNS TABLE(subordinate_id uuid) AS $$
BEGIN
  RETURN QUERY
  WITH RECURSIVE subordinates AS (
    SELECT id FROM users WHERE manager_id = manager_uuid
    UNION ALL
    SELECT u.id FROM users u
    INNER JOIN subordinates s ON u.manager_id = s.id
  )
  SELECT id FROM subordinates;
END;
$$ LANGUAGE plpgsql;
