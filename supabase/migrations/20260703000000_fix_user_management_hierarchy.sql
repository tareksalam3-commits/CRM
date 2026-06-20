-- ================================================================
-- CRM Pro - Fix User Management & Hierarchy RLS
-- Migration Date: 2026-07-03
-- ================================================================

-- 1. تحديث دالة get_my_profile_role لتكون أكثر دقة
CREATE OR REPLACE FUNCTION public.get_my_profile_role()
RETURNS text AS $$
BEGIN
  RETURN (SELECT role FROM public.profiles WHERE id = auth.uid() LIMIT 1);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- 2. دالة للتحقق مما إذا كان المستخدم super_admin
CREATE OR REPLACE FUNCTION public.is_super_admin(p_user_id uuid)
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = p_user_id AND role = 'super_admin'
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- 3. دالة للتحقق من التبعية الهرمية (Hierarchy)
-- تعتمد على manager_id في جدول profiles
CREATE OR REPLACE FUNCTION public.is_subordinate(manager_uuid uuid, subordinate_uuid uuid)
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    WITH RECURSIVE subordinates AS (
      SELECT id FROM public.profiles WHERE manager_id = manager_uuid
      UNION ALL
      SELECT p.id FROM public.profiles p
      INNER JOIN subordinates s ON p.manager_id = s.id
    )
    SELECT 1 FROM subordinates WHERE id = subordinate_uuid
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- 4. دالة للتحقق من الوصول للمستخدم بناءً على الفروع (لمدير التطوير)
CREATE OR REPLACE FUNCTION public.can_manage_user(accessor_id uuid, target_id uuid)
RETURNS boolean AS $$
DECLARE
    accessor_role text;
    target_role text;
BEGIN
    -- 1. السوبر أدمن يدير الجميع
    IF public.is_super_admin(accessor_id) THEN
        RETURN TRUE;
    END IF;

    -- 2. لا يمكن لأحد إدارة نفسه من هنا (تتم عبر سياسات أخرى أو البروفايل)
    -- لكن للسماح بالرؤية في القائمة:
    IF accessor_id = target_id THEN
        RETURN TRUE;
    END IF;

    SELECT role INTO accessor_role FROM public.profiles WHERE id = accessor_id;
    SELECT role INTO target_role FROM public.profiles WHERE id = target_id;

    -- 3. مدير التطوير (dev_manager)
    IF accessor_role = 'dev_manager' THEN
        -- يرى ويدير جميع المستخدمين التابعين للفروع التابعة له
        -- أو التابعين له هرمياً
        RETURN EXISTS (
            SELECT 1 FROM public.user_branch_access a
            JOIN public.user_branch_access t ON t.branch_id = a.branch_id
            WHERE a.user_id = accessor_id 
            AND t.user_id = target_id
            AND a.is_active = true 
            AND t.is_active = true
        ) OR public.is_subordinate(accessor_id, target_id);
    END IF;

    -- 4. الهيكل الهرمي لبقية الأدوار
    RETURN public.is_subordinate(accessor_id, target_id);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- 5. إصلاح سياسات profiles
DROP POLICY IF EXISTS "profiles_select" ON public.profiles;
CREATE POLICY "profiles_select" ON public.profiles
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin(auth.uid()) -- السوبر أدمن يرى الجميع
    OR public.can_manage_user(auth.uid(), id) -- المديرين يرون تابعيهم
    OR id = auth.uid() -- المستخدم يرى نفسه
    OR (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('super_admin', 'dev_manager') -- تأكيد إضافي لمدير التطوير
  );

DROP POLICY IF EXISTS "profiles_update" ON public.profiles;
CREATE POLICY "profiles_update" ON public.profiles
  FOR UPDATE TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR public.can_manage_user(auth.uid(), id)
    OR id = auth.uid()
  )
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR public.can_manage_user(auth.uid(), id)
    OR id = auth.uid()
  );

-- 6. إصلاح سياسات user_branch_access
DROP POLICY IF EXISTS "user_branch_access_select" ON public.user_branch_access;
CREATE POLICY "user_branch_access_select" ON public.user_branch_access
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR public.can_manage_user(auth.uid(), user_id)
    OR user_id = auth.uid()
  );

DROP POLICY IF EXISTS "user_branch_access_insert" ON public.user_branch_access;
CREATE POLICY "user_branch_access_insert" ON public.user_branch_access
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'dev_manager'
  );

DROP POLICY IF EXISTS "user_branch_access_update" ON public.user_branch_access;
CREATE POLICY "user_branch_access_update" ON public.user_branch_access
  FOR UPDATE TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'dev_manager'
  );

DROP POLICY IF EXISTS "user_branch_access_delete" ON public.user_branch_access;
CREATE POLICY "user_branch_access_delete" ON public.user_branch_access
  FOR DELETE TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'dev_manager'
  );
