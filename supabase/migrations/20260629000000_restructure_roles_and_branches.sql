-- Phase 2: Restructure Roles and Branches

-- 1. Create a temporary table to hold old profile roles for migration
CREATE TABLE IF NOT EXISTS public.profiles_old_roles (
    id uuid PRIMARY KEY,
    role text,
    branch_id uuid
);

-- 2. Insert existing profile data into the temporary table
INSERT INTO public.profiles_old_roles (id, role, branch_id)
SELECT id, role, branch_id FROM public.profiles;

-- 3. Drop existing role and branch_id columns from profiles table
ALTER TABLE public.profiles
DROP COLUMN role,
DROP COLUMN branch_id;

-- 4. Add new columns to user_branch_access table
ALTER TABLE public.user_branch_access
ADD COLUMN role text NOT NULL DEFAULT 'agent' CHECK (role IN ('super_admin', 'dev_manager', 'general_supervisor', 'supervisor', 'team_leader', 'branch_manager', 'agent')),
ADD COLUMN is_active boolean NOT NULL DEFAULT true,
ADD COLUMN assigned_at timestamptz NOT NULL DEFAULT now(),
ADD COLUMN expires_at timestamptz,
ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();

-- 5. Create a function to migrate existing data to user_branch_access
CREATE OR REPLACE FUNCTION migrate_user_roles_to_user_branch_access()
RETURNS void AS $$
DECLARE
    user_record RECORD;
    main_branch_id uuid;
BEGIN
    -- Get the ID of the 'MAIN' branch. Assuming 'MAIN' branch always exists.
    SELECT id INTO main_branch_id FROM public.branches WHERE code = 'MAIN' LIMIT 1;

    IF main_branch_id IS NULL THEN
        RAISE EXCEPTION 'Main branch with code "MAIN" not found. Cannot migrate roles.';
    END IF;

    FOR user_record IN SELECT id, role, branch_id FROM public.profiles_old_roles LOOP
        -- If user had a specific branch_id, use it. Otherwise, assign to main_branch_id.
        INSERT INTO public.user_branch_access (user_id, branch_id, role, is_active, assigned_at)
        VALUES (
            user_record.id,
            COALESCE(user_record.branch_id, main_branch_id),
            user_record.role,
            true,
            now()
        )
        ON CONFLICT (user_id, branch_id) DO UPDATE SET
            role = EXCLUDED.role,
            updated_at = now();
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- 6. Execute the migration function
SELECT migrate_user_roles_to_user_branch_access();

-- 7. Drop the temporary migration function
DROP FUNCTION migrate_user_roles_to_user_branch_access();

-- 8. Drop the temporary table after migration
DROP TABLE public.profiles_old_roles;

-- 9. Update RLS policies for user_branch_access
DROP POLICY IF EXISTS "user_branch_access_select" ON public.user_branch_access;
CREATE POLICY "user_branch_access_select" ON public.user_branch_access FOR SELECT TO authenticated 
    USING (user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.user_branch_access uba JOIN public.profiles p ON uba.user_id = p.id WHERE uba.branch_id = user_branch_access.branch_id AND uba.role IN ('super_admin', 'dev_manager') AND p.id = auth.uid()));

DROP POLICY IF EXISTS "user_branch_access_insert" ON public.user_branch_access;
CREATE POLICY "user_branch_access_insert" ON public.user_branch_access FOR INSERT TO authenticated 
    WITH CHECK (EXISTS (SELECT 1 FROM public.user_branch_access uba JOIN public.profiles p ON uba.user_id = p.id WHERE uba.branch_id = user_branch_access.branch_id AND uba.role IN ('super_admin', 'dev_manager') AND p.id = auth.uid()));

DROP POLICY IF EXISTS "user_branch_access_update" ON public.user_branch_access;
CREATE POLICY "user_branch_access_update" ON public.user_branch_access FOR UPDATE TO authenticated 
    USING (EXISTS (SELECT 1 FROM public.user_branch_access uba JOIN public.profiles p ON uba.user_id = p.id WHERE uba.branch_id = user_branch_access.branch_id AND uba.role IN ('super_admin', 'dev_manager') AND p.id = auth.uid()))
    WITH CHECK (EXISTS (SELECT 1 FROM public.user_branch_access uba JOIN public.profiles p ON uba.user_id = p.id WHERE uba.branch_id = user_branch_access.branch_id AND uba.role IN ('super_admin', 'dev_manager') AND p.id = auth.uid()));

DROP POLICY IF EXISTS "user_branch_access_delete" ON public.user_branch_access;
CREATE POLICY "user_branch_access_delete" ON public.user_branch_access FOR DELETE TO authenticated 
    USING (EXISTS (SELECT 1 FROM public.user_branch_access uba JOIN public.profiles p ON uba.user_id = p.id WHERE uba.branch_id = user_branch_access.branch_id AND uba.role IN ('super_admin', 'dev_manager') AND p.id = auth.uid()));

-- 10. Update the check_branch_access function to use the new structure
CREATE OR REPLACE FUNCTION public.check_branch_access(target_branch_id uuid)
RETURNS boolean AS $$
BEGIN
    -- Super admin and Dev manager can access all branches
    IF EXISTS (SELECT 1 FROM public.user_branch_access WHERE user_id = auth.uid() AND role IN ('super_admin', 'dev_manager')) THEN
        RETURN true;
    END IF;

    -- Check if user has active access to the specific branch
    RETURN EXISTS (
        SELECT 1 FROM public.user_branch_access 
        WHERE user_id = auth.uid() AND branch_id = target_branch_id AND is_active = true AND (expires_at IS NULL OR expires_at > now())
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 11. Update RLS policies for other tables to reflect the new role structure
-- This will be handled in a separate migration or directly in the application logic
