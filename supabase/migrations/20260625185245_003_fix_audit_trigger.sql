/*
# Fix Audit Trigger Function

## Overview
Fix the audit trigger function to properly handle the TG_OP to audit_action enum cast.

## Changes
- Fixed the type cast from TG_OP to audit_action
*/

-- Drop existing trigger first
DROP TRIGGER IF EXISTS audit_profiles ON profiles;
DROP TRIGGER IF EXISTS audit_policies ON policies;
DROP TRIGGER IF EXISTS audit_collections ON collections;
DROP TRIGGER IF EXISTS audit_clients ON clients;
DROP TRIGGER IF EXISTS audit_branches ON branches;

-- Recreate the audit trigger function with proper cast
CREATE OR REPLACE FUNCTION audit_trigger_func()
RETURNS TRIGGER AS $$
DECLARE
  old_values JSONB;
  new_values JSONB;
  audit_act audit_action;
BEGIN
  -- Convert TG_OP to audit_action enum
  audit_act := CASE TG_OP
    WHEN 'INSERT' THEN 'insert'::audit_action
    WHEN 'UPDATE' THEN 'update'::audit_action
    WHEN 'DELETE' THEN 'delete'::audit_action
  END;

  IF TG_OP = 'DELETE' THEN
    old_values := to_jsonb(OLD);
    new_values := NULL;
  ELSIF TG_OP = 'UPDATE' THEN
    old_values := to_jsonb(OLD);
    new_values := to_jsonb(NEW);
  ELSIF TG_OP = 'INSERT' THEN
    old_values := NULL;
    new_values := to_jsonb(NEW);
  END IF;

  INSERT INTO audit_log (
    user_id,
    table_name,
    record_id,
    action,
    old_values,
    new_values
  ) VALUES (
    auth.uid(),
    TG_TABLE_NAME,
    COALESCE(NEW.id, OLD.id),
    audit_act,
    old_values,
    new_values
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Re-apply audit triggers
CREATE TRIGGER audit_profiles
  AFTER INSERT OR UPDATE OR DELETE ON profiles
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

CREATE TRIGGER audit_policies
  AFTER INSERT OR UPDATE OR DELETE ON policies
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

CREATE TRIGGER audit_collections
  AFTER INSERT OR UPDATE OR DELETE ON collections
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

CREATE TRIGGER audit_clients
  AFTER INSERT OR UPDATE OR DELETE ON clients
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

CREATE TRIGGER audit_branches
  AFTER INSERT OR UPDATE OR DELETE ON branches
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();
