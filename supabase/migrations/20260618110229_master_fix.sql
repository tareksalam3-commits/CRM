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
