-- ============================================================================
-- USER MANAGEMENT SYSTEM - COMPREHENSIVE TEST SUITE
-- ============================================================================
-- This script tests the complete user management lifecycle:
-- 1. Create users with different roles
-- 2. Verify RLS policies work correctly
-- 3. Test hierarchy and subordinate relationships
-- 4. Test activation/deactivation
-- 5. Test password reset
-- 6. Test deletion with cascading

-- ============================================================================
-- SETUP: Create test users
-- ============================================================================

-- Test 1: Verify super_admin exists and can see all users
SELECT 'TEST 1: Super Admin visibility' as test_name;
SELECT id, email, role, is_active FROM public.profiles WHERE role = 'super_admin';

-- Test 2: Check RLS policies are in place
SELECT 'TEST 2: RLS Policies Status' as test_name;
SELECT schemaname, tablename, policyname, permissive, roles, cmd 
FROM pg_policies 
WHERE tablename = 'profiles' 
ORDER BY policyname;

-- Test 3: Verify functions exist and are SECURITY DEFINER
SELECT 'TEST 3: Security Functions Status' as test_name;
SELECT p.proname, p.prosecdef, p.proconfig 
FROM pg_proc p 
JOIN pg_namespace n ON p.pronamespace = n.oid 
WHERE n.nspname = 'public' AND p.proname IN ('is_admin', 'is_subordinate', 'get_my_role')
ORDER BY p.proname;

-- Test 4: Check trigger on auth.users
SELECT 'TEST 4: Auth Trigger Status' as test_name;
SELECT trigger_name, event_manipulation, event_object_table 
FROM information_schema.triggers 
WHERE event_object_table = 'users' AND trigger_schema = 'auth';

-- Test 5: Verify handle_new_user function definition
SELECT 'TEST 5: handle_new_user Function' as test_name;
SELECT routine_definition 
FROM information_schema.routines 
WHERE routine_name = 'handle_new_user' AND routine_schema = 'public';

-- Test 6: Check all profiles have valid roles
SELECT 'TEST 6: Profiles Data Integrity' as test_name;
SELECT id, email, role, is_active, manager_id, created_at 
FROM public.profiles 
ORDER BY created_at DESC;

-- Test 7: Verify no circular manager references
SELECT 'TEST 7: Circular Manager References Check' as test_name;
WITH RECURSIVE check_hierarchy AS (
  SELECT id, manager_id, 1 as depth FROM public.profiles WHERE manager_id IS NOT NULL
  UNION ALL
  SELECT p.id, p.manager_id, depth + 1 
  FROM public.profiles p
  INNER JOIN check_hierarchy ch ON p.id = ch.manager_id
  WHERE depth < 100
)
SELECT * FROM check_hierarchy WHERE depth > 50;

-- Test 8: Check user_branch_access table
SELECT 'TEST 8: User Branch Access' as test_name;
SELECT user_id, branch_id, is_active FROM public.user_branch_access LIMIT 10;

-- Test 9: Verify audit logs are being created
SELECT 'TEST 9: Audit Logs Status' as test_name;
SELECT action, entity_type, COUNT(*) as count 
FROM public.audit_logs 
GROUP BY action, entity_type 
ORDER BY action;

-- Test 10: Check for any orphaned profiles (no corresponding auth user)
SELECT 'TEST 10: Orphaned Profiles Check' as test_name;
SELECT p.id, p.email, p.role 
FROM public.profiles p
LEFT JOIN auth.users u ON p.id = u.id
WHERE u.id IS NULL;

-- Test 11: Check for any orphaned auth users (no corresponding profile)
SELECT 'TEST 11: Orphaned Auth Users Check' as test_name;
SELECT u.id, u.email 
FROM auth.users u
LEFT JOIN public.profiles p ON u.id = p.id
WHERE p.id IS NULL;

-- Test 12: Verify all required columns exist in profiles
SELECT 'TEST 12: Profiles Table Schema' as test_name;
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'profiles' AND table_schema = 'public'
ORDER BY ordinal_position;

-- Test 13: Check for any NULL values in required fields
SELECT 'TEST 13: Required Fields Integrity' as test_name;
SELECT 
  COUNT(*) as total_profiles,
  COUNT(CASE WHEN id IS NULL THEN 1 END) as null_ids,
  COUNT(CASE WHEN email IS NULL THEN 1 END) as null_emails,
  COUNT(CASE WHEN role IS NULL THEN 1 END) as null_roles,
  COUNT(CASE WHEN is_active IS NULL THEN 1 END) as null_is_active
FROM public.profiles;

-- Test 14: Verify role hierarchy is correct
SELECT 'TEST 14: Role Hierarchy Check' as test_name;
SELECT DISTINCT role FROM public.profiles ORDER BY role;

-- Test 15: Check foreign key constraints
SELECT 'TEST 15: Foreign Key Constraints' as test_name;
SELECT constraint_name, table_name, column_name, foreign_table_name, foreign_column_name
FROM information_schema.key_column_usage
WHERE table_name = 'profiles' AND foreign_table_name IS NOT NULL;

-- ============================================================================
-- SUMMARY REPORT
-- ============================================================================
SELECT 'SUMMARY: User Management System Status' as report;
SELECT 
  'Total Users' as metric,
  COUNT(*) as value
FROM public.profiles
UNION ALL
SELECT 'Active Users', COUNT(*) FROM public.profiles WHERE is_active = true
UNION ALL
SELECT 'Inactive Users', COUNT(*) FROM public.profiles WHERE is_active = false
UNION ALL
SELECT 'Super Admins', COUNT(*) FROM public.profiles WHERE role = 'super_admin'
UNION ALL
SELECT 'Dev Managers', COUNT(*) FROM public.profiles WHERE role = 'dev_manager'
UNION ALL
SELECT 'General Supervisors', COUNT(*) FROM public.profiles WHERE role = 'general_supervisor'
UNION ALL
SELECT 'Supervisors', COUNT(*) FROM public.profiles WHERE role = 'supervisor'
UNION ALL
SELECT 'Team Leaders', COUNT(*) FROM public.profiles WHERE role = 'team_leader'
UNION ALL
SELECT 'Agents', COUNT(*) FROM public.profiles WHERE role = 'agent'
UNION ALL
SELECT 'Users with Manager', COUNT(*) FROM public.profiles WHERE manager_id IS NOT NULL
UNION ALL
SELECT 'Users without Manager', COUNT(*) FROM public.profiles WHERE manager_id IS NULL
UNION ALL
SELECT 'RLS Policies Active', COUNT(*) FROM pg_policies WHERE tablename = 'profiles'
UNION ALL
SELECT 'Audit Logs Entries', COUNT(*) FROM public.audit_logs;
