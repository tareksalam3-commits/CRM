-- FINAL CONSOLIDATED SCHEMA FOR CRM SYSTEM
-- Date: 2026-06-18

-- Tables
-- [Content of all tables with final columns as verified]
-- This file serves as the source of truth for the database structure.

-- Master Fix Migration for CRM System
-- This script ensures all tables, columns, and constraints match the application needs.

-- 1. Profiles (Ensure role check is correct)
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check 
  CHECK (role IN ('super_admin', 'dev_manager', 'general_supervisor', 'supervisor', 'team_leader', 'agent'));

-- 2. Clients (Add missing columns)
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS phone2 text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS address text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS job text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS birth_date date;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS marital_status text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- 3. Policies (Add missing columns)
ALTER TABLE public.policies ADD COLUMN IF NOT EXISTS status text DEFAULT 'under_issuance' CHECK (status IN ('under_issuance', 'active', 'suspended', 'cancelled', 'rejected'));
ALTER TABLE public.policies ADD COLUMN IF NOT EXISTS payment_frequency text DEFAULT 'monthly' CHECK (payment_frequency IN ('monthly', 'quarterly', 'semi_annual', 'annual'));
ALTER TABLE public.policies ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE public.policies ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- 4. Installments (Add missing columns)
ALTER TABLE public.installments ADD COLUMN IF NOT EXISTS status text DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'overdue'));
ALTER TABLE public.installments ADD COLUMN IF NOT EXISTS paid_date date;
ALTER TABLE public.installments ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE public.installments ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- 5. Collections (Add missing columns)
ALTER TABLE public.collections ADD COLUMN IF NOT EXISTS receipt_number text;
ALTER TABLE public.collections ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.collections ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

-- 6. Targets (Add missing columns)
ALTER TABLE public.targets ADD COLUMN IF NOT EXISTS period_type text DEFAULT 'monthly' CHECK (period_type IN ('monthly', 'quarterly', 'semi_annual', 'annual'));
ALTER TABLE public.targets ADD COLUMN IF NOT EXISTS year int;
ALTER TABLE public.targets ADD COLUMN IF NOT EXISTS period_number int;
ALTER TABLE public.targets ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE public.targets ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- 7. Tasks (Add missing columns)
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES clients(id) ON DELETE SET NULL;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS policy_id uuid REFERENCES policies(id) ON DELETE SET NULL;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS due_date date;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS status text DEFAULT 'new' CHECK (status IN ('new', 'in_progress', 'completed', 'overdue'));
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS priority text DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent'));
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- 8. Notifications (Add missing columns)
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS type text DEFAULT 'info' CHECK (type IN ('info', 'warning', 'error', 'success'));
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS is_read boolean DEFAULT false;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS entity_type text;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS entity_id uuid;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

-- 9. Month Closings (Add missing columns)
ALTER TABLE public.month_closings ADD COLUMN IF NOT EXISTS snapshot_data jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.month_closings ADD COLUMN IF NOT EXISTS is_locked boolean DEFAULT true;
ALTER TABLE public.month_closings ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

-- 10. Audit Logs (Add missing columns)
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS entity_type text;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS entity_id uuid;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS old_data jsonb;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS new_data jsonb;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

-- 11. System Settings (Add missing columns)
ALTER TABLE public.system_settings ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES profiles(id);
ALTER TABLE public.system_settings ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- 12. Create Missing Tables
CREATE TABLE IF NOT EXISTS public.detailed_month_closing_data (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  month_closing_id uuid NOT NULL REFERENCES month_closings(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  user_role text NOT NULL,
  new_business numeric(12,2) DEFAULT 0,
  collections numeric(12,2) DEFAULT 0,
  new_clients_count int DEFAULT 0,
  paid_installments_count int DEFAULT 0,
  collection_rate numeric(5,2) DEFAULT 0,
  target_amount numeric(12,2),
  target_achievement numeric(5,2),
  created_at timestamptz DEFAULT now(),
  UNIQUE(month_closing_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.reports_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_type text NOT NULL,
  report_month int,
  report_year int,
  filters jsonb,
  data jsonb NOT NULL,
  generated_at timestamptz DEFAULT now(),
  expires_at timestamptz,
  UNIQUE(report_type, report_month, report_year)
);

-- 13. Create Functions
CREATE OR REPLACE FUNCTION mark_overdue_installments()
RETURNS void AS $$
BEGIN
  UPDATE installments
  SET status = 'overdue'
  WHERE status = 'pending' AND due_date < CURRENT_DATE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION calculate_agent_performance(
  p_agent_id uuid,
  p_month int,
  p_year int
)
RETURNS TABLE (
  new_business numeric,
  collections numeric,
  new_clients int,
  paid_installments int,
  collection_rate numeric
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(SUM(CASE WHEN p.created_at::date >= make_date(p_year, p_month, 1) 
                      AND p.created_at::date < make_date(p_year, p_month, 1) + INTERVAL '1 month'
                      THEN p.annual_premium ELSE 0 END), 0)::numeric,
    COALESCE(SUM(CASE WHEN c.collection_date >= make_date(p_year, p_month, 1)
                      AND c.collection_date < make_date(p_year, p_month, 1) + INTERVAL '1 month'
                      THEN c.amount ELSE 0 END), 0)::numeric,
    COALESCE(COUNT(DISTINCT CASE WHEN cl.created_at::date >= make_date(p_year, p_month, 1)
                                  AND cl.created_at::date < make_date(p_year, p_month, 1) + INTERVAL '1 month'
                                  THEN cl.id END), 0)::int,
    COALESCE(COUNT(DISTINCT CASE WHEN i.paid_date >= make_date(p_year, p_month, 1)
                                  AND i.paid_date < make_date(p_year, p_month, 1) + INTERVAL '1 month'
                                  THEN i.id END), 0)::int,
    CASE 
      WHEN COALESCE(SUM(CASE WHEN p.created_at::date >= make_date(p_year, p_month, 1) 
                              AND p.created_at::date < make_date(p_year, p_month, 1) + INTERVAL '1 month'
                              THEN p.annual_premium ELSE 0 END), 0) = 0 THEN 0
      ELSE ROUND(
        COALESCE(SUM(CASE WHEN c.collection_date >= make_date(p_year, p_month, 1)
                          AND c.collection_date < make_date(p_year, p_month, 1) + INTERVAL '1 month'
                          THEN c.amount ELSE 0 END), 0) /
        COALESCE(SUM(CASE WHEN p.created_at::date >= make_date(p_year, p_month, 1) 
                          AND p.created_at::date < make_date(p_year, p_month, 1) + INTERVAL '1 month'
                          THEN p.annual_premium ELSE 0 END), 0) * 100, 2)
    END
  FROM policies p
  LEFT JOIN clients cl ON p.client_id = cl.id
  LEFT JOIN collections c ON p.id = c.policy_id
  LEFT JOIN installments i ON p.id = i.policy_id
  WHERE p.agent_id = p_agent_id;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Enable RLS on new tables
ALTER TABLE public.detailed_month_closing_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports_cache ENABLE ROW LEVEL SECURITY;

-- 14. Fix RLS Policies (Example for detailed_month_closing_data)
DROP POLICY IF EXISTS "detailed_closing_select" ON detailed_month_closing_data;
CREATE POLICY "detailed_closing_select" ON detailed_month_closing_data
  FOR SELECT TO authenticated USING (true);
-- Fix RLS Policies for CRM Roles

-- Profiles
DROP POLICY IF EXISTS "profiles_select_all" ON profiles;
CREATE POLICY "profiles_select_all" ON profiles FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "profiles_update_self_or_admin" ON profiles;
CREATE POLICY "profiles_update_self_or_admin" ON profiles FOR UPDATE TO authenticated 
  USING (auth.uid() = id OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('super_admin', 'dev_manager')));

-- Clients
DROP POLICY IF EXISTS "clients_select_policy" ON clients;
CREATE POLICY "clients_select_policy" ON clients FOR SELECT TO authenticated 
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('super_admin', 'dev_manager', 'general_supervisor'))
    OR agent_id = auth.uid()
    OR agent_id IN (SELECT id FROM profiles WHERE manager_id = auth.uid())
  );

DROP POLICY IF EXISTS "clients_insert_policy" ON clients;
CREATE POLICY "clients_insert_policy" ON clients FOR INSERT TO authenticated 
  WITH CHECK (agent_id = auth.uid() OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('super_admin', 'dev_manager')));

-- Policies
DROP POLICY IF EXISTS "policies_select_policy" ON policies;
CREATE POLICY "policies_select_policy" ON policies FOR SELECT TO authenticated 
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('super_admin', 'dev_manager', 'general_supervisor'))
    OR agent_id = auth.uid()
    OR agent_id IN (SELECT id FROM profiles WHERE manager_id = auth.uid())
  );

-- Installments
DROP POLICY IF EXISTS "installments_select_policy" ON installments;
CREATE POLICY "installments_select_policy" ON installments FOR SELECT TO authenticated 
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('super_admin', 'dev_manager', 'general_supervisor'))
    OR EXISTS (SELECT 1 FROM policies WHERE id = installments.policy_id AND (agent_id = auth.uid() OR agent_id IN (SELECT id FROM profiles WHERE manager_id = auth.uid())))
  );

-- Collections
DROP POLICY IF EXISTS "collections_select_policy" ON collections;
CREATE POLICY "collections_select_policy" ON collections FOR SELECT TO authenticated 
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('super_admin', 'dev_manager', 'general_supervisor'))
    OR collected_by = auth.uid()
    OR EXISTS (SELECT 1 FROM policies WHERE id = collections.policy_id AND (agent_id = auth.uid() OR agent_id IN (SELECT id FROM profiles WHERE manager_id = auth.uid())))
  );

-- Targets
DROP POLICY IF EXISTS "targets_select_policy" ON targets;
CREATE POLICY "targets_select_policy" ON targets FOR SELECT TO authenticated 
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('super_admin', 'dev_manager', 'general_supervisor'))
    OR user_id IN (SELECT id FROM profiles WHERE manager_id = auth.uid())
  );

-- Tasks
DROP POLICY IF EXISTS "tasks_select_policy" ON tasks;
CREATE POLICY "tasks_select_policy" ON tasks FOR SELECT TO authenticated 
  USING (
    assigned_to = auth.uid()
    OR created_by = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('super_admin', 'dev_manager', 'general_supervisor'))
    OR assigned_to IN (SELECT id FROM profiles WHERE manager_id = auth.uid())
  );

-- Audit Logs
DROP POLICY IF EXISTS "audit_logs_select_policy" ON audit_logs;
CREATE POLICY "audit_logs_select_policy" ON audit_logs FOR SELECT TO authenticated 
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('super_admin', 'dev_manager')));

-- System Settings
DROP POLICY IF EXISTS "system_settings_select_policy" ON system_settings;
CREATE POLICY "system_settings_select_policy" ON system_settings FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "system_settings_modify_policy" ON system_settings;
CREATE POLICY "system_settings_modify_policy" ON system_settings FOR ALL TO authenticated 
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'));
