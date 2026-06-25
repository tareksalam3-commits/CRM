/*
================================================================================
LIFE INSURANCE SALES CRM - SEED DATA: USERS WITH AUTH
================================================================================
Generated: 2026-06-25
Description: Default users for the insurance CRM system
Password for ALL users: 123456

Users:
1. أحمد محمد (Super Admin) - ahmed.mohamed@insurance.com
2. عبدالله سعد (Development Manager) - abdullah.saad@insurance.com
3. فهد عبدالعزيز (General Supervisor) - fahad.abdulaziz@insurance.com
4. سلطان خالد (General Supervisor) - sultan.khalid@insurance.com
5. ماجد فهد (Supervisor) - majed.fahad@insurance.com
6. ناصر محمد (Supervisor) - nasser.mohamed@insurance.com
7. عمر سعود (Group Leader) - omar.saud@insurance.com
8. خالد أحمد (Agent) - khaled.ahmed@insurance.com
9. فيصل سلمان (Agent) - faisal.salman@insurance.com
10. راشد محمد (Agent) - rashed.mohamed@insurance.com
================================================================================
*/

-- Enable pgcrypto for password hashing
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Create auth users
-- User 1: أحمد محمد (Super Admin)
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change_token_new, recovery_token
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  '22222222-2222-2222-2222-222222222001',
  'authenticated', 'authenticated',
  'ahmed.mohamed@insurance.com',
  crypt('123456', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{"full_name":"أحمد محمد"}',
  now(), now(), '', '', ''
) ON CONFLICT (id) DO NOTHING;

-- User 2: عبدالله سعد (Development Manager)
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change_token_new, recovery_token
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  '22222222-2222-2222-2222-222222222002',
  'authenticated', 'authenticated',
  'abdullah.saad@insurance.com',
  crypt('123456', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{"full_name":"عبدالله سعد"}',
  now(), now(), '', '', ''
) ON CONFLICT (id) DO NOTHING;

-- User 3: فهد عبدالعزيز (General Supervisor)
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change_token_new, recovery_token
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  '22222222-2222-2222-2222-222222222003',
  'authenticated', 'authenticated',
  'fahad.abdulaziz@insurance.com',
  crypt('123456', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{"full_name":"فهد عبدالعزيز"}',
  now(), now(), '', '', ''
) ON CONFLICT (id) DO NOTHING;

-- User 4: سلطان خالد (General Supervisor - Riyadh Branch)
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change_token_new, recovery_token
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  '22222222-2222-2222-2222-222222222004',
  'authenticated', 'authenticated',
  'sultan.khalid@insurance.com',
  crypt('123456', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{"full_name":"سلطان خالد"}',
  now(), now(), '', '', ''
) ON CONFLICT (id) DO NOTHING;

-- User 5: ماجد فهد (Supervisor)
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change_token_new, recovery_token
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  '22222222-2222-2222-2222-222222222005',
  'authenticated', 'authenticated',
  'majed.fahad@insurance.com',
  crypt('123456', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{"full_name":"ماجد فهد"}',
  now(), now(), '', '', ''
) ON CONFLICT (id) DO NOTHING;

-- User 6: ناصر محمد (Supervisor - Riyadh Branch)
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change_token_new, recovery_token
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  '22222222-2222-2222-2222-222222222006',
  'authenticated', 'authenticated',
  'nasser.mohamed@insurance.com',
  crypt('123456', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{"full_name":"ناصر محمد"}',
  now(), now(), '', '', ''
) ON CONFLICT (id) DO NOTHING;

-- User 7: عمر سعود (Group Leader)
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change_token_new, recovery_token
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  '22222222-2222-2222-2222-222222222007',
  'authenticated', 'authenticated',
  'omar.saud@insurance.com',
  crypt('123456', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{"full_name":"عمر سعود"}',
  now(), now(), '', '', ''
) ON CONFLICT (id) DO NOTHING;

-- User 8: خالد أحمد (Agent)
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change_token_new, recovery_token
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  '22222222-2222-2222-2222-222222222008',
  'authenticated', 'authenticated',
  'khaled.ahmed@insurance.com',
  crypt('123456', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{"full_name":"خالد أحمد"}',
  now(), now(), '', '', ''
) ON CONFLICT (id) DO NOTHING;

-- User 9: فيصل سلمان (Agent)
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change_token_new, recovery_token
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  '22222222-2222-2222-2222-222222222009',
  'authenticated', 'authenticated',
  'faisal.salman@insurance.com',
  crypt('123456', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{"full_name":"فيصل سلمان"}',
  now(), now(), '', '', ''
) ON CONFLICT (id) DO NOTHING;

-- User 10: راشد محمد (Agent - Riyadh Branch)
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change_token_new, recovery_token
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  '22222222-2222-2222-2222-222222222010',
  'authenticated', 'authenticated',
  'rashed.mohamed@insurance.com',
  crypt('123456', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{"full_name":"راشد محمد"}',
  now(), now(), '', '', ''
) ON CONFLICT (id) DO NOTHING;

-- Create identities for users
INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
SELECT
  gen_random_uuid(),
  id,
  email,
  jsonb_build_object('sub', id, 'email', email),
  'email',
  now(), now(), now()
FROM auth.users
WHERE NOT EXISTS (SELECT 1 FROM auth.identities WHERE "user_id" = auth.users.id);

-- Create sessions
INSERT INTO auth.sessions (id, user_id, created_at, updated_at)
SELECT
  gen_random_uuid(),
  id,
  now(), now()
FROM auth.users
WHERE NOT EXISTS (SELECT 1 FROM auth.sessions WHERE "user_id" = auth.users.id);
