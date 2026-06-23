-- ================================================================
-- CRM Pro - Role-Based Access Control & Hierarchy RLS Fix
-- ================================================================

-- 1. تحديث دالة التحقق من التبعية الهرمية (Hierarchy) لتكون أكثر شمولاً
CREATE OR REPLACE FUNCTION public.is_subordinate_recursive(manager_uuid uuid, subordinate_uuid uuid)
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

-- 2. دالة لتحديد ما إذا كان المستخدم يرى بيانات الفرع بالكامل
CREATE OR REPLACE FUNCTION public.can_view_entire_branch(p_user_id uuid, p_branch_id uuid)
RETURNS boolean AS $$
DECLARE
    v_role text;
BEGIN
    SELECT role INTO v_role FROM public.profiles WHERE id = p_user_id;
    
    -- Super Admin و Dev Manager يرون كل شيء
    IF v_role IN ('super_admin', 'dev_manager') THEN
        RETURN TRUE;
    END IF;

    -- General Supervisor يرى جميع بيانات الفرع التابع له
    IF v_role = 'general_supervisor' THEN
        RETURN EXISTS (
            SELECT 1 FROM public.user_branch_access
            WHERE user_id = p_user_id AND branch_id = p_branch_id AND is_active = true
        );
    END IF;

    RETURN FALSE;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- 3. تحديث سياسات Clients
DROP POLICY IF EXISTS "clients_select" ON public.clients;
CREATE POLICY "clients_select" ON public.clients FOR SELECT TO authenticated
USING (
    public.can_view_entire_branch(auth.uid(), branch_id) -- Super Admin, Dev Manager, General Supervisor
    OR agent_id = auth.uid() -- Agent يرى بياناته فقط
    OR public.is_subordinate_recursive(auth.uid(), agent_id) -- TL, Supervisor يرون تابعيهم فقط
);

-- 4. تحديث سياسات Policies
DROP POLICY IF EXISTS "policies_select" ON public.policies;
CREATE POLICY "policies_select" ON public.policies FOR SELECT TO authenticated
USING (
    public.can_view_entire_branch(auth.uid(), branch_id)
    OR agent_id = auth.uid()
    OR public.is_subordinate_recursive(auth.uid(), agent_id)
);

-- 5. تحديث سياسات Collections
DROP POLICY IF EXISTS "collections_select" ON public.collections;
CREATE POLICY "collections_select" ON public.collections FOR SELECT TO authenticated
USING (
    public.can_view_entire_branch(auth.uid(), branch_id)
    OR collected_by = auth.uid()
    OR EXISTS (
        SELECT 1 FROM public.policies p
        WHERE p.id = policy_id
        AND (p.agent_id = auth.uid() OR public.is_subordinate_recursive(auth.uid(), p.agent_id))
    )
);

-- 6. تحديث سياسات Profiles (رؤية المستخدمين)
DROP POLICY IF EXISTS "profiles_select" ON public.profiles;
CREATE POLICY "profiles_select" ON public.profiles FOR SELECT TO authenticated
USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('super_admin', 'dev_manager') -- الإدارة ترى الجميع
    OR id = auth.uid() -- المستخدم يرى نفسه
    OR (
        (SELECT role FROM public.profiles WHERE id = auth.uid()) != 'agent' -- Agent لا يرى المستخدمين
        AND public.is_subordinate_recursive(auth.uid(), id) -- المديرين يرون تابعيهم فقط
    )
    OR (
        (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'general_supervisor'
        AND EXISTS (
            SELECT 1 FROM public.user_branch_access a
            JOIN public.user_branch_access t ON t.branch_id = a.branch_id
            WHERE a.user_id = auth.uid() AND t.user_id = profiles.id AND a.is_active = true AND t.is_active = true
        )
    )
);

-- 7. منع Dev Manager من إنشاء أو حذف Super Admin (سياسة على profiles)
DROP POLICY IF EXISTS "profiles_insert_dev_manager_limit" ON public.profiles;
CREATE POLICY "profiles_insert_dev_manager_limit" ON public.profiles FOR INSERT TO authenticated
WITH CHECK (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'super_admin'
    OR (
        (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'dev_manager'
        AND role != 'super_admin'
    )
);

DROP POLICY IF EXISTS "profiles_delete_dev_manager_limit" ON public.profiles;
CREATE POLICY "profiles_delete_dev_manager_limit" ON public.profiles FOR DELETE TO authenticated
USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'super_admin'
    OR (
        (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'dev_manager'
        AND role != 'super_admin'
    )
);

-- 8. تحديث سياسات Branches
DROP POLICY IF EXISTS "branches_select" ON public.branches;
CREATE POLICY "branches_select" ON public.branches FOR SELECT TO authenticated
USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('super_admin', 'dev_manager')
    OR EXISTS (
        SELECT 1 FROM public.user_branch_access
        WHERE user_id = auth.uid() AND branch_id = branches.id AND is_active = true
    )
);
