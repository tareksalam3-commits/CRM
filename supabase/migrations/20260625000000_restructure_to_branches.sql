-- Phase 2: Restructure from Multi-Company to Single-Company Multi-Branch
-- 1. Create branches table
CREATE TABLE IF NOT EXISTS public.branches (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL UNIQUE,
    code text UNIQUE,
    is_active boolean DEFAULT true,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- 2. Add branch_id to all relevant tables (if not already there)
DO $$
BEGIN
    -- profiles (already has branch_id from previous migration, but ensuring here)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'branch_id') THEN
        ALTER TABLE profiles ADD COLUMN branch_id uuid REFERENCES branches(id) ON DELETE SET NULL;
    END IF;

    -- clients
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'clients' AND column_name = 'branch_id') THEN
        ALTER TABLE clients ADD COLUMN branch_id uuid REFERENCES branches(id) ON DELETE SET NULL;
    END IF;

    -- policies
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'policies' AND column_name = 'branch_id') THEN
        ALTER TABLE policies ADD COLUMN branch_id uuid REFERENCES branches(id) ON DELETE SET NULL;
    END IF;

    -- collections
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'collections' AND column_name = 'branch_id') THEN
        ALTER TABLE collections ADD COLUMN branch_id uuid REFERENCES branches(id) ON DELETE SET NULL;
    END IF;

    -- targets
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'targets' AND column_name = 'branch_id') THEN
        ALTER TABLE targets ADD COLUMN branch_id uuid REFERENCES branches(id) ON DELETE SET NULL;
    END IF;

    -- tasks
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tasks' AND column_name = 'branch_id') THEN
        ALTER TABLE tasks ADD COLUMN branch_id uuid REFERENCES branches(id) ON DELETE SET NULL;
    END IF;

    -- notifications
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'notifications' AND column_name = 'branch_id') THEN
        ALTER TABLE notifications ADD COLUMN branch_id uuid REFERENCES branches(id) ON DELETE SET NULL;
    END IF;

    -- month_closings
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'month_closings' AND column_name = 'branch_id') THEN
        ALTER TABLE month_closings ADD COLUMN branch_id uuid REFERENCES branches(id) ON DELETE SET NULL;
    END IF;
END $$;

-- 3. Create default branch for "قناة السويس لتأمينات الحياة"
INSERT INTO public.branches (name, code) 
VALUES ('الفرع الرئيسي', 'HO')
ON CONFLICT (name) DO NOTHING;

-- 4. Enable RLS on branches
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;

-- 5. Basic RLS for branches (Allow authenticated users to view)
DROP POLICY IF EXISTS "branches_select_policy" ON branches;
CREATE POLICY "branches_select_policy" ON branches FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "branches_modify_policy" ON branches;
CREATE POLICY "branches_modify_policy" ON branches FOR ALL TO authenticated 
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('super_admin', 'dev_manager')));
