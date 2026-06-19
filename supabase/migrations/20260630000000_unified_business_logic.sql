-- ================================================================
-- CRM Pro — Unified Business Logic for Life Insurance
-- Migration Date: 2026-06-30
-- ================================================================

-- 1. Update Policies Table Schema
ALTER TABLE public.policies 
ADD COLUMN IF NOT EXISTS first_year_start date,
ADD COLUMN IF NOT EXISTS first_year_end date,
ADD COLUMN IF NOT EXISTS has_new_business_counted boolean DEFAULT false;

-- 2. Function to calculate first year dates
CREATE OR REPLACE FUNCTION public.calculate_policy_first_year()
RETURNS TRIGGER AS $$
BEGIN
    -- First year starts from the beginning of the issue month
    NEW.first_year_start := date_trunc('month', NEW.issue_date)::date;
    -- First year ends at the end of the 12th month
    NEW.first_year_end := (date_trunc('month', NEW.issue_date) + INTERVAL '12 months' - INTERVAL '1 day')::date;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for new policies
DROP TRIGGER IF EXISTS trg_calculate_first_year ON public.policies;
CREATE TRIGGER trg_calculate_first_year
BEFORE INSERT OR UPDATE OF issue_date ON public.policies
FOR EACH ROW
EXECUTE FUNCTION public.calculate_policy_first_year();

-- Update existing policies
UPDATE public.policies 
SET 
    first_year_start = date_trunc('month', issue_date)::date,
    first_year_end = (date_trunc('month', issue_date) + INTERVAL '12 months' - INTERVAL '1 day')::date;

-- 3. Update Collections Logic
-- Ensure is_new_business is correctly set and doesn't duplicate
CREATE OR REPLACE FUNCTION public.mark_collection_as_production()
RETURNS TRIGGER AS $$
DECLARE
    v_installment_number int;
    v_has_counted boolean;
BEGIN
    -- Get installment number
    SELECT installment_number INTO v_installment_number 
    FROM public.installments WHERE id = NEW.installment_id;

    -- Get if policy already has new business counted
    SELECT has_new_business_counted INTO v_has_counted 
    FROM public.policies WHERE id = NEW.policy_id;

    IF v_installment_number = 1 AND NOT v_has_counted THEN
        NEW.is_new_business := true;
        -- Mark policy as having new business counted
        UPDATE public.policies SET has_new_business_counted = true WHERE id = NEW.policy_id;
    ELSE
        NEW.is_new_business := false;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. Create Unified Business Logic View
-- This view will be the "Single Source of Truth" for all calculations
CREATE OR REPLACE VIEW public.unified_performance_metrics AS
SELECT 
    c.id as collection_id,
    c.amount,
    c.collection_date,
    c.is_new_business,
    p.id as policy_id,
    p.agent_id,
    p.branch_id,
    p.first_year_start,
    p.first_year_end,
    -- A collection is valid if it's within the first year
    (c.collection_date <= p.first_year_end) as is_first_year_collection
FROM public.collections c
JOIN public.policies p ON c.policy_id = p.id;

-- 5. Updated calculate_agent_performance function
CREATE OR REPLACE FUNCTION public.calculate_agent_performance_v2(
  p_agent_id uuid,
  p_month int,
  p_year int
)
RETURNS TABLE (
  new_business numeric,
  collections numeric,
  total_production numeric,
  collection_rate numeric
) AS $$
DECLARE
    v_month_start date;
    v_month_end date;
    v_total_due numeric;
    v_total_collected_in_period numeric;
BEGIN
    v_month_start := make_date(p_year, p_month, 1);
    v_month_end := (v_month_start + INTERVAL '1 month' - INTERVAL '1 day')::date;

    -- 1. Total New Business (Paid first installments in this month)
    SELECT COALESCE(SUM(amount), 0) INTO new_business
    FROM public.unified_performance_metrics
    WHERE agent_id = p_agent_id
      AND is_new_business = true
      AND collection_date BETWEEN v_month_start AND v_month_end;

    -- 2. Total Collections (Paid subsequent installments in this month, only within first year)
    SELECT COALESCE(SUM(amount), 0) INTO collections
    FROM public.unified_performance_metrics
    WHERE agent_id = p_agent_id
      AND is_new_business = false
      AND is_first_year_collection = true
      AND collection_date BETWEEN v_month_start AND v_month_end;

    total_production := new_business + collections;

    -- 3. Collection Rate Calculation
    -- المحصل فعلياً خلال الفترة ÷ المستحق تحصيله خلال نفس الفترة × 100
    
    -- Actual collected in period (all valid first year collections)
    SELECT COALESCE(SUM(amount), 0) INTO v_total_collected_in_period
    FROM public.unified_performance_metrics
    WHERE agent_id = p_agent_id
      AND is_first_year_collection = true
      AND collection_date BETWEEN v_month_start AND v_month_end;

    -- Total due in period (all installments due in this month that belong to first year)
    SELECT COALESCE(SUM(i.amount), 0) INTO v_total_due
    FROM public.installments i
    JOIN public.policies p ON i.policy_id = p.id
    WHERE p.agent_id = p_agent_id
      AND i.due_date BETWEEN v_month_start AND v_month_end
      AND i.due_date <= p.first_year_end;

    IF v_total_due > 0 THEN
        collection_rate := ROUND((v_total_collected_in_period / v_total_due) * 100, 2);
    ELSE
        collection_rate := 0;
    END IF;

    RETURN NEXT;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;
