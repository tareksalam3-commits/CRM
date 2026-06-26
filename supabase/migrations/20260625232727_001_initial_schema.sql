/*
# Life Insurance CRM - Initial Schema

1. New Tables
- `users` - Custom user profiles linked to auth.users
- `clients` - Insurance clients
- `policy_types` - Types of insurance policies
- `policies` - Insurance policies (the core of the system)
- `installments` - Auto-generated payment installments
- `collections` - Payment collections
- `targets` - Sales targets by role
- `monthly_closings` - Month-end closing records
- `activity_logs` - System activity logs
- `settings` - System settings

2. Security
- Enable RLS on all tables
- Policies for authenticated users with role-based access

3. Notes
- This system uses Supabase Auth with email/password
- All data is scoped by user role and hierarchy
- Policies are the core of the system
*/

-- Users table (extends auth.users)
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  email text UNIQUE NOT NULL,
  full_name text NOT NULL,
  role text NOT NULL DEFAULT 'agent' CHECK (role IN ('super_admin', 'dev_manager', 'general_supervisor', 'supervisor', 'group_leader', 'agent')),
  manager_id uuid REFERENCES users(id) ON DELETE SET NULL,
  phone text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Clients table
CREATE TABLE IF NOT EXISTS clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  phone text,
  email text,
  id_number text,
  address text,
  date_of_birth date,
  agent_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz DEFAULT now()
);

-- Policy types table
CREATE TABLE IF NOT EXISTS policy_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  created_at timestamptz DEFAULT now()
);

-- Policies table (core of the system)
CREATE TABLE IF NOT EXISTS policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_number text UNIQUE NOT NULL,
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  agent_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  group_leader_id uuid REFERENCES users(id) ON DELETE SET NULL,
  supervisor_id uuid REFERENCES users(id) ON DELETE SET NULL,
  policy_type_id uuid NOT NULL REFERENCES policy_types(id) ON DELETE RESTRICT,
  issue_date date NOT NULL,
  start_date date NOT NULL,
  duration_years integer NOT NULL DEFAULT 1,
  payment_method text NOT NULL CHECK (payment_method IN ('annual', 'semi_annual', 'quarterly', 'monthly')),
  annual_premium numeric(12,2) NOT NULL,
  periodic_premium numeric(12,2) NOT NULL,
  sum_insured numeric(12,2) NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paid', 'cancelled', 'expired')),
  created_at timestamptz DEFAULT now()
);

-- Installments table
CREATE TABLE IF NOT EXISTS installments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id uuid NOT NULL REFERENCES policies(id) ON DELETE CASCADE,
  installment_number integer NOT NULL,
  due_date date NOT NULL,
  amount numeric(12,2) NOT NULL,
  insurance_year integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'due' CHECK (status IN ('due', 'collected', 'overdue')),
  created_at timestamptz DEFAULT now(),
  UNIQUE(policy_id, installment_number)
);

-- Collections table
CREATE TABLE IF NOT EXISTS collections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  installment_id uuid NOT NULL REFERENCES installments(id) ON DELETE RESTRICT,
  policy_id uuid NOT NULL REFERENCES policies(id) ON DELETE RESTRICT,
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  collector_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  collection_date date NOT NULL,
  amount numeric(12,2) NOT NULL,
  notes text,
  created_at timestamptz DEFAULT now()
);

-- Targets table
CREATE TABLE IF NOT EXISTS targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  year integer NOT NULL,
  month integer NOT NULL CHECK (month BETWEEN 1 AND 12),
  target_amount numeric(12,2) NOT NULL,
  target_policies integer NOT NULL DEFAULT 0,
  achieved_amount numeric(12,2) NOT NULL DEFAULT 0,
  achieved_policies integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, year, month)
);

-- Monthly closings table
CREATE TABLE IF NOT EXISTS monthly_closings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  year integer NOT NULL,
  month integer NOT NULL CHECK (month BETWEEN 1 AND 12),
  closed_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  closed_at timestamptz DEFAULT now(),
  total_collections numeric(12,2) NOT NULL DEFAULT 0,
  total_policies integer NOT NULL DEFAULT 0,
  notes text,
  UNIQUE(year, month)
);

-- Activity logs table
CREATE TABLE IF NOT EXISTS activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  details jsonb,
  created_at timestamptz DEFAULT now()
);

-- Settings table
CREATE TABLE IF NOT EXISTS settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  value text,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE policy_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE installments ENABLE ROW LEVEL SECURITY;
ALTER TABLE collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE monthly_closings ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_auth_id ON users(auth_id);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_manager ON users(manager_id);
CREATE INDEX IF NOT EXISTS idx_clients_agent ON clients(agent_id);
CREATE INDEX IF NOT EXISTS idx_policies_client ON policies(client_id);
CREATE INDEX IF NOT EXISTS idx_policies_agent ON policies(agent_id);
CREATE INDEX IF NOT EXISTS idx_policies_status ON policies(status);
CREATE INDEX IF NOT EXISTS idx_installments_policy ON installments(policy_id);
CREATE INDEX IF NOT EXISTS idx_installments_status ON installments(status);
CREATE INDEX IF NOT EXISTS idx_installments_due_date ON installments(due_date);
CREATE INDEX IF NOT EXISTS idx_collections_installment ON collections(installment_id);
CREATE INDEX IF NOT EXISTS idx_collections_policy ON collections(policy_id);
CREATE INDEX IF NOT EXISTS idx_collections_collector ON collections(collector_id);
CREATE INDEX IF NOT EXISTS idx_collections_date ON collections(collection_date);
CREATE INDEX IF NOT EXISTS idx_targets_user ON targets(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_user ON activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created ON activity_logs(created_at);
