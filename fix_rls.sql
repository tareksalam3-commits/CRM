-- Drop existing problematic policies
DROP POLICY IF EXISTS "profiles_select_policy" ON profiles;
DROP POLICY IF EXISTS "profiles_insert_policy" ON profiles;
DROP POLICY IF EXISTS "profiles_update_policy" ON profiles;
DROP POLICY IF EXISTS "profiles_delete_policy" ON profiles;

-- Create unified policies for profiles
CREATE POLICY "profiles_select_all" ON profiles FOR SELECT TO authenticated 
USING (
    id = auth.uid() 
    OR (auth.jwt() ->> 'role') IN ('super_admin', 'dev_manager')
    OR manager_id = auth.uid()
);

CREATE POLICY "profiles_admin_all" ON profiles FOR ALL TO authenticated
USING ((auth.jwt() ->> 'role') IN ('super_admin', 'dev_manager'))
WITH CHECK ((auth.jwt() ->> 'role') IN ('super_admin', 'dev_manager'));

-- Branches policies
DROP POLICY IF EXISTS "admin_all_access" ON branches;
DROP POLICY IF EXISTS "Anyone can view branches" ON branches;
DROP POLICY IF EXISTS "branches_insert_v2" ON branches;
DROP POLICY IF EXISTS "branches_update" ON branches;
DROP POLICY IF EXISTS "branches_delete" ON branches;
DROP POLICY IF EXISTS "branches_select_v2" ON branches;

CREATE POLICY "branches_read_all" ON branches FOR SELECT TO authenticated USING (true);
CREATE POLICY "branches_admin_all" ON branches FOR ALL TO authenticated
USING ((auth.jwt() ->> 'role') IN ('super_admin', 'dev_manager'))
WITH CHECK ((auth.jwt() ->> 'role') IN ('super_admin', 'dev_manager'));

-- User Branch Access policies
DROP POLICY IF EXISTS "admin_all_access" ON user_branch_access;
DROP POLICY IF EXISTS "user_branch_access_admin_all" ON user_branch_access;
DROP POLICY IF EXISTS "user_branch_access_read_final" ON user_branch_access;

CREATE POLICY "uba_read_own" ON user_branch_access FOR SELECT TO authenticated 
USING (user_id = auth.uid() OR (auth.jwt() ->> 'role') IN ('super_admin', 'dev_manager'));

CREATE POLICY "uba_admin_all" ON user_branch_access FOR ALL TO authenticated
USING ((auth.jwt() ->> 'role') IN ('super_admin', 'dev_manager'))
WITH CHECK ((auth.jwt() ->> 'role') IN ('super_admin', 'dev_manager'));
