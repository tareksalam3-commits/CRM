/*
# Automatic Collections Generation Trigger

## Overview
This migration adds a trigger to automatically generate collection installments
when a new policy is created. For life insurance (first year only), it creates
12 monthly installments based on the monthly premium.

## Changes
- Creates a function to generate collections automatically
- Adds a trigger after INSERT on policies table
- Collections are created with status 'pending'
- Due dates are calculated from the policy start date
*/

-- Function to automatically generate collections for a new policy
CREATE OR REPLACE FUNCTION generate_policy_collections()
RETURNS TRIGGER AS $$
DECLARE
  i INTEGER;
  due_date DATE;
  agent_uuid UUID;
  branch_uuid UUID;
  client_uuid UUID;
BEGIN
  -- Only generate collections for new active/sold policies
  IF TG_OP = 'INSERT' AND NEW.status IN ('pending', 'active') THEN
    -- Get policy details
    agent_uuid := NEW.agent_id;
    branch_uuid := NEW.branch_id;
    client_uuid := NEW.client_id;
    
    -- Generate 12 monthly installments (first year only)
    FOR i IN 1..12 LOOP
      -- Calculate due date (monthly from start date)
      due_date := NEW.start_date + (i - 1) * INTERVAL '1 month';
      
      -- Insert collection record
      INSERT INTO collections (
        policy_id,
        client_id,
        agent_id,
        branch_id,
        collection_number,
        amount,
        due_date,
        status
      ) VALUES (
        NEW.id,
        client_uuid,
        agent_uuid,
        branch_uuid,
        i,
        NEW.monthly_premium,
        due_date,
        'pending'
      );
    END LOOP;
    
    -- Update policy with first payment date if not set
    IF NEW.first_payment_date IS NULL THEN
      NEW.first_payment_date := NEW.start_date;
      NEW.first_payment_amount := NEW.monthly_premium;
    END IF;
    
    RETURN NEW;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for automatic collection generation
DROP TRIGGER IF EXISTS generate_collections_on_policy_insert ON policies;
CREATE TRIGGER generate_collections_on_policy_insert
  AFTER INSERT ON policies
  FOR EACH ROW
  EXECUTE FUNCTION generate_policy_collections();

-- Function to update target achievement when collection is paid
CREATE OR REPLACE FUNCTION update_target_on_collection()
RETURNS TRIGGER AS $$
DECLARE
  current_year INTEGER;
  current_month INTEGER;
  target_record RECORD;
BEGIN
  -- When a collection is marked as paid
  IF TG_OP = 'UPDATE' AND NEW.status = 'paid' AND OLD.status != 'paid' THEN
    -- Get payment date components
    current_year := EXTRACT(YEAR FROM COALESCE(NEW.payment_date, CURRENT_DATE))::INTEGER;
    current_month := EXTRACT(MONTH FROM COALESCE(NEW.payment_date, CURRENT_DATE))::INTEGER;
    
    -- Update agent's target
    UPDATE targets
    SET achieved_amount = achieved_amount + NEW.amount,
        achieved_collections = achieved_collections + 1
    WHERE user_id = NEW.agent_id
      AND year = current_year
      AND month = current_month;
  END IF;
  
  -- When a collection is reversed (unpaid)
  IF TG_OP = 'UPDATE' AND OLD.status = 'paid' AND NEW.status != 'paid' THEN
    current_year := EXTRACT(YEAR FROM COALESCE(OLD.payment_date, CURRENT_DATE))::INTEGER;
    current_month := EXTRACT(MONTH FROM COALESCE(OLD.payment_date, CURRENT_DATE))::INTEGER;
    
    -- Reverse the target update
    UPDATE targets
    SET achieved_amount = GREATEST(0, achieved_amount - OLD.amount),
        achieved_collections = GREATEST(0, achieved_collections - 1)
    WHERE user_id = OLD.agent_id
      AND year = current_year
      AND month = current_month;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for target updates
DROP TRIGGER IF EXISTS update_target_on_collection_change ON collections;
CREATE TRIGGER update_target_on_collection_change
  AFTER UPDATE ON collections
  FOR EACH ROW
  EXECUTE FUNCTION update_target_on_collection();

-- Function to update target when new policy is created
CREATE OR REPLACE FUNCTION update_target_on_policy()
RETURNS TRIGGER AS $$
DECLARE
  current_year INTEGER;
  current_month INTEGER;
BEGIN
  IF TG_OP = 'INSERT' THEN
    current_year := EXTRACT(YEAR FROM NEW.issue_date)::INTEGER;
    current_month := EXTRACT(MONTH FROM NEW.issue_date)::INTEGER;
    
    -- Update agent's target for policies
    UPDATE targets
    SET achieved_amount = achieved_amount + NEW.premium_amount,
        achieved_policies = achieved_policies + 1
    WHERE user_id = NEW.agent_id
      AND year = current_year
      AND month = current_month;
      
    -- If no target exists, create one
    INSERT INTO targets (user_id, branch_id, year, month, target_type, target_amount, achieved_amount, achieved_policies)
    SELECT NEW.agent_id, NEW.branch_id, current_year, current_month, 'premium', 0, NEW.premium_amount, 1
    WHERE NOT EXISTS (
      SELECT 1 FROM targets 
      WHERE user_id = NEW.agent_id 
        AND year = current_year 
        AND month = current_month
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS update_target_on_policy_insert ON policies;
CREATE TRIGGER update_target_on_policy_insert
  AFTER INSERT ON policies
  FOR EACH ROW
  EXECUTE FUNCTION update_target_on_policy();
