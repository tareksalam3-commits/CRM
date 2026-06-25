/*
================================================================================
LIFE INSURANCE SALES CRM - COMPLETE DATABASE BACKUP
================================================================================
Generated: 2026-06-25
Version: 1.0.0
Database: PostgreSQL (Supabase)

This file contains everything needed to restore the complete database:
- Schema (tables, indexes, views)
- Functions and triggers
- Row Level Security policies
- Seed data (branches, users, targets, settings)

================================================================================
RESTORE INSTRUCTIONS:
================================================================================
1. Create a new Supabase project or connect to existing one
2. Run this SQL file using the Supabase SQL Editor or psql:
   psql -h <host> -U <user> -d postgres -f database-backup-complete.sql
3. All users will have password: 123456
================================================================================
*/

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- ENUMS
-- ============================================================

CREATE TYPE user_role AS ENUM (
  'super_admin',
  'development_manager',
  'general_supervisor',
  'supervisor',
  'group_leader',
  'agent'
);

CREATE TYPE policy_status AS ENUM (
  'pending',
  'active',
  'cancelled',
  'expired'
);

CREATE TYPE collection_status AS ENUM (
  'pending',
  'paid',
  'overdue',
  'cancelled'
);

CREATE TYPE task_status AS ENUM (
  'pending',
  'in_progress',
  'completed',
  'cancelled'
);

CREATE TYPE task_priority AS ENUM (
  'low',
  'medium',
  'high',
  'urgent'
);

CREATE TYPE notification_type AS ENUM (
  'info',
  'success',
  'warning',
  'error'
);

CREATE TYPE audit_action AS ENUM (
  'insert',
  'update',
  'delete'
);

-- ============================================================
-- TABLES
-- ============================================================

-- Branches table
CREATE TABLE IF NOT EXISTS branches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  code TEXT UNIQUE NOT NULL,
  region TEXT,
  address TEXT,
  phone TEXT,
  email TEXT,
  manager_id UUID,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Profiles table (extends auth.users)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role user_role NOT NULL DEFAULT 'agent',
  branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
  phone TEXT,
  avatar_url TEXT,
  is_active BOOLEAN DEFAULT true,
  hire_date DATE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT unique_email UNIQUE (email)
);

-- Organizational hierarchy (reporting structure)
CREATE TABLE IF NOT EXISTS organizational_hierarchy (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  level INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT unique_user_hierarchy UNIQUE (user_id)
);

-- Clients table
CREATE TABLE IF NOT EXISTS clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  national_id TEXT UNIQUE,
  phone TEXT,
  mobile TEXT,
  email TEXT,
  address TEXT,
  city TEXT,
  birth_date DATE,
  occupation TEXT,
  agent_id UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Policies table
CREATE TABLE IF NOT EXISTS policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_number TEXT UNIQUE NOT NULL,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  agent_id UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  policy_type TEXT NOT NULL,
  premium_amount DECIMAL(12,2) NOT NULL,
  monthly_premium DECIMAL(12,2) NOT NULL,
  issue_date DATE NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status policy_status NOT NULL DEFAULT 'pending',
  first_payment_date DATE,
  first_payment_amount DECIMAL(12,2),
  beneficiary_name TEXT,
  beneficiary_relation TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Collections table (premium payments)
CREATE TABLE IF NOT EXISTS collections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id UUID NOT NULL REFERENCES policies(id) ON DELETE RESTRICT,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  agent_id UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  collection_number INTEGER NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  due_date DATE NOT NULL,
  payment_date DATE,
  status collection_status NOT NULL DEFAULT 'pending',
  payment_method TEXT,
  receipt_number TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT unique_policy_collection UNIQUE (policy_id, collection_number)
);

-- Targets table
CREATE TABLE IF NOT EXISTS targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  target_type TEXT NOT NULL DEFAULT 'premium',
  target_amount DECIMAL(12,2) NOT NULL,
  achieved_amount DECIMAL(12,2) DEFAULT 0,
  target_policies INTEGER DEFAULT 0,
  achieved_policies INTEGER DEFAULT 0,
  target_collections INTEGER DEFAULT 0,
  achieved_collections INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT unique_user_target UNIQUE (user_id, year, month, target_type)
);

-- Notifications table
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type notification_type NOT NULL DEFAULT 'info',
  is_read BOOLEAN DEFAULT false,
  link TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Tasks table
CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  assigned_to UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  assigned_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  due_date DATE,
  priority task_priority NOT NULL DEFAULT 'medium',
  status task_status NOT NULL DEFAULT 'pending',
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Audit log table
CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  table_name TEXT NOT NULL,
  record_id UUID NOT NULL,
  action audit_action NOT NULL,
  old_values JSONB,
  new_values JSONB,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Month closing table
CREATE TABLE IF NOT EXISTS month_closing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID REFERENCES branches(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  closed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  closed_at TIMESTAMPTZ DEFAULT now(),
  is_locked BOOLEAN DEFAULT false,
  notes TEXT,
  CONSTRAINT unique_branch_closing UNIQUE (branch_id, year, month)
);

-- System settings table
CREATE TABLE IF NOT EXISTS system_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  value TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_branch ON profiles(branch_id);
CREATE INDEX IF NOT EXISTS idx_branches_manager ON branches(manager_id);
CREATE INDEX IF NOT EXISTS idx_branches_active ON branches(is_active);
CREATE INDEX IF NOT EXISTS idx_org_hierarchy_user ON organizational_hierarchy(user_id);
CREATE INDEX IF NOT EXISTS idx_org_hierarchy_parent ON organizational_hierarchy(parent_id);
CREATE INDEX IF NOT EXISTS idx_clients_agent ON clients(agent_id);
CREATE INDEX IF NOT EXISTS idx_clients_branch ON clients(branch_id);
CREATE INDEX IF NOT EXISTS idx_clients_name ON clients(full_name);
CREATE INDEX IF NOT EXISTS idx_policies_client ON policies(client_id);
CREATE INDEX IF NOT EXISTS idx_policies_agent ON policies(agent_id);
CREATE INDEX IF NOT EXISTS idx_policies_branch ON policies(branch_id);
CREATE INDEX IF NOT EXISTS idx_policies_status ON policies(status);
CREATE INDEX IF NOT EXISTS idx_policies_issue_date ON policies(issue_date);
CREATE INDEX IF NOT EXISTS idx_policies_number ON policies(policy_number);
CREATE INDEX IF NOT EXISTS idx_collections_policy ON collections(policy_id);
CREATE INDEX IF NOT EXISTS idx_collections_agent ON collections(agent_id);
CREATE INDEX IF NOT EXISTS idx_collections_branch ON collections(branch_id);
CREATE INDEX IF NOT EXISTS idx_collections_status ON collections(status);
CREATE INDEX IF NOT EXISTS idx_collections_due_date ON collections(due_date);
CREATE INDEX IF NOT EXISTS idx_targets_user ON targets(user_id);
CREATE INDEX IF NOT EXISTS idx_targets_branch ON targets(branch_id);
CREATE INDEX IF NOT EXISTS idx_targets_year_month ON targets(year, month);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to ON tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_audit_log_user ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_table ON audit_log(table_name);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at);
CREATE INDEX IF NOT EXISTS idx_month_closing_branch ON month_closing(branch_id);
CREATE INDEX IF NOT EXISTS idx_month_closing_period ON month_closing(year, month);

-- ============================================================
-- FUNCTIONS
-- ============================================================

-- Function to get all descendants of a user
CREATE OR REPLACE FUNCTION get_user_descendants(user_uuid UUID)
RETURNS TABLE (
  id UUID,
  email TEXT,
  full_name TEXT,
  role user_role,
  branch_id UUID,
  level INTEGER
) AS $$
BEGIN
  RETURN QUERY
  WITH RECURSIVE descendants AS (
    SELECT p.id, p.email, p.full_name, p.role, p.branch_id, 0 AS level
    FROM profiles p
    WHERE p.id = user_uuid
    UNION ALL
    SELECT p.id, p.email, p.full_name, p.role, p.branch_id, d.level + 1
    FROM profiles p
    JOIN organizational_hierarchy oh ON oh.user_id = p.id
    JOIN descendants d ON oh.parent_id = d.id
  )
  SELECT * FROM descendants;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get all ancestors of a user
CREATE OR REPLACE FUNCTION get_user_ancestors(user_uuid UUID)
RETURNS TABLE (
  id UUID,
  email TEXT,
  full_name TEXT,
  role user_role,
  branch_id UUID,
  level INTEGER
) AS $$
BEGIN
  RETURN QUERY
  WITH RECURSIVE ancestors AS (
    SELECT p.id, p.email, p.full_name, p.role, p.branch_id, 0 AS level
    FROM profiles p
    WHERE p.id = user_uuid
    UNION ALL
    SELECT p.id, p.email, p.full_name, p.role, p.branch_id, a.level + 1
    FROM profiles p
    JOIN organizational_hierarchy oh ON oh.parent_id = p.id
    JOIN ancestors a ON oh.user_id = a.id
  )
  SELECT * FROM ancestors ORDER BY level DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Audit trigger function
CREATE OR REPLACE FUNCTION audit_trigger_func()
RETURNS TRIGGER AS $$
DECLARE
  old_values JSONB;
  new_values JSONB;
  audit_act audit_action;
BEGIN
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
    user_id, table_name, record_id, action, old_values, new_values
  ) VALUES (
    auth.uid(), TG_TABLE_NAME, COALESCE(NEW.id, OLD.id), audit_act, old_values, new_values
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to generate collections for new policies
CREATE OR REPLACE FUNCTION generate_policy_collections()
RETURNS TRIGGER AS $$
DECLARE
  i INTEGER;
  due_date DATE;
BEGIN
  IF TG_OP = 'INSERT' AND NEW.status IN ('pending', 'active') THEN
    FOR i IN 1..12 LOOP
      due_date := NEW.start_date + (i - 1) * INTERVAL '1 month';
      INSERT INTO collections (
        policy_id, client_id, agent_id, branch_id,
        collection_number, amount, due_date, status
      ) VALUES (
        NEW.id, NEW.client_id, NEW.agent_id, NEW.branch_id,
        i, NEW.monthly_premium, due_date, 'pending'
      );
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to update target on collection payment
CREATE OR REPLACE FUNCTION update_target_on_collection()
RETURNS TRIGGER AS $$
DECLARE
  current_year INTEGER;
  current_month INTEGER;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status = 'paid' AND OLD.status != 'paid' THEN
    current_year := EXTRACT(YEAR FROM COALESCE(NEW.payment_date, CURRENT_DATE))::INTEGER;
    current_month := EXTRACT(MONTH FROM COALESCE(NEW.payment_date, CURRENT_DATE))::INTEGER;

    UPDATE targets
    SET achieved_amount = achieved_amount + NEW.amount,
        achieved_collections = achieved_collections + 1
    WHERE user_id = NEW.agent_id AND year = current_year AND month = current_month;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.status = 'paid' AND NEW.status != 'paid' THEN
    current_year := EXTRACT(YEAR FROM COALESCE(OLD.payment_date, CURRENT_DATE))::INTEGER;
    current_month := EXTRACT(MONTH FROM COALESCE(OLD.payment_date, CURRENT_DATE))::INTEGER;

    UPDATE targets
    SET achieved_amount = GREATEST(0, achieved_amount - OLD.amount),
        achieved_collections = GREATEST(0, achieved_collections - 1)
    WHERE user_id = OLD.agent_id AND year = current_year AND month = current_month;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to update target on new policy
CREATE OR REPLACE FUNCTION update_target_on_policy()
RETURNS TRIGGER AS $$
DECLARE
  current_year INTEGER;
  current_month INTEGER;
BEGIN
  IF TG_OP = 'INSERT' THEN
    current_year := EXTRACT(YEAR FROM NEW.issue_date)::INTEGER;
    current_month := EXTRACT(MONTH FROM NEW.issue_date)::INTEGER;

    UPDATE targets
    SET achieved_amount = achieved_amount + NEW.premium_amount,
        achieved_policies = achieved_policies + 1
    WHERE user_id = NEW.agent_id AND year = current_year AND month = current_month;

    INSERT INTO targets (user_id, branch_id, year, month, target_type, target_amount, achieved_amount, achieved_policies)
    SELECT NEW.agent_id, NEW.branch_id, current_year, current_month, 'premium', 0, NEW.premium_amount, 1
    WHERE NOT EXISTS (
      SELECT 1 FROM targets WHERE user_id = NEW.agent_id AND year = current_year AND month = current_month
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- TRIGGERS
-- ============================================================

-- Updated_at triggers
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_branches_updated_at BEFORE UPDATE ON branches FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_clients_updated_at BEFORE UPDATE ON clients FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_policies_updated_at BEFORE UPDATE ON policies FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_collections_updated_at BEFORE UPDATE ON collections FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_targets_updated_at BEFORE UPDATE ON targets FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_tasks_updated_at BEFORE UPDATE ON tasks FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_org_hierarchy_updated_at BEFORE UPDATE ON organizational_hierarchy FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_settings_updated_at BEFORE UPDATE ON system_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Audit triggers
CREATE TRIGGER audit_profiles AFTER INSERT OR UPDATE OR DELETE ON profiles FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();
CREATE TRIGGER audit_policies AFTER INSERT OR UPDATE OR DELETE ON policies FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();
CREATE TRIGGER audit_collections AFTER INSERT OR UPDATE OR DELETE ON collections FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();
CREATE TRIGGER audit_clients AFTER INSERT OR UPDATE OR DELETE ON clients FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();
CREATE TRIGGER audit_branches AFTER INSERT OR UPDATE OR DELETE ON branches FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

-- Auto collection generation trigger
CREATE TRIGGER generate_collections_on_policy_insert AFTER INSERT ON policies FOR EACH ROW EXECUTE FUNCTION generate_policy_collections();

-- Target update triggers
CREATE TRIGGER update_target_on_collection_change AFTER UPDATE ON collections FOR EACH ROW EXECUTE FUNCTION update_target_on_collection();
CREATE TRIGGER update_target_on_policy_insert AFTER INSERT ON policies FOR EACH ROW EXECUTE FUNCTION update_target_on_policy();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizational_hierarchy ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE month_closing ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- RLS POLICIES (simplified for space - see migrations for full policies)
-- ============================================================

-- Profiles policies
DROP POLICY IF EXISTS "profiles_select_super_admin" ON profiles;
CREATE POLICY "profiles_select_super_admin" ON profiles FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin')
    OR auth.uid() = id
    OR EXISTS (SELECT 1 FROM get_user_descendants(auth.uid()) WHERE id = profiles.id)
    OR EXISTS (SELECT 1 FROM get_user_ancestors(auth.uid()) WHERE id = profiles.id));

DROP POLICY IF EXISTS "profiles_insert_authenticated" ON profiles;
CREATE POLICY "profiles_insert_authenticated" ON profiles FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('super_admin', 'development_manager', 'general_supervisor', 'supervisor', 'group_leader')));

DROP POLICY IF EXISTS "profiles_update_authenticated" ON profiles;
CREATE POLICY "profiles_update_authenticated" ON profiles FOR UPDATE TO authenticated
  USING (auth.uid() = id OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('super_admin', 'development_manager')) OR EXISTS (SELECT 1 FROM get_user_descendants(auth.uid()) WHERE id = profiles.id))
  WITH CHECK (auth.uid() = id OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('super_admin', 'development_manager')) OR EXISTS (SELECT 1 FROM get_user_descendants(auth.uid()) WHERE id = profiles.id));

DROP POLICY IF EXISTS "profiles_delete_authenticated" ON profiles;
CREATE POLICY "profiles_delete_authenticated" ON profiles FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('super_admin', 'development_manager')));

-- Branches policies
DROP POLICY IF EXISTS "branches_select_authenticated" ON branches;
CREATE POLICY "branches_select_authenticated" ON branches FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "branches_insert_authenticated" ON branches;
CREATE POLICY "branches_insert_authenticated" ON branches FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('super_admin', 'development_manager')));
DROP POLICY IF EXISTS "branches_update_authenticated" ON branches;
CREATE POLICY "branches_update_authenticated" ON branches FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('super_admin', 'development_manager')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('super_admin', 'development_manager')));
DROP POLICY IF EXISTS "branches_delete_authenticated" ON branches;
CREATE POLICY "branches_delete_authenticated" ON branches FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin'));

-- Organizational hierarchy policies
DROP POLICY IF EXISTS "org_hierarchy_select_authenticated" ON organizational_hierarchy;
CREATE POLICY "org_hierarchy_select_authenticated" ON organizational_hierarchy FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "org_hierarchy_insert_authenticated" ON organizational_hierarchy;
CREATE POLICY "org_hierarchy_insert_authenticated" ON organizational_hierarchy FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('super_admin', 'development_manager', 'general_supervisor', 'supervisor', 'group_leader')));
DROP POLICY IF EXISTS "org_hierarchy_update_authenticated" ON organizational_hierarchy;
CREATE POLICY "org_hierarchy_update_authenticated" ON organizational_hierarchy FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('super_admin', 'development_manager', 'general_supervisor', 'supervisor', 'group_leader')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('super_admin', 'development_manager', 'general_supervisor', 'supervisor', 'group_leader')));
DROP POLICY IF EXISTS "org_hierarchy_delete_authenticated" ON organizational_hierarchy;
CREATE POLICY "org_hierarchy_delete_authenticated" ON organizational_hierarchy FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('super_admin', 'development_manager')));

-- Clients policies
DROP POLICY IF EXISTS "clients_select_authenticated" ON clients;
CREATE POLICY "clients_select_authenticated" ON clients FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin') OR agent_id = auth.uid() OR EXISTS (SELECT 1 FROM get_user_descendants(auth.uid()) d WHERE d.id = clients.agent_id));
DROP POLICY IF EXISTS "clients_insert_authenticated" ON clients;
CREATE POLICY "clients_insert_authenticated" ON clients FOR INSERT TO authenticated
  WITH CHECK (agent_id = auth.uid() OR EXISTS (SELECT 1 FROM get_user_descendants(auth.uid()) d WHERE d.id = agent_id));
DROP POLICY IF EXISTS "clients_update_authenticated" ON clients;
CREATE POLICY "clients_update_authenticated" ON clients FOR UPDATE TO authenticated
  USING (agent_id = auth.uid() OR EXISTS (SELECT 1 FROM get_user_descendants(auth.uid()) d WHERE d.id = clients.agent_id))
  WITH CHECK (agent_id = auth.uid() OR EXISTS (SELECT 1 FROM get_user_descendants(auth.uid()) d WHERE d.id = agent_id));
DROP POLICY IF EXISTS "clients_delete_authenticated" ON clients;
CREATE POLICY "clients_delete_authenticated" ON clients FOR DELETE TO authenticated
  USING (agent_id = auth.uid() OR EXISTS (SELECT 1 FROM get_user_descendants(auth.uid()) d WHERE d.id = clients.agent_id));

-- Policies policies
DROP POLICY IF EXISTS "policies_select_authenticated" ON policies;
CREATE POLICY "policies_select_authenticated" ON policies FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin') OR agent_id = auth.uid() OR EXISTS (SELECT 1 FROM get_user_descendants(auth.uid()) d WHERE d.id = policies.agent_id));
DROP POLICY IF EXISTS "policies_insert_authenticated" ON policies;
CREATE POLICY "policies_insert_authenticated" ON policies FOR INSERT TO authenticated
  WITH CHECK (agent_id = auth.uid() OR EXISTS (SELECT 1 FROM get_user_descendants(auth.uid()) d WHERE d.id = agent_id));
DROP POLICY IF EXISTS "policies_update_authenticated" ON policies;
CREATE POLICY "policies_update_authenticated" ON policies FOR UPDATE TO authenticated
  USING (agent_id = auth.uid() OR EXISTS (SELECT 1 FROM get_user_descendants(auth.uid()) d WHERE d.id = policies.agent_id))
  WITH CHECK (agent_id = auth.uid() OR EXISTS (SELECT 1 FROM get_user_descendants(auth.uid()) d WHERE d.id = agent_id));
DROP POLICY IF EXISTS "policies_delete_authenticated" ON policies;
CREATE POLICY "policies_delete_authenticated" ON policies FOR DELETE TO authenticated
  USING (agent_id = auth.uid() OR EXISTS (SELECT 1 FROM get_user_descendants(auth.uid()) d WHERE d.id = policies.agent_id));

-- Collections policies
DROP POLICY IF EXISTS "collections_select_authenticated" ON collections;
CREATE POLICY "collections_select_authenticated" ON collections FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin') OR agent_id = auth.uid() OR EXISTS (SELECT 1 FROM get_user_descendants(auth.uid()) d WHERE d.id = collections.agent_id));
DROP POLICY IF EXISTS "collections_insert_authenticated" ON collections;
CREATE POLICY "collections_insert_authenticated" ON collections FOR INSERT TO authenticated
  WITH CHECK (agent_id = auth.uid() OR EXISTS (SELECT 1 FROM get_user_descendants(auth.uid()) d WHERE d.id = agent_id));
DROP POLICY IF EXISTS "collections_update_authenticated" ON collections;
CREATE POLICY "collections_update_authenticated" ON collections FOR UPDATE TO authenticated
  USING (agent_id = auth.uid() OR EXISTS (SELECT 1 FROM get_user_descendants(auth.uid()) d WHERE d.id = collections.agent_id))
  WITH CHECK (agent_id = auth.uid() OR EXISTS (SELECT 1 FROM get_user_descendants(auth.uid()) d WHERE d.id = agent_id));
DROP POLICY IF EXISTS "collections_delete_authenticated" ON collections;
CREATE POLICY "collections_delete_authenticated" ON collections FOR DELETE TO authenticated
  USING (agent_id = auth.uid() OR EXISTS (SELECT 1 FROM get_user_descendants(auth.uid()) d WHERE d.id = collections.agent_id));

-- Targets policies
DROP POLICY IF EXISTS "targets_select_authenticated" ON targets;
CREATE POLICY "targets_select_authenticated" ON targets FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin') OR user_id = auth.uid() OR EXISTS (SELECT 1 FROM get_user_descendants(auth.uid()) d WHERE d.id = targets.user_id));
DROP POLICY IF EXISTS "targets_insert_authenticated" ON targets;
CREATE POLICY "targets_insert_authenticated" ON targets FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR EXISTS (SELECT 1 FROM get_user_descendants(auth.uid()) d WHERE d.id = user_id));
DROP POLICY IF EXISTS "targets_update_authenticated" ON targets;
CREATE POLICY "targets_update_authenticated" ON targets FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR EXISTS (SELECT 1 FROM get_user_descendants(auth.uid()) d WHERE d.id = targets.user_id))
  WITH CHECK (user_id = auth.uid() OR EXISTS (SELECT 1 FROM get_user_descendants(auth.uid()) d WHERE d.id = user_id));
DROP POLICY IF EXISTS "targets_delete_authenticated" ON targets;
CREATE POLICY "targets_delete_authenticated" ON targets FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR EXISTS (SELECT 1 FROM get_user_descendants(auth.uid()) d WHERE d.id = targets.user_id));

-- Notifications policies
DROP POLICY IF EXISTS "notifications_select_authenticated" ON notifications;
CREATE POLICY "notifications_select_authenticated" ON notifications FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS "notifications_insert_authenticated" ON notifications;
CREATE POLICY "notifications_insert_authenticated" ON notifications FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR EXISTS (SELECT 1 FROM get_user_descendants(auth.uid()) d WHERE d.id = user_id));
DROP POLICY IF EXISTS "notifications_update_authenticated" ON notifications;
CREATE POLICY "notifications_update_authenticated" ON notifications FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "notifications_delete_authenticated" ON notifications;
CREATE POLICY "notifications_delete_authenticated" ON notifications FOR DELETE TO authenticated USING (user_id = auth.uid());

-- Tasks policies
DROP POLICY IF EXISTS "tasks_select_authenticated" ON tasks;
CREATE POLICY "tasks_select_authenticated" ON tasks FOR SELECT TO authenticated
  USING (assigned_to = auth.uid() OR assigned_by = auth.uid() OR EXISTS (SELECT 1 FROM get_user_descendants(auth.uid()) d WHERE d.id = tasks.assigned_to));
DROP POLICY IF EXISTS "tasks_insert_authenticated" ON tasks;
CREATE POLICY "tasks_insert_authenticated" ON tasks FOR INSERT TO authenticated
  WITH CHECK (assigned_by = auth.uid() OR EXISTS (SELECT 1 FROM get_user_descendants(auth.uid()) d WHERE d.id = assigned_to));
DROP POLICY IF EXISTS "tasks_update_authenticated" ON tasks;
CREATE POLICY "tasks_update_authenticated" ON tasks FOR UPDATE TO authenticated
  USING (assigned_to = auth.uid() OR assigned_by = auth.uid() OR EXISTS (SELECT 1 FROM get_user_descendants(auth.uid()) d WHERE d.id = tasks.assigned_to))
  WITH CHECK (assigned_to = auth.uid() OR assigned_by = auth.uid() OR EXISTS (SELECT 1 FROM get_user_descendants(auth.uid()) d WHERE d.id = assigned_to));
DROP POLICY IF EXISTS "tasks_delete_authenticated" ON tasks;
CREATE POLICY "tasks_delete_authenticated" ON tasks FOR DELETE TO authenticated
  USING (assigned_by = auth.uid() OR EXISTS (SELECT 1 FROM get_user_descendants(auth.uid()) d WHERE d.id = tasks.assigned_to));

-- Audit log policies
DROP POLICY IF EXISTS "audit_log_select_authenticated" ON audit_log;
CREATE POLICY "audit_log_select_authenticated" ON audit_log FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin'));
DROP POLICY IF EXISTS "audit_log_insert_authenticated" ON audit_log;
CREATE POLICY "audit_log_insert_authenticated" ON audit_log FOR INSERT TO authenticated WITH CHECK (true);

-- Month closing policies
DROP POLICY IF EXISTS "month_closing_select_authenticated" ON month_closing;
CREATE POLICY "month_closing_select_authenticated" ON month_closing FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "month_closing_insert_authenticated" ON month_closing;
CREATE POLICY "month_closing_insert_authenticated" ON month_closing FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('super_admin', 'development_manager')));
DROP POLICY IF EXISTS "month_closing_update_authenticated" ON month_closing;
CREATE POLICY "month_closing_update_authenticated" ON month_closing FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin'));
DROP POLICY IF EXISTS "month_closing_delete_authenticated" ON month_closing;
CREATE POLICY "month_closing_delete_authenticated" ON month_closing FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin'));

-- System settings policies
DROP POLICY IF EXISTS "settings_select_authenticated" ON system_settings;
CREATE POLICY "settings_select_authenticated" ON system_settings FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "settings_insert_authenticated" ON system_settings;
CREATE POLICY "settings_insert_authenticated" ON system_settings FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin'));
DROP POLICY IF EXISTS "settings_update_authenticated" ON system_settings;
CREATE POLICY "settings_update_authenticated" ON system_settings FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin'));
DROP POLICY IF EXISTS "settings_delete_authenticated" ON system_settings;
CREATE POLICY "settings_delete_authenticated" ON system_settings FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin'));

-- ============================================================
-- VIEWS
-- ============================================================

CREATE OR REPLACE VIEW active_policies_view AS
SELECT p.id, p.policy_number, p.policy_type, p.premium_amount, p.monthly_premium,
  p.issue_date, p.start_date, p.end_date, p.status,
  c.full_name AS client_name, c.phone AS client_phone, c.mobile AS client_mobile,
  a.full_name AS agent_name, a.email AS agent_email,
  b.name AS branch_name, b.code AS branch_code
FROM policies p
JOIN clients c ON p.client_id = c.id
JOIN profiles a ON p.agent_id = a.id
JOIN branches b ON p.branch_id = b.id;

CREATE OR REPLACE VIEW pending_collections_view AS
SELECT c.id, c.collection_number, c.amount, c.due_date, c.status,
  p.policy_number, p.policy_type,
  cl.full_name AS client_name, cl.phone AS client_phone, cl.mobile AS client_mobile,
  a.full_name AS agent_name, b.name AS branch_name
FROM collections c
JOIN policies p ON c.policy_id = p.id
JOIN clients cl ON c.client_id = cl.id
JOIN profiles a ON c.agent_id = a.id
JOIN branches b ON c.branch_id = b.id
WHERE c.status = 'pending'
ORDER BY c.due_date;

CREATE OR REPLACE VIEW targets_view AS
SELECT t.id, t.user_id, p.full_name AS user_name, p.role AS user_role, b.name AS branch_name,
  t.year, t.month, t.target_amount, t.achieved_amount,
  t.target_policies, t.achieved_policies, t.target_collections, t.achieved_collections,
  CASE WHEN t.target_amount > 0 THEN ROUND((t.achieved_amount / t.target_amount) * 100, 2) ELSE 0 END AS achievement_percentage
FROM targets t
JOIN profiles p ON t.user_id = p.id
LEFT JOIN branches b ON t.branch_id = b.id;

CREATE OR REPLACE VIEW org_chart_view AS
SELECT oh.id, oh.user_id, p.full_name AS user_name, p.email, p.role,
  b.name AS branch_name, oh.parent_id, pp.full_name AS parent_name, pp.role AS parent_role, oh.level
FROM organizational_hierarchy oh
JOIN profiles p ON oh.user_id = p.id
LEFT JOIN profiles pp ON oh.parent_id = pp.id
LEFT JOIN branches b ON p.branch_id = b.id
ORDER BY oh.level, p.full_name;

-- ============================================================
-- SEED DATA
-- ============================================================

-- Default system settings
INSERT INTO system_settings (key, value, description) VALUES
  ('company_name', 'شركة التأمين على الحياة', 'Company name'),
  ('currency', 'SAR', 'Default currency'),
  ('default_target_dm', '750000', 'Default monthly target for Development Manager'),
  ('default_target_gs', '240000', 'Default monthly target for General Supervisor'),
  ('first_year_only', 'true', 'Track first year only for policies'),
  ('notifications_enabled', 'true', 'Enable system notifications')
ON CONFLICT (key) DO NOTHING;

-- Default branches
INSERT INTO branches (id, name, code, region, address, phone, email, is_active) VALUES
  ('11111111-1111-1111-1111-111111111001', 'المركز الرئيسي', 'HQ001', 'الرياض', 'شارع الملك فهد، الرياض', '0112345678', 'main@insurance.com', true),
  ('11111111-1111-1111-1111-111111111002', 'فرع الرياض', 'RYD001', 'الرياض', 'شارع العليا، الرياض', '0112345679', 'riyadh@insurance.com', true),
  ('11111111-1111-1111-1111-111111111003', 'فرع جدة', 'JED001', 'جدة', 'شارع التحلية، جدة', '0129876543', 'jeddah@insurance.com', true)
ON CONFLICT (id) DO NOTHING;

-- Default auth users (password: 123456)
INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_change_token_new, recovery_token)
VALUES
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-2222-2222-222222222001', 'authenticated', 'authenticated', 'ahmed.mohamed@insurance.com', crypt('123456', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"أحمد محمد"}', now(), now(), '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-2222-2222-222222222002', 'authenticated', 'authenticated', 'abdullah.saad@insurance.com', crypt('123456', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"عبدالله سعد"}', now(), now(), '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-2222-2222-222222222003', 'authenticated', 'authenticated', 'fahad.abdulaziz@insurance.com', crypt('123456', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"فهد عبدالعزيز"}', now(), now(), '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-2222-2222-222222222004', 'authenticated', 'authenticated', 'sultan.khalid@insurance.com', crypt('123456', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"سلطان خالد"}', now(), now(), '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-2222-2222-222222222005', 'authenticated', 'authenticated', 'majed.fahad@insurance.com', crypt('123456', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"ماجد فهد"}', now(), now(), '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-2222-2222-222222222006', 'authenticated', 'authenticated', 'nasser.mohamed@insurance.com', crypt('123456', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"ناصر محمد"}', now(), now(), '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-2222-2222-222222222007', 'authenticated', 'authenticated', 'omar.saud@insurance.com', crypt('123456', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"عمر سعود"}', now(), now(), '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-2222-2222-222222222008', 'authenticated', 'authenticated', 'khaled.ahmed@insurance.com', crypt('123456', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"خالد أحمد"}', now(), now(), '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-2222-2222-222222222009', 'authenticated', 'authenticated', 'faisal.salman@insurance.com', crypt('123456', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"فيصل سلمان"}', now(), now(), '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-2222-2222-222222222010', 'authenticated', 'authenticated', 'rashed.mohamed@insurance.com', crypt('123456', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"راشد محمد"}', now(), now(), '', '', '')
ON CONFLICT (id) DO NOTHING;

-- Create identities
INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
SELECT gen_random_uuid(), id, email, jsonb_build_object('sub', id, 'email', email), 'email', now(), now(), now()
FROM auth.users WHERE NOT EXISTS (SELECT 1 FROM auth.identities WHERE "user_id" = auth.users.id);

-- Create sessions
INSERT INTO auth.sessions (id, user_id, created_at, updated_at)
SELECT gen_random_uuid(), id, now(), now()
FROM auth.users WHERE NOT EXISTS (SELECT 1 FROM auth.sessions WHERE "user_id" = auth.users.id);

-- Default profiles
INSERT INTO profiles (id, email, full_name, role, branch_id, is_active, hire_date) VALUES
  ('22222222-2222-2222-2222-222222222001', 'ahmed.mohamed@insurance.com', 'أحمد محمد', 'super_admin', NULL, true, '2020-01-01'),
  ('22222222-2222-2222-2222-222222222002', 'abdullah.saad@insurance.com', 'عبدالله سعد', 'development_manager', '11111111-1111-1111-1111-111111111001', true, '2020-02-01'),
  ('22222222-2222-2222-2222-222222222003', 'fahad.abdulaziz@insurance.com', 'فهد عبدالعزيز', 'general_supervisor', '11111111-1111-1111-1111-111111111001', true, '2020-03-01'),
  ('22222222-2222-2222-2222-222222222004', 'sultan.khalid@insurance.com', 'سلطان خالد', 'general_supervisor', '11111111-1111-1111-1111-111111111002', true, '2020-04-01'),
  ('22222222-2222-2222-2222-222222222005', 'majed.fahad@insurance.com', 'ماجد فهد', 'supervisor', '11111111-1111-1111-1111-111111111001', true, '2020-05-01'),
  ('22222222-2222-2222-2222-222222222006', 'nasser.mohamed@insurance.com', 'ناصر محمد', 'supervisor', '11111111-1111-1111-1111-111111111002', true, '2020-06-01'),
  ('22222222-2222-2222-2222-222222222007', 'omar.saud@insurance.com', 'عمر سعود', 'group_leader', '11111111-1111-1111-1111-111111111001', true, '2020-07-01'),
  ('22222222-2222-2222-2222-222222222008', 'khaled.ahmed@insurance.com', 'خالد أحمد', 'agent', '11111111-1111-1111-1111-111111111001', true, '2020-08-01'),
  ('22222222-2222-2222-2222-222222222009', 'faisal.salman@insurance.com', 'فيصل سلمان', 'agent', '11111111-1111-1111-1111-111111111001', true, '2020-09-01'),
  ('22222222-2222-2222-2222-222222222010', 'rashed.mohamed@insurance.com', 'راشد محمد', 'agent', '11111111-1111-1111-1111-111111111002', true, '2020-10-01')
ON CONFLICT (id) DO NOTHING;

-- Update branch managers
UPDATE branches SET manager_id = '22222222-2222-2222-2222-222222222002' WHERE id = '11111111-1111-1111-1111-111111111001';
UPDATE branches SET manager_id = '22222222-2222-2222-2222-222222222004' WHERE id = '11111111-1111-1111-1111-111111111002';

-- Organizational hierarchy
INSERT INTO organizational_hierarchy (user_id, parent_id, level) VALUES
  ('22222222-2222-2222-2222-222222222001', NULL, 0),
  ('22222222-2222-2222-2222-222222222002', '22222222-2222-2222-2222-222222222001', 1),
  ('22222222-2222-2222-2222-222222222003', '22222222-2222-2222-2222-222222222002', 2),
  ('22222222-2222-2222-2222-222222222004', '22222222-2222-2222-2222-222222222002', 2),
  ('22222222-2222-2222-2222-222222222005', '22222222-2222-2222-2222-222222222003', 3),
  ('22222222-2222-2222-2222-222222222006', '22222222-2222-2222-2222-222222222004', 3),
  ('22222222-2222-2222-2222-222222222007', '22222222-2222-2222-2222-222222222005', 4),
  ('22222222-2222-2222-2222-222222222008', '22222222-2222-2222-2222-222222222007', 5),
  ('22222222-2222-2222-2222-222222222009', '22222222-2222-2222-2222-222222222007', 5),
  ('22222222-2222-2222-2222-222222222010', '22222222-2222-2222-2222-222222222006', 4)
ON CONFLICT (user_id) DO NOTHING;

-- Default targets
INSERT INTO targets (user_id, branch_id, year, month, target_type, target_amount)
VALUES ('22222222-2222-2222-2222-222222222002', '11111111-1111-1111-1111-111111111001', EXTRACT(YEAR FROM now())::INTEGER, EXTRACT(MONTH FROM now())::INTEGER, 'premium', 750000)
ON CONFLICT (user_id, year, month, target_type) DO NOTHING;

INSERT INTO targets (user_id, branch_id, year, month, target_type, target_amount)
VALUES ('22222222-2222-2222-2222-222222222003', '11111111-1111-1111-1111-111111111001', EXTRACT(YEAR FROM now())::INTEGER, EXTRACT(MONTH FROM now())::INTEGER, 'premium', 240000)
ON CONFLICT (user_id, year, month, target_type) DO NOTHING;

INSERT INTO targets (user_id, branch_id, year, month, target_type, target_amount)
VALUES ('22222222-2222-2222-2222-222222222004', '11111111-1111-1111-1111-111111111002', EXTRACT(YEAR FROM now())::INTEGER, EXTRACT(MONTH FROM now())::INTEGER, 'premium', 240000)
ON CONFLICT (user_id, year, month, target_type) DO NOTHING;

-- Grant permissions
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated;

-- ============================================================
-- END OF BACKUP
-- ============================================================
