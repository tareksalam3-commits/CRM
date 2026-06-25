/*
# Life Insurance Sales CRM - Initial Schema

## Overview
This migration creates the complete database schema for the Life Insurance Sales CRM system.
The system supports multi-tenant branch-based organization with hierarchical role-based access control.

## New Tables

### 1. roles
- Defines system roles: Super Admin, Development Manager, General Supervisor, Supervisor, Group Leader, Agent
- Each role has specific permissions and hierarchy level

### 2. branches
- Branch offices/offices in the organization
- Each branch has a manager and regional information

### 3. profiles
- Extended user information linked to auth.users
- Contains role, branch assignment, and hierarchical relationships

### 4. organizational_hierarchy
- Defines the hierarchical structure between users
- Supports the chain: Director → Development Manager → General Supervisor → Supervisor → Group Leader → Agent

### 5. clients
- Insurance clients/customers
- Linked to agents who manage them
- Contains personal and contact information

### 6. policies
- Insurance policies issued to clients
- First year only tracking
- Premium amounts, issue dates, status

### 7. collections
- Premium collections/payments
- Periodic installments for first year
- Payment tracking and status

### 8. targets
- Monthly/annual targets for users
- Supports different target types (premium, policies, collections)
- Tracks achievement percentage

### 9. notifications
- System notifications for users
- Supports different notification types and priorities

### 10. tasks
- Tasks assigned to users
- Due dates, priorities, status tracking

### 11. audit_log
- System-wide audit trail
- Tracks all create, update, delete operations
- User identification and timestamps

### 12. month_closing
- Monthly closing records
- Locks data for completed periods

### 13. system_settings
- System-wide configuration settings
- Key-value pairs for various settings

## Security
- RLS enabled on all tables
- Policies enforce data isolation based on user role and hierarchy
- Users can only access data within their permission scope

## Notes
1. All tables use UUID primary keys with gen_random_uuid()
2. Timestamps track creation and modification times
3. Hierarchical data access through recursive CTEs
4. Insurance rules: First year only, New = issued this month with first installment
*/

-- Enable UUID extension if not exists
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- ENUMS
-- ============================================

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

-- ============================================
-- TABLES
-- ============================================

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

-- ============================================
-- INDEXES
-- ============================================

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

-- ============================================
-- FUNCTIONS
-- ============================================

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
    -- Base case: the user itself
    SELECT p.id, p.email, p.full_name, p.role, p.branch_id, 0 AS level
    FROM profiles p
    WHERE p.id = user_uuid
    
    UNION ALL
    
    -- Recursive case: direct reports
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
    -- Base case: the user itself
    SELECT p.id, p.email, p.full_name, p.role, p.branch_id, 0 AS level
    FROM profiles p
    WHERE p.id = user_uuid
    
    UNION ALL
    
    -- Recursive case: managers
    SELECT p.id, p.email, p.full_name, p.role, p.branch_id, a.level + 1
    FROM profiles p
    JOIN organizational_hierarchy oh ON oh.parent_id = p.id
    JOIN ancestors a ON oh.user_id = a.id
  )
  SELECT * FROM ancestors ORDER BY level DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if user A can access user B's data
CREATE OR REPLACE FUNCTION can_user_access(target_user_uuid UUID, requesting_user_uuid UUID)
RETURNS BOOLEAN AS $$
DECLARE
  requesting_role user_role;
  requesting_branch UUID;
  target_branch UUID;
  is_descendant BOOLEAN;
BEGIN
  -- Get requesting user's info
  SELECT role, branch_id INTO requesting_role, requesting_branch
  FROM profiles WHERE id = requesting_user_uuid;
  
  -- Get target user's branch
  SELECT branch_id INTO target_branch
  FROM profiles WHERE id = target_user_uuid;
  
  -- Super admin can access everything
  IF requesting_role = 'super_admin' THEN
    RETURN true;
  END IF;
  
  -- Development Manager can access all users in their branch and below
  IF requesting_role = 'development_manager' THEN
    RETURN requesting_branch = target_branch OR EXISTS (
      SELECT 1 FROM get_user_descendants(requesting_user_uuid) WHERE id = target_user_uuid
    );
  END IF;
  
  -- Other roles: check if target is a descendant
  SELECT EXISTS (
    SELECT 1 FROM get_user_descendants(requesting_user_uuid) WHERE id = target_user_uuid
  ) INTO is_descendant;
  
  RETURN is_descendant;
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

-- ============================================
-- TRIGGERS
-- ============================================

-- Trigger to update updated_at on profiles
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Trigger to update updated_at on branches
CREATE TRIGGER update_branches_updated_at
  BEFORE UPDATE ON branches
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Trigger to update updated_at on clients
CREATE TRIGGER update_clients_updated_at
  BEFORE UPDATE ON clients
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Trigger to update updated_at on policies
CREATE TRIGGER update_policies_updated_at
  BEFORE UPDATE ON policies
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Trigger to update updated_at on collections
CREATE TRIGGER update_collections_updated_at
  BEFORE UPDATE ON collections
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Trigger to update updated_at on targets
CREATE TRIGGER update_targets_updated_at
  BEFORE UPDATE ON targets
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Trigger to update updated_at on tasks
CREATE TRIGGER update_tasks_updated_at
  BEFORE UPDATE ON tasks
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Trigger to update updated_at on organizational_hierarchy
CREATE TRIGGER update_org_hierarchy_updated_at
  BEFORE UPDATE ON organizational_hierarchy
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Trigger to update updated_at on system_settings
CREATE TRIGGER update_settings_updated_at
  BEFORE UPDATE ON system_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

-- Enable RLS on all tables
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

-- ============================================
-- PROFILES POLICIES
-- ============================================

-- Super admin can see all profiles
DROP POLICY IF EXISTS "profiles_select_super_admin" ON profiles;
CREATE POLICY "profiles_select_super_admin" ON profiles FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin'
    )
    OR
    -- Users can see their own profile
    auth.uid() = id
    OR
    -- Users can see profiles in their hierarchy (descendants)
    EXISTS (
      SELECT 1 FROM get_user_descendants(auth.uid()) WHERE id = profiles.id
    )
    OR
    -- Users can see their managers (ancestors)
    EXISTS (
      SELECT 1 FROM get_user_ancestors(auth.uid()) WHERE id = profiles.id
    )
  );

DROP POLICY IF EXISTS "profiles_insert_authenticated" ON profiles;
CREATE POLICY "profiles_insert_authenticated" ON profiles FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('super_admin', 'development_manager', 'general_supervisor', 'supervisor', 'group_leader')
    )
  );

DROP POLICY IF EXISTS "profiles_update_authenticated" ON profiles;
CREATE POLICY "profiles_update_authenticated" ON profiles FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = id
    OR
    EXISTS (
      SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('super_admin', 'development_manager')
    )
    OR
    EXISTS (
      SELECT 1 FROM get_user_descendants(auth.uid()) WHERE id = profiles.id
    )
  )
  WITH CHECK (
    auth.uid() = id
    OR
    EXISTS (
      SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('super_admin', 'development_manager')
    )
    OR
    EXISTS (
      SELECT 1 FROM get_user_descendants(auth.uid()) WHERE id = profiles.id
    )
  );

DROP POLICY IF EXISTS "profiles_delete_authenticated" ON profiles;
CREATE POLICY "profiles_delete_authenticated" ON profiles FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('super_admin', 'development_manager')
    )
  );

-- ============================================
-- BRANCHES POLICIES
-- ============================================

DROP POLICY IF EXISTS "branches_select_authenticated" ON branches;
CREATE POLICY "branches_select_authenticated" ON branches FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "branches_insert_authenticated" ON branches;
CREATE POLICY "branches_insert_authenticated" ON branches FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('super_admin', 'development_manager')
    )
  );

DROP POLICY IF EXISTS "branches_update_authenticated" ON branches;
CREATE POLICY "branches_update_authenticated" ON branches FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('super_admin', 'development_manager')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('super_admin', 'development_manager')
    )
  );

DROP POLICY IF EXISTS "branches_delete_authenticated" ON branches;
CREATE POLICY "branches_delete_authenticated" ON branches FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin'
    )
  );

-- ============================================
-- ORGANIZATIONAL HIERARCHY POLICIES
-- ============================================

DROP POLICY IF EXISTS "org_hierarchy_select_authenticated" ON organizational_hierarchy;
CREATE POLICY "org_hierarchy_select_authenticated" ON organizational_hierarchy FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "org_hierarchy_insert_authenticated" ON organizational_hierarchy;
CREATE POLICY "org_hierarchy_insert_authenticated" ON organizational_hierarchy FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('super_admin', 'development_manager', 'general_supervisor', 'supervisor', 'group_leader')
    )
  );

DROP POLICY IF EXISTS "org_hierarchy_update_authenticated" ON organizational_hierarchy;
CREATE POLICY "org_hierarchy_update_authenticated" ON organizational_hierarchy FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('super_admin', 'development_manager', 'general_supervisor', 'supervisor', 'group_leader')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('super_admin', 'development_manager', 'general_supervisor', 'supervisor', 'group_leader')
    )
  );

DROP POLICY IF EXISTS "org_hierarchy_delete_authenticated" ON organizational_hierarchy;
CREATE POLICY "org_hierarchy_delete_authenticated" ON organizational_hierarchy FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('super_admin', 'development_manager')
    )
  );

-- ============================================
-- CLIENTS POLICIES
-- ============================================

DROP POLICY IF EXISTS "clients_select_authenticated" ON clients;
CREATE POLICY "clients_select_authenticated" ON clients FOR SELECT
  TO authenticated
  USING (
    -- Super admin sees all
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin')
    OR
    -- User sees own clients
    agent_id = auth.uid()
    OR
    -- User sees team clients (descendants)
    EXISTS (
      SELECT 1 FROM get_user_descendants(auth.uid()) d WHERE d.id = clients.agent_id
    )
  );

DROP POLICY IF EXISTS "clients_insert_authenticated" ON clients;
CREATE POLICY "clients_insert_authenticated" ON clients FOR INSERT
  TO authenticated
  WITH CHECK (
    agent_id = auth.uid()
    OR
    EXISTS (
      SELECT 1 FROM get_user_descendants(auth.uid()) d WHERE d.id = agent_id
    )
  );

DROP POLICY IF EXISTS "clients_update_authenticated" ON clients;
CREATE POLICY "clients_update_authenticated" ON clients FOR UPDATE
  TO authenticated
  USING (
    agent_id = auth.uid()
    OR
    EXISTS (
      SELECT 1 FROM get_user_descendants(auth.uid()) d WHERE d.id = clients.agent_id
    )
  )
  WITH CHECK (
    agent_id = auth.uid()
    OR
    EXISTS (
      SELECT 1 FROM get_user_descendants(auth.uid()) d WHERE d.id = agent_id
    )
  );

DROP POLICY IF EXISTS "clients_delete_authenticated" ON clients;
CREATE POLICY "clients_delete_authenticated" ON clients FOR DELETE
  TO authenticated
  USING (
    agent_id = auth.uid()
    OR
    EXISTS (
      SELECT 1 FROM get_user_descendants(auth.uid()) d WHERE d.id = clients.agent_id
    )
  );

-- ============================================
-- POLICIES (Insurance Policies) POLICIES
-- ============================================

DROP POLICY IF EXISTS "policies_select_authenticated" ON policies;
CREATE POLICY "policies_select_authenticated" ON policies FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin')
    OR
    agent_id = auth.uid()
    OR
    EXISTS (
      SELECT 1 FROM get_user_descendants(auth.uid()) d WHERE d.id = policies.agent_id
    )
  );

DROP POLICY IF EXISTS "policies_insert_authenticated" ON policies;
CREATE POLICY "policies_insert_authenticated" ON policies FOR INSERT
  TO authenticated
  WITH CHECK (
    agent_id = auth.uid()
    OR
    EXISTS (
      SELECT 1 FROM get_user_descendants(auth.uid()) d WHERE d.id = agent_id
    )
  );

DROP POLICY IF EXISTS "policies_update_authenticated" ON policies;
CREATE POLICY "policies_update_authenticated" ON policies FOR UPDATE
  TO authenticated
  USING (
    agent_id = auth.uid()
    OR
    EXISTS (
      SELECT 1 FROM get_user_descendants(auth.uid()) d WHERE d.id = policies.agent_id
    )
  )
  WITH CHECK (
    agent_id = auth.uid()
    OR
    EXISTS (
      SELECT 1 FROM get_user_descendants(auth.uid()) d WHERE d.id = agent_id
    )
  );

DROP POLICY IF EXISTS "policies_delete_authenticated" ON policies;
CREATE POLICY "policies_delete_authenticated" ON policies FOR DELETE
  TO authenticated
  USING (
    agent_id = auth.uid()
    OR
    EXISTS (
      SELECT 1 FROM get_user_descendants(auth.uid()) d WHERE d.id = policies.agent_id
    )
  );

-- ============================================
-- COLLECTIONS POLICIES
-- ============================================

DROP POLICY IF EXISTS "collections_select_authenticated" ON collections;
CREATE POLICY "collections_select_authenticated" ON collections FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin')
    OR
    agent_id = auth.uid()
    OR
    EXISTS (
      SELECT 1 FROM get_user_descendants(auth.uid()) d WHERE d.id = collections.agent_id
    )
  );

DROP POLICY IF EXISTS "collections_insert_authenticated" ON collections;
CREATE POLICY "collections_insert_authenticated" ON collections FOR INSERT
  TO authenticated
  WITH CHECK (
    agent_id = auth.uid()
    OR
    EXISTS (
      SELECT 1 FROM get_user_descendants(auth.uid()) d WHERE d.id = agent_id
    )
  );

DROP POLICY IF EXISTS "collections_update_authenticated" ON collections;
CREATE POLICY "collections_update_authenticated" ON collections FOR UPDATE
  TO authenticated
  USING (
    agent_id = auth.uid()
    OR
    EXISTS (
      SELECT 1 FROM get_user_descendants(auth.uid()) d WHERE d.id = collections.agent_id
    )
  )
  WITH CHECK (
    agent_id = auth.uid()
    OR
    EXISTS (
      SELECT 1 FROM get_user_descendants(auth.uid()) d WHERE d.id = agent_id
    )
  );

DROP POLICY IF EXISTS "collections_delete_authenticated" ON collections;
CREATE POLICY "collections_delete_authenticated" ON collections FOR DELETE
  TO authenticated
  USING (
    agent_id = auth.uid()
    OR
    EXISTS (
      SELECT 1 FROM get_user_descendants(auth.uid()) d WHERE d.id = collections.agent_id
    )
  );

-- ============================================
-- TARGETS POLICIES
-- ============================================

DROP POLICY IF EXISTS "targets_select_authenticated" ON targets;
CREATE POLICY "targets_select_authenticated" ON targets FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin')
    OR
    user_id = auth.uid()
    OR
    EXISTS (
      SELECT 1 FROM get_user_descendants(auth.uid()) d WHERE d.id = targets.user_id
    )
  );

DROP POLICY IF EXISTS "targets_insert_authenticated" ON targets;
CREATE POLICY "targets_insert_authenticated" ON targets FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    OR
    EXISTS (
      SELECT 1 FROM get_user_descendants(auth.uid()) d WHERE d.id = user_id
    )
  );

DROP POLICY IF EXISTS "targets_update_authenticated" ON targets;
CREATE POLICY "targets_update_authenticated" ON targets FOR UPDATE
  TO authenticated
  USING (
    user_id = auth.uid()
    OR
    EXISTS (
      SELECT 1 FROM get_user_descendants(auth.uid()) d WHERE d.id = targets.user_id
    )
  )
  WITH CHECK (
    user_id = auth.uid()
    OR
    EXISTS (
      SELECT 1 FROM get_user_descendants(auth.uid()) d WHERE d.id = user_id
    )
  );

DROP POLICY IF EXISTS "targets_delete_authenticated" ON targets;
CREATE POLICY "targets_delete_authenticated" ON targets FOR DELETE
  TO authenticated
  USING (
    user_id = auth.uid()
    OR
    EXISTS (
      SELECT 1 FROM get_user_descendants(auth.uid()) d WHERE d.id = targets.user_id
    )
  );

-- ============================================
-- NOTIFICATIONS POLICIES
-- ============================================

DROP POLICY IF EXISTS "notifications_select_authenticated" ON notifications;
CREATE POLICY "notifications_select_authenticated" ON notifications FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "notifications_insert_authenticated" ON notifications;
CREATE POLICY "notifications_insert_authenticated" ON notifications FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    OR
    EXISTS (
      SELECT 1 FROM get_user_descendants(auth.uid()) d WHERE d.id = user_id
    )
  );

DROP POLICY IF EXISTS "notifications_update_authenticated" ON notifications;
CREATE POLICY "notifications_update_authenticated" ON notifications FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "notifications_delete_authenticated" ON notifications;
CREATE POLICY "notifications_delete_authenticated" ON notifications FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- ============================================
-- TASKS POLICIES
-- ============================================

DROP POLICY IF EXISTS "tasks_select_authenticated" ON tasks;
CREATE POLICY "tasks_select_authenticated" ON tasks FOR SELECT
  TO authenticated
  USING (
    assigned_to = auth.uid()
    OR
    assigned_by = auth.uid()
    OR
    EXISTS (
      SELECT 1 FROM get_user_descendants(auth.uid()) d WHERE d.id = tasks.assigned_to
    )
  );

DROP POLICY IF EXISTS "tasks_insert_authenticated" ON tasks;
CREATE POLICY "tasks_insert_authenticated" ON tasks FOR INSERT
  TO authenticated
  WITH CHECK (
    assigned_by = auth.uid()
    OR
    EXISTS (
      SELECT 1 FROM get_user_descendants(auth.uid()) d WHERE d.id = assigned_to
    )
  );

DROP POLICY IF EXISTS "tasks_update_authenticated" ON tasks;
CREATE POLICY "tasks_update_authenticated" ON tasks FOR UPDATE
  TO authenticated
  USING (
    assigned_to = auth.uid()
    OR
    assigned_by = auth.uid()
    OR
    EXISTS (
      SELECT 1 FROM get_user_descendants(auth.uid()) d WHERE d.id = tasks.assigned_to
    )
  )
  WITH CHECK (
    assigned_to = auth.uid()
    OR
    assigned_by = auth.uid()
    OR
    EXISTS (
      SELECT 1 FROM get_user_descendants(auth.uid()) d WHERE d.id = assigned_to
    )
  );

DROP POLICY IF EXISTS "tasks_delete_authenticated" ON tasks;
CREATE POLICY "tasks_delete_authenticated" ON tasks FOR DELETE
  TO authenticated
  USING (
    assigned_by = auth.uid()
    OR
    EXISTS (
      SELECT 1 FROM get_user_descendants(auth.uid()) d WHERE d.id = tasks.assigned_to
    )
  );

-- ============================================
-- AUDIT LOG POLICIES
-- ============================================

DROP POLICY IF EXISTS "audit_log_select_authenticated" ON audit_log;
CREATE POLICY "audit_log_select_authenticated" ON audit_log FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin'
    )
  );

-- Audit log is insert only (no update, no delete)
DROP POLICY IF EXISTS "audit_log_insert_authenticated" ON audit_log;
CREATE POLICY "audit_log_insert_authenticated" ON audit_log FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- ============================================
-- MONTH CLOSING POLICIES
-- ============================================

DROP POLICY IF EXISTS "month_closing_select_authenticated" ON month_closing;
CREATE POLICY "month_closing_select_authenticated" ON month_closing FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "month_closing_insert_authenticated" ON month_closing;
CREATE POLICY "month_closing_insert_authenticated" ON month_closing FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('super_admin', 'development_manager')
    )
  );

DROP POLICY IF EXISTS "month_closing_update_authenticated" ON month_closing;
CREATE POLICY "month_closing_update_authenticated" ON month_closing FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin'
    )
  );

DROP POLICY IF EXISTS "month_closing_delete_authenticated" ON month_closing;
CREATE POLICY "month_closing_delete_authenticated" ON month_closing FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin'
    )
  );

-- ============================================
-- SYSTEM SETTINGS POLICIES
-- ============================================

DROP POLICY IF EXISTS "settings_select_authenticated" ON system_settings;
CREATE POLICY "settings_select_authenticated" ON system_settings FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "settings_insert_authenticated" ON system_settings;
CREATE POLICY "settings_insert_authenticated" ON system_settings FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin'
    )
  );

DROP POLICY IF EXISTS "settings_update_authenticated" ON system_settings;
CREATE POLICY "settings_update_authenticated" ON system_settings FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin'
    )
  );

DROP POLICY IF EXISTS "settings_delete_authenticated" ON system_settings;
CREATE POLICY "settings_delete_authenticated" ON system_settings FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin'
    )
  );

-- ============================================
-- VIEWS
-- ============================================

-- View for active policies with client and agent info
CREATE OR REPLACE VIEW active_policies_view AS
SELECT 
  p.id,
  p.policy_number,
  p.policy_type,
  p.premium_amount,
  p.monthly_premium,
  p.issue_date,
  p.start_date,
  p.end_date,
  p.status,
  c.full_name AS client_name,
  c.phone AS client_phone,
  c.mobile AS client_mobile,
  a.full_name AS agent_name,
  a.email AS agent_email,
  b.name AS branch_name,
  b.code AS branch_code
FROM policies p
JOIN clients c ON p.client_id = c.id
JOIN profiles a ON p.agent_id = a.id
JOIN branches b ON p.branch_id = b.id;

-- View for pending collections
CREATE OR REPLACE VIEW pending_collections_view AS
SELECT 
  c.id,
  c.collection_number,
  c.amount,
  c.due_date,
  c.status,
  p.policy_number,
  p.policy_type,
  cl.full_name AS client_name,
  cl.phone AS client_phone,
  cl.mobile AS client_mobile,
  a.full_name AS agent_name,
  b.name AS branch_name
FROM collections c
JOIN policies p ON c.policy_id = p.id
JOIN clients cl ON c.client_id = cl.id
JOIN profiles a ON c.agent_id = a.id
JOIN branches b ON c.branch_id = b.id
WHERE c.status = 'pending'
ORDER BY c.due_date;

-- View for user targets with achievement
CREATE OR REPLACE VIEW targets_view AS
SELECT 
  t.id,
  t.user_id,
  p.full_name AS user_name,
  p.role AS user_role,
  b.name AS branch_name,
  t.year,
  t.month,
  t.target_amount,
  t.achieved_amount,
  t.target_policies,
  t.achieved_policies,
  t.target_collections,
  t.achieved_collections,
  CASE 
    WHEN t.target_amount > 0 THEN ROUND((t.achieved_amount / t.target_amount) * 100, 2)
    ELSE 0 
  END AS achievement_percentage
FROM targets t
JOIN profiles p ON t.user_id = p.id
LEFT JOIN branches b ON t.branch_id = b.id;

-- View for organizational chart
CREATE OR REPLACE VIEW org_chart_view AS
SELECT 
  oh.id,
  oh.user_id,
  p.full_name AS user_name,
  p.email,
  p.role,
  b.name AS branch_name,
  oh.parent_id,
  pp.full_name AS parent_name,
  pp.role AS parent_role,
  oh.level
FROM organizational_hierarchy oh
JOIN profiles p ON oh.user_id = p.id
LEFT JOIN profiles pp ON oh.parent_id = pp.id
LEFT JOIN branches b ON p.branch_id = b.id
ORDER BY oh.level, p.full_name;

-- ============================================
-- INITIAL DATA
-- ============================================

-- Insert default system settings
INSERT INTO system_settings (key, value, description) VALUES
  ('company_name', 'شركة التأمين على الحياة', 'Company name'),
  ('currency', 'SAR', 'Default currency'),
  ('default_target_dm', '750000', 'Default monthly target for Development Manager'),
  ('default_target_gs', '240000', 'Default monthly target for General Supervisor'),
  ('first_year_only', 'true', 'Track first year only for policies'),
  ('notifications_enabled', 'true', 'Enable system notifications')
ON CONFLICT (key) DO NOTHING;

-- ============================================
-- AUDIT TRIGGERS
-- ============================================

-- Generic audit trigger function
CREATE OR REPLACE FUNCTION audit_trigger_func()
RETURNS TRIGGER AS $$
DECLARE
  old_values JSONB;
  new_values JSONB;
BEGIN
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
    TG_OP::audit_action,
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

-- Apply audit triggers to key tables
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
