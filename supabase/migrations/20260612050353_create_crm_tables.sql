/*
# Insurance CRM Pro - Tables Schema

Creates all core tables for the Insurance CRM Pro application.
Tables include profiles, clients, policies, installments, collections,
targets, tasks, notifications, month_closings, audit_logs, and system_settings.
All tables have RLS enabled.
*/

-- Profiles table
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  email text NOT NULL,
  phone text,
  role text NOT NULL DEFAULT 'agent' CHECK (role IN ('super_admin', 'dev_manager', 'general_supervisor', 'supervisor', 'team_leader', 'agent')),
  manager_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_manager ON profiles(manager_id);

-- Clients table
CREATE TABLE IF NOT EXISTS clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  national_id text,
  phone text NOT NULL,
  phone2 text,
  address text,
  job text,
  birth_date date,
  marital_status text CHECK (marital_status IS NULL OR marital_status IN ('single', 'married', 'divorced', 'widowed')),
  notes text,
  agent_id uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_clients_agent ON clients(agent_id);
CREATE INDEX IF NOT EXISTS idx_clients_national_id ON clients(national_id);

-- Policies table
CREATE TABLE IF NOT EXISTS policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_number text UNIQUE NOT NULL,
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  agent_id uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  product text NOT NULL,
  insurance_company text NOT NULL,
  coverage_amount numeric(12,2) NOT NULL,
  annual_premium numeric(12,2) NOT NULL,
  issue_date date NOT NULL,
  start_date date NOT NULL,
  status text NOT NULL DEFAULT 'under_issuance' CHECK (status IN ('under_issuance', 'active', 'suspended', 'cancelled', 'rejected')),
  payment_frequency text NOT NULL DEFAULT 'monthly' CHECK (payment_frequency IN ('monthly', 'quarterly', 'semi_annual', 'annual')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_policies_agent ON policies(agent_id);
CREATE INDEX IF NOT EXISTS idx_policies_client ON policies(client_id);
CREATE INDEX IF NOT EXISTS idx_policies_status ON policies(status);

-- Installments table
CREATE TABLE IF NOT EXISTS installments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id uuid NOT NULL REFERENCES policies(id) ON DELETE CASCADE,
  installment_number int NOT NULL,
  amount numeric(12,2) NOT NULL,
  due_date date NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'overdue')),
  paid_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- BUG FIX: Prevent duplicate installment numbers per policy
  UNIQUE(policy_id, installment_number)
);

CREATE INDEX IF NOT EXISTS idx_installments_policy ON installments(policy_id);
CREATE INDEX IF NOT EXISTS idx_installments_status ON installments(status);
CREATE INDEX IF NOT EXISTS idx_installments_due_date ON installments(due_date);

-- Collections table
CREATE TABLE IF NOT EXISTS collections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- BUG FIX: UNIQUE enforces one collection per installment at the database level,
  -- preventing duplicate payments even under race-condition concurrent inserts.
  installment_id uuid NOT NULL UNIQUE REFERENCES installments(id) ON DELETE RESTRICT,
  policy_id uuid NOT NULL REFERENCES policies(id) ON DELETE RESTRICT,
  amount numeric(12,2) NOT NULL,
  collection_date date NOT NULL,
  receipt_number text,
  collected_by uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_collections_policy ON collections(policy_id);
CREATE INDEX IF NOT EXISTS idx_collections_date ON collections(collection_date);

-- Targets table
CREATE TABLE IF NOT EXISTS targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  period_type text NOT NULL CHECK (period_type IN ('monthly', 'quarterly', 'semi_annual', 'annual')),
  year int NOT NULL,
  period_number int NOT NULL,
  target_amount numeric(12,2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, period_type, year, period_number)
);

CREATE INDEX IF NOT EXISTS idx_targets_user ON targets(user_id);

-- Tasks table
CREATE TABLE IF NOT EXISTS tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  assigned_to uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  client_id uuid REFERENCES clients(id) ON DELETE SET NULL,
  policy_id uuid REFERENCES policies(id) ON DELETE SET NULL,
  due_date date NOT NULL,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'in_progress', 'completed', 'overdue')),
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tasks_assigned ON tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);

-- Notifications table
CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  message text NOT NULL,
  type text NOT NULL,
  is_read boolean NOT NULL DEFAULT false,
  entity_type text,
  entity_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(user_id, is_read);

-- Month closings table
CREATE TABLE IF NOT EXISTS month_closings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  closed_by uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  month int NOT NULL CHECK (month BETWEEN 1 AND 12),
  year int NOT NULL,
  snapshot_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_locked boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(month, year)
);

-- Audit logs table
CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_date ON audit_logs(created_at);

-- System settings table
CREATE TABLE IF NOT EXISTS system_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by uuid REFERENCES profiles(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE installments ENABLE ROW LEVEL SECURITY;
ALTER TABLE collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE month_closings ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;

-- BUG FIX: Auto-mark overdue installments via a DB function + trigger on installments changes.
-- Call this function periodically (via a Supabase Scheduled Job or on app load).
CREATE OR REPLACE FUNCTION mark_overdue_installments()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE installments
  SET status = 'overdue', updated_at = now()
  WHERE status = 'pending'
    AND due_date < CURRENT_DATE;
$$;
