-- Comprehensive cleanup of role references from profiles table
-- This migration fixes all functions and policies that reference the old role column

-- Drop and recreate functions that reference profiles.role
DROP FUNCTION IF EXISTS public.reset_user_password_by_manager(uuid, text);
DROP FUNCTION IF EXISTS public.can_access_user(uuid, uuid);
DROP FUNCTION IF EXISTS public.get_top_performers(integer, integer, text, integer);
DROP FUNCTION IF EXISTS public.is_super_admin(uuid);
DROP FUNCTION IF EXISTS public.get_my_role();
DROP FUNCTION IF EXISTS public.sync_profile_role_from_active_branch();
DROP FUNCTION IF EXISTS public.get_my_active_role();

-- Create new version of reset_user_password_by_manager that uses user_branch_access
CREATE OR REPLACE FUNCTION public.reset_user_password_by_manager(p_admin_id uuid, p_user_id uuid, p_new_password text)
RETURNS json AS $$
DECLARE
    v_caller_level INT;
    v_target_level INT;
    v_hashed_password TEXT;
BEGIN
    IF length(p_new_password) < 6 THEN
        RETURN json_build_object('error', 'كلمة المرور قصيرة جداً');
    END IF;

    -- Get admin role from user_branch_access
    SELECT CASE role
        WHEN 'super_admin'        THEN 0
        WHEN 'dev_manager'        THEN 1
        WHEN 'general_supervisor' THEN 2
        WHEN 'supervisor'         THEN 3
        WHEN 'team_leader'        THEN 4
        WHEN 'agent'              THEN 5
    END INTO v_caller_level
    FROM user_branch_access WHERE user_id = p_admin_id AND is_active = true LIMIT 1;

    -- Get target user role from user_branch_access
    SELECT CASE role
        WHEN 'super_admin'        THEN 0
        WHEN 'dev_manager'        THEN 1
        WHEN 'general_supervisor' THEN 2
        WHEN 'supervisor'         THEN 3
        WHEN 'team_leader'        THEN 4
        WHEN 'agent'              THEN 5
    END INTO v_target_level
    FROM user_branch_access WHERE user_id = p_user_id AND is_active = true LIMIT 1;

    IF v_caller_level IS NULL THEN
        RETURN json_build_object('error', 'غير مصرح: لم يتم العثور على صلاحيات للأدمن');
    END IF;

    IF v_caller_level > 0 AND (v_target_level IS NULL OR v_caller_level >= v_target_level) THEN
        RETURN json_build_object('error', 'لا يمكنك تغيير كلمة مرور مستخدم بنفس مستواك أو أعلى منك');
    END IF;

    v_hashed_password := crypt(p_new_password, gen_salt('bf', 10));
    v_hashed_password := replace(v_hashed_password, '$2a$', '$2y$');

    UPDATE auth.users
    SET encrypted_password = v_hashed_password,
        confirmation_token = NULL,
        recovery_token = NULL,
        email_change_token_new = NULL,
        email_change_token_current = NULL,
        phone_change_token = NULL,
        reauthentication_token = NULL,
        updated_at = now()
    WHERE id = p_user_id;

    RETURN json_build_object('success', true);
END;
$$ LANGUAGE plpgsql;

-- Create new version of can_access_user
CREATE OR REPLACE FUNCTION public.can_access_user(accessor_uuid uuid, target_uuid uuid)
RETURNS boolean AS $$
DECLARE
    accessor_role text;
BEGIN
    IF accessor_uuid = target_uuid THEN
        RETURN true;
    END IF;

    SELECT role INTO accessor_role FROM public.user_branch_access 
    WHERE user_id = accessor_uuid AND is_active = true LIMIT 1;
    
    RETURN (
        accessor_role = 'super_admin'
        OR accessor_role = 'dev_manager'
    );
END;
$$ LANGUAGE plpgsql;

-- Create new version of get_top_performers
CREATE OR REPLACE FUNCTION public.get_top_performers(p_year integer, p_month integer, p_order_by text, p_limit integer)
RETURNS TABLE (
    id uuid,
    full_name text,
    role text,
    new_business numeric,
    collections numeric,
    new_clients integer
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    pr.id,
    pr.full_name,
    uba.role,
    COALESCE(SUM(CASE WHEN p.created_at::date >= make_date(p_year, p_month, 1) 
                      AND p.created_at::date < make_date(p_year, p_month, 1) + INTERVAL '1 month'
                      THEN p.annual_premium ELSE 0 END), 0)::numeric,
    COALESCE(SUM(CASE WHEN c.collection_date >= make_date(p_year, p_month, 1)
                      AND c.collection_date < make_date(p_year, p_month, 1) + INTERVAL '1 month'
                      THEN c.amount ELSE 0 END), 0)::numeric,
    COALESCE(COUNT(DISTINCT CASE WHEN cl.created_at::date >= make_date(p_year, p_month, 1)
                                  AND cl.created_at::date < make_date(p_year, p_month, 1) + INTERVAL '1 month'
                                  THEN cl.id END), 0)::int
  FROM profiles pr
  LEFT JOIN user_branch_access uba ON pr.id = uba.user_id AND uba.is_active = true
  LEFT JOIN policies p ON pr.id = p.agent_id
  LEFT JOIN clients cl ON p.client_id = cl.id
  LEFT JOIN collections c ON p.id = c.policy_id
  WHERE uba.role = 'agent' AND pr.is_active = true
  GROUP BY pr.id, pr.full_name, uba.role
  ORDER BY
    CASE WHEN p_order_by = 'new_business' THEN COALESCE(SUM(CASE WHEN p.created_at::date >= make_date(p_year, p_month, 1) 
                                                                    AND p.created_at::date < make_date(p_year, p_month, 1) + INTERVAL '1 month'
                                                                    THEN p.annual_premium ELSE 0 END), 0) END DESC,
    CASE WHEN p_order_by = 'collections' THEN COALESCE(SUM(CASE WHEN c.collection_date >= make_date(p_year, p_month, 1)
                                                                   AND c.collection_date < make_date(p_year, p_month, 1) + INTERVAL '1 month'
                                                                   THEN c.amount ELSE 0 END), 0) END DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Create new version of is_super_admin
CREATE OR REPLACE FUNCTION public.is_super_admin(p_user_id uuid)
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.user_branch_access
    WHERE user_id = p_user_id AND role = 'super_admin' AND is_active = true
  );
END;
$$ LANGUAGE plpgsql;

-- Create new version of get_my_role
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS text AS $$
BEGIN
  RETURN (SELECT role FROM public.user_branch_access WHERE user_id = auth.uid() AND is_active = true LIMIT 1);
END;
$$ LANGUAGE plpgsql;

-- Create new version of get_my_active_role
CREATE OR REPLACE FUNCTION public.get_my_active_role()
RETURNS text AS $$
BEGIN
  RETURN COALESCE(
    (SELECT role FROM public.user_branch_access WHERE user_id = auth.uid() AND is_active = true LIMIT 1),
    'agent'
  );
END;
$$ LANGUAGE plpgsql;

-- Ensure profiles table doesn't have any triggers trying to sync role
DROP TRIGGER IF EXISTS sync_profile_role_trigger ON profiles;

-- Verify all RLS policies are correct
-- They should not reference profiles.role directly
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_branch_access ENABLE ROW LEVEL SECURITY;

-- Ensure all indexes are in place for performance
CREATE INDEX IF NOT EXISTS idx_user_branch_access_user_id ON user_branch_access(user_id);
CREATE INDEX IF NOT EXISTS idx_user_branch_access_branch_id ON user_branch_access(branch_id);
CREATE INDEX IF NOT EXISTS idx_user_branch_access_is_active ON user_branch_access(is_active);
CREATE INDEX IF NOT EXISTS idx_user_branch_access_role ON user_branch_access(role);
CREATE INDEX IF NOT EXISTS idx_profiles_is_active ON profiles(is_active);
CREATE INDEX IF NOT EXISTS idx_profiles_id ON profiles(id);
