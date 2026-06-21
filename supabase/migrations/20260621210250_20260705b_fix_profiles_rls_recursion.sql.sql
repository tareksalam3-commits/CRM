/*
 * Fix infinite recursion in profiles RLS policies.
 *
 * Root cause: profiles_select policy queried `profiles` inside itself
 *   (EXISTS SELECT 1 FROM profiles WHERE id = auth.uid() AND role = ...)
 * which Postgres evaluates under RLS → infinite recursion.
 *
 * Fix: move the "is current user a super_admin/dev_manager?" check and the
 *   "is target a subordinate?" check into SECURITY DEFINER functions that
 *   bypass RLS, then reference them in the policies.
 */

-- ---------- helper: is the caller an admin (super_admin or dev_manager)? ----------
CREATE OR REPLACE FUNCTION public.is_admin(uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = uid AND role IN ('super_admin','dev_manager') AND is_active = true
  );
$$;

-- ---------- helper: can the caller see target profile? ----------
CREATE OR REPLACE FUNCTION public.can_view_profile(viewer_uuid uuid, target_uuid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    viewer_uuid = target_uuid
    OR public.is_admin(viewer_uuid)
    OR public.is_subordinate(viewer_uuid, target_uuid)
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = target_uuid AND p.is_active = true
        AND EXISTS (
          SELECT 1 FROM public.profiles me
          WHERE me.id = viewer_uuid
            AND me.role IN ('general_supervisor','supervisor','team_leader','agent')
            AND me.is_active = true
        )
    );
$$;

-- ---------- helper: can the caller modify target profile? ----------
CREATE OR REPLACE FUNCTION public.can_manage_profile(editor_uuid uuid, target_uuid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    editor_uuid = target_uuid
    OR public.is_admin(editor_uuid)
    OR public.is_subordinate(editor_uuid, target_uuid);
$$;

-- ---------- helper: can the caller create a profile with given role? ----------
CREATE OR REPLACE FUNCTION public.can_create_profile(creator_uuid uuid, new_role text, target_uuid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    -- Self-signup (auth trigger creates own profile)
    creator_uuid = target_uuid
    -- Admin / manager paths
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = creator_uuid
        AND p.is_active = true
        AND (
          p.role IN ('super_admin','dev_manager','general_supervisor','supervisor','team_leader')
        )
    );
$$;

-- ============================================================
-- Replace profiles policies (no recursion)
-- ============================================================
DROP POLICY IF EXISTS "profiles_select" ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update" ON public.profiles;
DROP POLICY IF EXISTS "profiles_delete" ON public.profiles;

CREATE POLICY "profiles_select" ON public.profiles
  FOR SELECT TO authenticated
  USING (public.can_view_profile(auth.uid(), id));

CREATE POLICY "profiles_insert" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (public.can_create_profile(auth.uid(), role, id));

CREATE POLICY "profiles_update" ON public.profiles
  FOR UPDATE TO authenticated
  USING (public.can_manage_profile(auth.uid(), id))
  WITH CHECK (public.can_manage_profile(auth.uid(), id));

CREATE POLICY "profiles_delete" ON public.profiles
  FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()));

-- ============================================================
-- Replace user_branch_access policies (also had recursion via profiles)
-- ============================================================
DROP POLICY IF EXISTS "user_branch_access_select" ON public.user_branch_access;
DROP POLICY IF EXISTS "user_branch_access_insert" ON public.user_branch_access;
DROP POLICY IF EXISTS "user_branch_access_update" ON public.user_branch_access;
DROP POLICY IF EXISTS "user_branch_access_delete" ON public.user_branch_access;

CREATE POLICY "user_branch_access_select" ON public.user_branch_access
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_admin(auth.uid())
    OR public.is_subordinate(auth.uid(), user_id)
  );

CREATE POLICY "user_branch_access_insert" ON public.user_branch_access
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    OR public.is_admin(auth.uid())
    OR public.is_subordinate(auth.uid(), user_id)
  );

CREATE POLICY "user_branch_access_update" ON public.user_branch_access
  FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_admin(auth.uid())
    OR public.is_subordinate(auth.uid(), user_id)
  )
  WITH CHECK (
    user_id = auth.uid()
    OR public.is_admin(auth.uid())
    OR public.is_subordinate(auth.uid(), user_id)
  );

CREATE POLICY "user_branch_access_delete" ON public.user_branch_access
  FOR DELETE TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_admin(auth.uid())
    OR public.is_subordinate(auth.uid(), user_id)
  );
