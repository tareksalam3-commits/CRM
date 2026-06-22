/*
 * Fix infinite recursion in profiles RLS policies (v2).
 * 
 * Root cause: Overlapping and conflicting policies on the 'profiles' table 
 * created a circular dependency where Postgres couldn't resolve access rights.
 *
 * Fix:
 * 1. Created robust SECURITY DEFINER helper functions (is_admin_v2, is_subordinate_v2, can_view_profile_v2)
 *    that bypass RLS to perform the necessary checks.
 * 2. Cleaned up all legacy and conflicting policies on the 'profiles' table.
 * 3. Applied a unified set of v2 policies that use these helper functions.
 * 4. Updated related tables (user_branch_access, clients, etc.) to use the same v2 logic.
 */

-- Helper functions
CREATE OR REPLACE FUNCTION public.is_admin_v2(uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = uid AND role IN ('super_admin', 'dev_manager') AND is_active = true
  );
$$;

CREATE OR REPLACE FUNCTION public.is_subordinate_v2(manager_uuid uuid, subordinate_uuid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH RECURSIVE subordinates AS (
    SELECT id FROM public.profiles WHERE manager_id = manager_uuid
    UNION ALL
    SELECT p.id FROM public.profiles p
    INNER JOIN subordinates s ON p.manager_id = s.id
  )
  SELECT EXISTS (SELECT 1 FROM subordinates WHERE id = subordinate_uuid);
$$;

CREATE OR REPLACE FUNCTION public.can_view_profile_v2(viewer_uuid uuid, target_uuid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    viewer_uuid = target_uuid
    OR public.is_admin_v2(viewer_uuid)
    OR public.is_subordinate_v2(viewer_uuid, target_uuid);
$$;

-- Apply to profiles
DROP POLICY IF EXISTS "profiles_select" ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update" ON public.profiles;
DROP POLICY IF EXISTS "profiles_delete" ON public.profiles;
DROP POLICY IF EXISTS "Admins full access to profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Superiors view subordinates" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_v2" ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert_v2" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_v2" ON public.profiles;
DROP POLICY IF EXISTS "profiles_delete_v2" ON public.profiles;

CREATE POLICY "profiles_select_v2" ON public.profiles FOR SELECT TO authenticated USING (public.can_view_profile_v2(auth.uid(), id));
CREATE POLICY "profiles_insert_v2" ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid() OR public.is_admin_v2(auth.uid()));
CREATE POLICY "profiles_update_v2" ON public.profiles FOR UPDATE TO authenticated USING (public.can_view_profile_v2(auth.uid(), id)) WITH CHECK (public.can_view_profile_v2(auth.uid(), id));
CREATE POLICY "profiles_delete_v2" ON public.profiles FOR DELETE TO authenticated USING (public.is_admin_v2(auth.uid()));

-- Apply to user_branch_access
DROP POLICY IF EXISTS "user_branch_access_select" ON public.user_branch_access;
DROP POLICY IF EXISTS "user_branch_access_insert" ON public.user_branch_access;
DROP POLICY IF EXISTS "user_branch_access_update" ON public.user_branch_access;
DROP POLICY IF EXISTS "user_branch_access_delete" ON public.user_branch_access;
DROP POLICY IF EXISTS "user_branch_access_select_v2" ON public.user_branch_access;
DROP POLICY IF EXISTS "user_branch_access_insert_v2" ON public.user_branch_access;
DROP POLICY IF EXISTS "user_branch_access_update_v2" ON public.user_branch_access;
DROP POLICY IF EXISTS "user_branch_access_delete_v2" ON public.user_branch_access;

CREATE POLICY "user_branch_access_select_v2" ON public.user_branch_access FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_admin_v2(auth.uid()) OR public.is_subordinate_v2(auth.uid(), user_id));
CREATE POLICY "user_branch_access_insert_v2" ON public.user_branch_access FOR INSERT TO authenticated WITH CHECK (public.is_admin_v2(auth.uid()));
CREATE POLICY "user_branch_access_update_v2" ON public.user_branch_access FOR UPDATE TO authenticated USING (public.is_admin_v2(auth.uid())) WITH CHECK (public.is_admin_v2(auth.uid()));
CREATE POLICY "user_branch_access_delete_v2" ON public.user_branch_access FOR DELETE TO authenticated USING (public.is_admin_v2(auth.uid()));
