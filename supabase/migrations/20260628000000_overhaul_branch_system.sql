-- Overhaul Branch System Migration
-- 1. Ensure "الفرع الرئيسي" exists and is protected
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.branches WHERE name = 'الفرع الرئيسي' OR code = 'MAIN') THEN
        INSERT INTO public.branches (name, code, is_active, is_system)
        VALUES ('الفرع الرئيسي', 'MAIN', true, true);
    END IF;
END $$;

-- 2. Add protection constraints to branches table if they don't exist
-- We'll use a trigger to enforce the "cannot delete/disable/change type" rules for the main branch
CREATE OR REPLACE FUNCTION public.protect_main_branch()
RETURNS TRIGGER AS $$
BEGIN
    -- Protect 'الفرع الرئيسي' (assuming code 'MAIN' or is_system = true)
    IF (OLD.code = 'MAIN' OR OLD.is_system = true) THEN
        -- Prevent deletion
        IF (TG_OP = 'DELETE') THEN
            RAISE EXCEPTION 'لا يمكن حذف الفرع الرئيسي النظامي';
        END IF;
        -- Prevent disabling or changing system status
        IF (TG_OP = 'UPDATE') THEN
            IF (NEW.is_active = false) THEN
                RAISE EXCEPTION 'لا يمكن تعطيل الفرع الرئيسي';
            END IF;
            IF (NEW.is_system = false AND OLD.is_system = true) THEN
                RAISE EXCEPTION 'لا يمكن تغيير نوع الفرع الرئيسي';
            END IF;
            IF (NEW.name != OLD.name AND OLD.code = 'MAIN') THEN
                 -- Allow name change but keep it protected
            END IF;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS protect_main_branch_trigger ON public.branches;
CREATE TRIGGER protect_main_branch_trigger
BEFORE UPDATE OR DELETE ON public.branches
FOR EACH ROW EXECUTE FUNCTION public.protect_main_branch();

-- 3. Ensure user_branch_access has RLS and proper policies
ALTER TABLE public.user_branch_access ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_branch_access_select" ON public.user_branch_access;
CREATE POLICY "user_branch_access_select" ON public.user_branch_access FOR SELECT TO authenticated 
    USING (
        user_id = auth.uid() 
        OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('super_admin', 'dev_manager'))
    );

DROP POLICY IF EXISTS "user_branch_access_insert" ON public.user_branch_access;
CREATE POLICY "user_branch_access_insert" ON public.user_branch_access FOR INSERT TO authenticated 
    WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('super_admin', 'dev_manager')));

DROP POLICY IF EXISTS "user_branch_access_update" ON public.user_branch_access;
CREATE POLICY "user_branch_access_update" ON public.user_branch_access FOR UPDATE TO authenticated 
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('super_admin', 'dev_manager')));

DROP POLICY IF EXISTS "user_branch_access_delete" ON public.user_branch_access;
CREATE POLICY "user_branch_access_delete" ON public.user_branch_access FOR DELETE TO authenticated 
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('super_admin', 'dev_manager')));

-- 4. Update check_branch_access function to be more robust
CREATE OR REPLACE FUNCTION public.check_branch_access(target_branch_id uuid)
RETURNS boolean AS $$
DECLARE
    user_role text;
    main_branch_id uuid;
BEGIN
    -- Get user role
    SELECT role INTO user_role FROM public.profiles WHERE id = auth.uid();
    
    -- Super admin sees everything
    IF user_role = 'super_admin' THEN
        RETURN true;
    END IF;

    -- Get main branch id
    SELECT id INTO main_branch_id FROM public.branches WHERE code = 'MAIN' OR is_system = true LIMIT 1;

    -- If target is main branch, only super_admin (handled above) or explicitly linked users can see it
    -- However, the requirement says "Super Admin only: sees/manages/links users to main branch"
    -- "All other roles... do not see the main branch at all"
    -- So even if linked, they shouldn't see it unless they are super_admin? 
    -- Actually, the prompt says "Super Admin... can link users to it if he wants". 
    -- This implies if linked, they might see it. But then it says "All other roles... do not see the main branch definitely".
    -- Let's stick to: if it's the main branch, only super_admin can see it.
    
    IF target_branch_id = main_branch_id AND user_role != 'super_admin' THEN
        RETURN false;
    END IF;

    -- For other branches, check user_branch_access
    RETURN EXISTS (
        SELECT 1 FROM public.user_branch_access 
        WHERE user_id = auth.uid() AND branch_id = target_branch_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Update branches RLS to hide main branch from non-super-admins
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "branches_select_policy" ON public.branches;
CREATE POLICY "branches_select_policy" ON public.branches FOR SELECT TO authenticated 
    USING (
        (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin'))
        OR (
            (code != 'MAIN' OR code IS NULL) 
            AND (is_system = false OR is_system IS NULL)
            AND (
                EXISTS (SELECT 1 FROM public.user_branch_access WHERE user_id = auth.uid() AND branch_id = id)
                OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('dev_manager', 'general_supervisor', 'supervisor'))
            )
        )
    );

-- 6. Apply RLS to all data tables using the updated check_branch_access
-- This ensures that non-super-admins can't see data from the main branch even if they try to bypass UI

-- Clients
DROP POLICY IF EXISTS "clients_select_policy" ON public.clients;
CREATE POLICY "clients_select_policy" ON public.clients FOR SELECT TO authenticated 
  USING (check_branch_access(branch_id));

-- Policies
DROP POLICY IF EXISTS "policies_select_policy" ON public.policies;
CREATE POLICY "policies_select_policy" ON public.policies FOR SELECT TO authenticated 
  USING (check_branch_access(branch_id));

-- Collections
DROP POLICY IF EXISTS "collections_select_policy" ON public.collections;
CREATE POLICY "collections_select_policy" ON public.collections FOR SELECT TO authenticated 
  USING (check_branch_access(branch_id));

-- Targets
DROP POLICY IF EXISTS "targets_select_policy" ON public.targets;
CREATE POLICY "targets_select_policy" ON public.targets FOR SELECT TO authenticated 
  USING (check_branch_access(branch_id));

-- Tasks
DROP POLICY IF EXISTS "tasks_select_policy" ON public.tasks;
CREATE POLICY "tasks_select_policy" ON public.tasks FOR SELECT TO authenticated 
  USING (check_branch_access(branch_id));

-- 7. Restrict branch management to super_admin only
DROP POLICY IF EXISTS "branches_update_policy" ON public.branches;
CREATE POLICY "branches_update_policy" ON public.branches FOR UPDATE TO authenticated 
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin'));

DROP POLICY IF EXISTS "branches_delete_policy" ON public.branches;
CREATE POLICY "branches_delete_policy" ON public.branches FOR DELETE TO authenticated 
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin'));

DROP POLICY IF EXISTS "branches_insert_policy" ON public.branches;
CREATE POLICY "branches_insert_policy" ON public.branches FOR INSERT TO authenticated 
    WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin'));
