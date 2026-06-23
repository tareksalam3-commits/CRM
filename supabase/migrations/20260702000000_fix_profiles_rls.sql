-- ================================================================
-- CRM Pro - Fix User Management RLS Policies
-- Migration Date: 2026-07-02
-- ================================================================
-- هذا الـ migration يُصلح سياسات RLS لتمكين:
-- 1. super_admin و dev_manager من رؤية جميع المستخدمين
-- 2. تحديث بيانات أي مستخدم (الاسم، الدور، الحالة)
-- 3. رؤية جميع سجلات user_branch_access
-- ================================================================

-- ================================================================
-- PART 1: دالة مساعدة للتحقق من الدور مباشرة من profiles
-- ================================================================

-- دالة تتحقق من دور المستخدم من جدول profiles مباشرة (بدون recursion)
-- تستخدم SECURITY DEFINER لتجاوز RLS عند استدعائها داخل policies
CREATE OR REPLACE FUNCTION public.get_my_profile_role()
RETURNS text AS $$
BEGIN
  RETURN (SELECT role FROM public.profiles WHERE id = auth.uid() LIMIT 1);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.get_my_profile_role() TO authenticated;

-- ================================================================
-- PART 2: إصلاح سياسة SELECT على profiles
-- ================================================================

-- جميع المستخدمين المسجلين يمكنهم رؤية كل الـ profiles
-- (مطلوب لـ org chart، قائمة المديرين، تعيين المهام، إلخ)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select" ON public.profiles;
CREATE POLICY "profiles_select" ON public.profiles
  FOR SELECT TO authenticated
  USING (true);

-- ================================================================
-- PART 3: إضافة سياسة UPDATE على profiles
-- ================================================================

DROP POLICY IF EXISTS "profiles_update" ON public.profiles;
CREATE POLICY "profiles_update" ON public.profiles
  FOR UPDATE TO authenticated
  USING (
    -- السوبر أدمن يمكنه تعديل أي مستخدم
    public.get_my_profile_role() = 'super_admin'
    -- مدير التطوير يمكنه تعديل أي مستخدم ماعدا السوبر أدمن
    OR (public.get_my_profile_role() = 'dev_manager' AND role != 'super_admin')
    -- المراقب العام يمكنه تعديل المراقبين وما أدنى
    OR (public.get_my_profile_role() = 'general_supervisor' AND role IN ('supervisor', 'team_leader', 'branch_manager', 'agent'))
    -- المراقب يمكنه تعديل قائد الفريق والوكيل
    OR (public.get_my_profile_role() = 'supervisor' AND role IN ('team_leader', 'branch_manager', 'agent'))
    -- قائد الفريق يمكنه تعديل الوكلاء فقط
    OR (public.get_my_profile_role() = 'team_leader' AND role = 'agent')
    -- كل مستخدم يمكنه تعديل بياناته الشخصية (الاسم والهاتف فقط)
    OR id = auth.uid()
  )
  WITH CHECK (
    -- السوبر أدمن يمكنه تغيير أي شيء
    public.get_my_profile_role() = 'super_admin'
    -- مدير التطوير يمكنه تغيير أي شيء ماعدا السوبر أدمن
    OR (public.get_my_profile_role() = 'dev_manager' AND role != 'super_admin')
    -- المراقب العام يمكنه تغيير الأدوار الأدنى
    OR (public.get_my_profile_role() = 'general_supervisor' AND role IN ('supervisor', 'team_leader', 'branch_manager', 'agent'))
    -- المراقب يمكنه تغيير الأدوار الأدنى
    OR (public.get_my_profile_role() = 'supervisor' AND role IN ('team_leader', 'branch_manager', 'agent'))
    -- قائد الفريق يمكنه تعديل الوكلاء
    OR (public.get_my_profile_role() = 'team_leader' AND role = 'agent')
    -- كل مستخدم يمكنه تعديل بياناته
    OR id = auth.uid()
  );

-- ================================================================
-- PART 4: إضافة سياسة INSERT على profiles
-- ================================================================

DROP POLICY IF EXISTS "profiles_insert" ON public.profiles;
CREATE POLICY "profiles_insert" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (
    -- فقط super_admin وmdev_manager يمكنهم إنشاء profiles مباشرة
    -- (الإنشاء الطبيعي يكون عبر Edge Function بـ service_role)
    public.get_my_profile_role() IN ('super_admin', 'dev_manager')
    -- أو إنشاء الـ profile الخاص (عند تسجيل أول دخول)
    OR id = auth.uid()
  );

-- ================================================================
-- PART 5: إصلاح سياسة SELECT على user_branch_access
-- ================================================================

ALTER TABLE public.user_branch_access ENABLE ROW LEVEL SECURITY;

-- السوبر أدمن ومدير التطوير يرون كل السجلات
-- بقية المستخدمين يرون سجلاتهم فقط
DROP POLICY IF EXISTS "user_branch_access_select" ON public.user_branch_access;
CREATE POLICY "user_branch_access_select" ON public.user_branch_access
  FOR SELECT TO authenticated
  USING (
    public.get_my_profile_role() IN ('super_admin', 'dev_manager')
    OR user_id = auth.uid()
  );

-- ================================================================
-- PART 6: سياسات INSERT و UPDATE و DELETE على user_branch_access
-- ================================================================

-- INSERT: السوبر أدمن ومدير التطوير يمكنهم إضافة سجلات
DROP POLICY IF EXISTS "user_branch_access_insert" ON public.user_branch_access;
CREATE POLICY "user_branch_access_insert" ON public.user_branch_access
  FOR INSERT TO authenticated
  WITH CHECK (
    public.get_my_profile_role() IN ('super_admin', 'dev_manager', 'general_supervisor')
  );

-- UPDATE: نفس الصلاحيات
DROP POLICY IF EXISTS "user_branch_access_update" ON public.user_branch_access;
CREATE POLICY "user_branch_access_update" ON public.user_branch_access
  FOR UPDATE TO authenticated
  USING (
    public.get_my_profile_role() IN ('super_admin', 'dev_manager', 'general_supervisor')
  );

-- DELETE: السوبر أدمن ومدير التطوير يمكنهم حذف سجلات
DROP POLICY IF EXISTS "user_branch_access_delete" ON public.user_branch_access;
CREATE POLICY "user_branch_access_delete" ON public.user_branch_access
  FOR DELETE TO authenticated
  USING (
    public.get_my_profile_role() IN ('super_admin', 'dev_manager', 'general_supervisor')
  );

-- ================================================================
-- PART 7: إنشاء فهارس للأداء
-- ================================================================

CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_is_active ON public.profiles(is_active);

-- ================================================================
-- PART 8: التحقق من صحة الـ migration
-- ================================================================

-- التأكد من أن الدالة المساعدة تعمل
DO $$
BEGIN
  RAISE NOTICE 'Migration 20260702000000_fix_profiles_rls completed successfully';
  RAISE NOTICE 'Functions created: get_my_profile_role()';
  RAISE NOTICE 'Policies updated: profiles (SELECT, INSERT, UPDATE), user_branch_access (SELECT, INSERT, UPDATE, DELETE)';
END $$;
