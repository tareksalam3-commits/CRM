/*
# Default Branches and Users Setup

## Overview
This migration creates the default branches and 10 default users with their organizational hierarchy.
All users have password "123456" as specified.

## Branches Created
1. المركز الرئيسي (Main Branch) - HQ001
2. فرع الرياض (Riyadh Branch) - RYD001
3. فرع جدة (Jeddah Branch) - JED001

## Users Created (10 users)
1. أحمد محمد (Super Admin) - ahmed.mohamed@insurance.com
2. عبدالله سعد (Development Manager, المركز الرئيسي) - abdullah.saad@insurance.com
3. فهد عبدالعزيز (General Supervisor, المركز الرئيسي) - fahad.abdulaziz@insurance.com
4. سلطان خالد (General Supervisor, فرع الرياض) - sultan.khalid@insurance.com
5. ماجد فهد (Supervisor, المركز الرئيسي) - majed.fahad@insurance.com
6. ناصر محمد (Supervisor, فرع الرياض) - nasser.mohamed@insurance.com
7. عمر سعود (Group Leader, المركز الرئيسي) - omar.saud@insurance.com
8. خالد أحمد (Agent, المركز الرئيسي) - khaled.ahmed@insurance.com
9. فيصل سلمان (Agent, المركز الرئيسي) - faisal.salman@insurance.com
10. راشد محمد (Agent, فرع الرياض) - rashed.mohamed@insurance.com
*/

-- Create branches first
INSERT INTO branches (id, name, code, region, address, phone, email, is_active) VALUES
  ('11111111-1111-1111-1111-111111111001', 'المركز الرئيسي', 'HQ001', 'الرياض', 'شارع الملك فهد، الرياض', '0112345678', 'main@insurance.com', true),
  ('11111111-1111-1111-1111-111111111002', 'فرع الرياض', 'RYD001', 'الرياض', 'شارع العليا، الرياض', '0112345679', 'riyadh@insurance.com', true),
  ('11111111-1111-1111-1111-111111111003', 'فرع جدة', 'JED001', 'جدة', 'شارع التحلية، جدة', '0129876543', 'jeddah@insurance.com', true)
ON CONFLICT (id) DO NOTHING;

-- Create auth users with proper password hashing
-- Password for all users: 123456
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- User 1: أحمد محمد (Super Admin)
INSERT INTO auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  confirmation_token,
  email_change_token_new,
  recovery_token
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  '22222222-2222-2222-2222-222222222001',
  'authenticated',
  'authenticated',
  'ahmed.mohamed@insurance.com',
  crypt('123456', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{"full_name":"أحمد محمد"}',
  now(),
  now(),
  '',
  '',
  ''
) ON CONFLICT (id) DO NOTHING;

-- User 2: عبدالله سعد (Development Manager)
INSERT INTO auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  confirmation_token,
  email_change_token_new,
  recovery_token
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  '22222222-2222-2222-2222-222222222002',
  'authenticated',
  'authenticated',
  'abdullah.saad@insurance.com',
  crypt('123456', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{"full_name":"عبدالله سعد"}',
  now(),
  now(),
  '',
  '',
  ''
) ON CONFLICT (id) DO NOTHING;

-- User 3: فهد عبدالعزيز (General Supervisor)
INSERT INTO auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  confirmation_token,
  email_change_token_new,
  recovery_token
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  '22222222-2222-2222-2222-222222222003',
  'authenticated',
  'authenticated',
  'fahad.abdulaziz@insurance.com',
  crypt('123456', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{"full_name":"فهد عبدالعزيز"}',
  now(),
  now(),
  '',
  '',
  ''
) ON CONFLICT (id) DO NOTHING;

-- User 4: سلطان خالد (General Supervisor - Riyadh Branch)
INSERT INTO auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  confirmation_token,
  email_change_token_new,
  recovery_token
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  '22222222-2222-2222-2222-222222222004',
  'authenticated',
  'authenticated',
  'sultan.khalid@insurance.com',
  crypt('123456', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{"full_name":"سلطان خالد"}',
  now(),
  now(),
  '',
  '',
  ''
) ON CONFLICT (id) DO NOTHING;

-- User 5: ماجد فهد (Supervisor)
INSERT INTO auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  confirmation_token,
  email_change_token_new,
  recovery_token
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  '22222222-2222-2222-2222-222222222005',
  'authenticated',
  'authenticated',
  'majed.fahad@insurance.com',
  crypt('123456', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{"full_name":"ماجد فهد"}',
  now(),
  now(),
  '',
  '',
  ''
) ON CONFLICT (id) DO NOTHING;

-- User 6: ناصر محمد (Supervisor - Riyadh Branch)
INSERT INTO auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  confirmation_token,
  email_change_token_new,
  recovery_token
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  '22222222-2222-2222-2222-222222222006',
  'authenticated',
  'authenticated',
  'nasser.mohamed@insurance.com',
  crypt('123456', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{"full_name":"ناصر محمد"}',
  now(),
  now(),
  '',
  '',
  ''
) ON CONFLICT (id) DO NOTHING;

-- User 7: عمر سعود (Group Leader)
INSERT INTO auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  confirmation_token,
  email_change_token_new,
  recovery_token
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  '22222222-2222-2222-2222-222222222007',
  'authenticated',
  'authenticated',
  'omar.saud@insurance.com',
  crypt('123456', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{"full_name":"عمر سعود"}',
  now(),
  now(),
  '',
  '',
  ''
) ON CONFLICT (id) DO NOTHING;

-- User 8: خالد أحمد (Agent)
INSERT INTO auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  confirmation_token,
  email_change_token_new,
  recovery_token
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  '22222222-2222-2222-2222-222222222008',
  'authenticated',
  'authenticated',
  'khaled.ahmed@insurance.com',
  crypt('123456', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{"full_name":"خالد أحمد"}',
  now(),
  now(),
  '',
  '',
  ''
) ON CONFLICT (id) DO NOTHING;

-- User 9: فيصل سلمان (Agent)
INSERT INTO auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  confirmation_token,
  email_change_token_new,
  recovery_token
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  '22222222-2222-2222-2222-222222222009',
  'authenticated',
  'authenticated',
  'faisal.salman@insurance.com',
  crypt('123456', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{"full_name":"فيصل سلمان"}',
  now(),
  now(),
  '',
  '',
  ''
) ON CONFLICT (id) DO NOTHING;

-- User 10: راشد محمد (Agent - Riyadh Branch)
INSERT INTO auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  confirmation_token,
  email_change_token_new,
  recovery_token
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  '22222222-2222-2222-2222-222222222010',
  'authenticated',
  'authenticated',
  'rashed.mohamed@insurance.com',
  crypt('123456', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{"full_name":"راشد محمد"}',
  now(),
  now(),
  '',
  '',
  ''
) ON CONFLICT (id) DO NOTHING;

-- Create identities for the users (required for auth)
INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
SELECT 
  gen_random_uuid(),
  id,
  email,
  jsonb_build_object('sub', id, 'email', email),
  'email',
  now(),
  now(),
  now()
FROM auth.users
WHERE NOT EXISTS (SELECT 1 FROM auth.identities WHERE "user_id" = auth.users.id);

-- Create sessions for the users (for immediate login capability)
INSERT INTO auth.sessions (id, user_id, created_at, updated_at)
SELECT 
  gen_random_uuid(),
  id,
  now(),
  now()
FROM auth.users
WHERE NOT EXISTS (SELECT 1 FROM auth.sessions WHERE "user_id" = auth.users.id);

-- Create profiles for all users
INSERT INTO profiles (id, email, full_name, role, branch_id, is_active, hire_date) VALUES
  ('22222222-2222-2222-2222-222222222001', 'ahmed.mohamed@insurance.com', 'أحمد محمد', 'super_admin', NULL, true, '2020-01-01'),
  ('22222222-2222-2222-2222-222222222002', 'abdullah.saad@insurance.com', 'عبدالله سعد', 'development_manager', '11111111-1111-1111-1111-111111111001', true, '2020-02-01'),
  ('22222222-2222-2222-2222-222222222003', 'fahad.abdulaziz@insurance.com', 'فهد عبدالعزيز', 'general_supervisor', '11111111-1111-1111-1111-111111111001', true, '2020-03-01'),
  ('22222222-2222-2222-2222-222222222004', 'sultan.khalid@insurance.com', 'سلطان خالد', 'general_supervisor', '11111111-1111-1111-1111-111111111002', true, '2020-04-01'),
  ('22222222-2222-2222-2222-222222222005', 'majed.fahad@insurance.com', 'ماجد فهد', 'supervisor', '11111111-1111-1111-1111-111111111001', true, '2020-05-01'),
  ('22222222-2222-2222-2222-222222222006', 'nasser.mohamed@insurance.com', 'ناصر محمد', 'supervisor', '11111111-1111-1111-1111-111111111002', true, '2020-06-01'),
  ('22222222-2222-2222-2222-222222222007', 'omar.saud@insurance.com', 'عمر سعود', 'group_leader', '11111111-1111-1111-1111-111111111001', true, '2020-07-01'),
  ('22222222-2222-2222-2222-222222222008', 'khaled.ahmed@insurance.com', 'خالد أحمد', 'agent', '11111111-1111-1111-1111-111111111001', true, '2020-08-01'),
  ('22222222-2222-2222-2222-222222222009', 'faisal.salman@insurance.com', 'فيصل سلمان', 'agent', '11111111-1111-1111-1111-111111111001', true, '2020-09-01'),
  ('22222222-2222-2222-2222-222222222010', 'rashed.mohamed@insurance.com', 'راشد محمد', 'agent', '11111111-1111-1111-1111-111111111002', true, '2020-10-01')
ON CONFLICT (id) DO NOTHING;

-- Set branch managers
UPDATE branches SET manager_id = '22222222-2222-2222-2222-222222222002' WHERE id = '11111111-1111-1111-1111-111111111001';
UPDATE branches SET manager_id = '22222222-2222-2222-2222-222222222004' WHERE id = '11111111-1111-1111-1111-111111111002';

-- Create organizational hierarchy
-- أحمد (Super Admin) has no parent
INSERT INTO organizational_hierarchy (user_id, parent_id, level) VALUES
  ('22222222-2222-2222-2222-222222222001', NULL, 0)
ON CONFLICT (user_id) DO NOTHING;

-- عبدالله (Development Manager) reports to أحمد
INSERT INTO organizational_hierarchy (user_id, parent_id, level) VALUES
  ('22222222-2222-2222-2222-222222222002', '22222222-2222-2222-2222-222222222001', 1)
ON CONFLICT (user_id) DO NOTHING;

-- فهد (General Supervisor - HQ) reports to عبدالله
INSERT INTO organizational_hierarchy (user_id, parent_id, level) VALUES
  ('22222222-2222-2222-2222-222222222003', '22222222-2222-2222-2222-222222222002', 2)
ON CONFLICT (user_id) DO NOTHING;

-- سلطان (General Supervisor - Riyadh) reports to عبدالله
INSERT INTO organizational_hierarchy (user_id, parent_id, level) VALUES
  ('22222222-2222-2222-2222-222222222004', '22222222-2222-2222-2222-222222222002', 2)
ON CONFLICT (user_id) DO NOTHING;

-- ماجد (Supervisor - HQ) reports to فهد
INSERT INTO organizational_hierarchy (user_id, parent_id, level) VALUES
  ('22222222-2222-2222-2222-222222222005', '22222222-2222-2222-2222-222222222003', 3)
ON CONFLICT (user_id) DO NOTHING;

-- ناصر (Supervisor - Riyadh) reports to سلطان
INSERT INTO organizational_hierarchy (user_id, parent_id, level) VALUES
  ('22222222-2222-2222-2222-222222222006', '22222222-2222-2222-2222-222222222004', 3)
ON CONFLICT (user_id) DO NOTHING;

-- عمر (Group Leader) reports to ماجد
INSERT INTO organizational_hierarchy (user_id, parent_id, level) VALUES
  ('22222222-2222-2222-2222-222222222007', '22222222-2222-2222-2222-222222222005', 4)
ON CONFLICT (user_id) DO NOTHING;

-- خالد (Agent) reports to عمر
INSERT INTO organizational_hierarchy (user_id, parent_id, level) VALUES
  ('22222222-2222-2222-2222-222222222008', '22222222-2222-2222-2222-222222222007', 5)
ON CONFLICT (user_id) DO NOTHING;

-- فيصل (Agent) reports to عمر
INSERT INTO organizational_hierarchy (user_id, parent_id, level) VALUES
  ('22222222-2222-2222-2222-222222222009', '22222222-2222-2222-2222-222222222007', 5)
ON CONFLICT (user_id) DO NOTHING;

-- راشد (Agent - Riyadh) reports to ناصر
INSERT INTO organizational_hierarchy (user_id, parent_id, level) VALUES
  ('22222222-2222-2222-2222-222222222010', '22222222-2222-2222-2222-222222222006', 4)
ON CONFLICT (user_id) DO NOTHING;

-- Set default targets for the current month for Development Manager and General Supervisors
INSERT INTO targets (user_id, branch_id, year, month, target_type, target_amount)
VALUES (
  '22222222-2222-2222-2222-222222222002',
  '11111111-1111-1111-1111-111111111001',
  EXTRACT(YEAR FROM now())::INTEGER,
  EXTRACT(MONTH FROM now())::INTEGER,
  'premium',
  750000
) ON CONFLICT (user_id, year, month, target_type) DO NOTHING;

INSERT INTO targets (user_id, branch_id, year, month, target_type, target_amount)
VALUES (
  '22222222-2222-2222-2222-222222222003',
  '11111111-1111-1111-1111-111111111001',
  EXTRACT(YEAR FROM now())::INTEGER,
  EXTRACT(MONTH FROM now())::INTEGER,
  'premium',
  240000
) ON CONFLICT (user_id, year, month, target_type) DO NOTHING;

INSERT INTO targets (user_id, branch_id, year, month, target_type, target_amount)
VALUES (
  '22222222-2222-2222-2222-222222222004',
  '11111111-1111-1111-1111-111111111002',
  EXTRACT(YEAR FROM now())::INTEGER,
  EXTRACT(MONTH FROM now())::INTEGER,
  'premium',
  240000
) ON CONFLICT (user_id, year, month, target_type) DO NOTHING;

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated;
