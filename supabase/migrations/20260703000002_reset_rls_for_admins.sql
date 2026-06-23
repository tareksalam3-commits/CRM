-- تعطيل السياسات الحالية لضمان نظافة البيئة
DROP POLICY IF EXISTS "Admins have full access to profiles" ON profiles;
DROP POLICY IF EXISTS "Users can view their own profile" ON profiles;
DROP POLICY IF EXISTS "Superiors can view subordinates" ON profiles;
DROP POLICY IF EXISTS "Profiles are viewable by authenticated users" ON profiles;

-- سياسة الوصول لجدول profiles
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- 1. مسؤول النظام ومدير التطوير لديهم وصول كامل (قراءة، تحديث، حذف، إضافة)
CREATE POLICY "Admins full access to profiles"
ON profiles FOR ALL
TO authenticated
USING (
  (SELECT role FROM profiles WHERE id = auth.uid()) IN ('super_admin', 'dev_manager')
)
WITH CHECK (
  (SELECT role FROM profiles WHERE id = auth.uid()) IN ('super_admin', 'dev_manager')
);

-- 2. بقية المستخدمين يمكنهم رؤية ملفاتهم الشخصية
CREATE POLICY "Users view own profile"
ON profiles FOR SELECT
TO authenticated
USING (auth.uid() = id);

-- 3. المسؤولون (المراقبون، قادة الفرق) يمكنهم رؤية تابعيهم
CREATE POLICY "Superiors view subordinates"
ON profiles FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles superior
    WHERE superior.id = auth.uid()
    AND profiles.manager_id = superior.id
  )
);

-- سياسة الوصول لجدول user_branch_access
DROP POLICY IF EXISTS "Admins have full access to branch access" ON user_branch_access;
DROP POLICY IF EXISTS "Users can view their own branch access" ON user_branch_access;

ALTER TABLE user_branch_access ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins full access to branch access"
ON user_branch_access FOR ALL
TO authenticated
USING (
  (SELECT role FROM profiles WHERE id = auth.uid()) IN ('super_admin', 'dev_manager')
)
WITH CHECK (
  (SELECT role FROM profiles WHERE id = auth.uid()) IN ('super_admin', 'dev_manager')
);

CREATE POLICY "Users view own branch access"
ON user_branch_access FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- تحديث دالة get_my_profile_role لتكون أكثر قوة
CREATE OR REPLACE FUNCTION get_my_profile_role()
RETURNS text AS $$
  SELECT role::text FROM profiles WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;
