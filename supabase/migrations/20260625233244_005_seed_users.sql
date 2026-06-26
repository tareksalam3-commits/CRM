/*
# Life Insurance CRM - Seed Users

1. Seed Data
- Insert all real users into the users table
- These users need to be linked to auth.users entries

2. Notes
- Password for all accounts: 123456
- Users are linked to auth.users via auth_id
*/

-- Insert users (they will need to sign up via auth API first)
-- This migration inserts the user profiles after auth accounts are created
-- The auth accounts will be created via the frontend or edge function

INSERT INTO users (auth_id, email, full_name, role, manager_id, phone, is_active)
VALUES
  (NULL, 'tiano.salam@gmail.com', 'Admin', 'super_admin', NULL, NULL, true),
  (NULL, 'm.elgarsha33@gmail.com', 'محمد الجرشة', 'dev_manager', NULL, NULL, true),
  (NULL, 'smra7411@gmail.com', 'سمر سمير الهواري', 'general_supervisor', NULL, NULL, true),
  (NULL, 'tarek.salam3@gmail.com', 'طارق سلام محمد', 'supervisor', NULL, NULL, true),
  (NULL, 'donianouraldeien@gmail.com', 'دولت أحمد إبراهيم', 'group_leader', NULL, NULL, true),
  (NULL, 'magdymohammed4992@gmail.com', 'محمد محمد المغربي', 'agent', NULL, NULL, true),
  (NULL, 'sohier.sokar333@gmail.com', 'سهير عبد الحليم', 'agent', NULL, NULL, true),
  (NULL, 'dohamostafa657@gmail.com', 'ضحى مصطفى بيومي علي', 'agent', NULL, NULL, true),
  (NULL, 'm55103583@gmail.com', 'أمنية إبراهيم', 'agent', NULL, NULL, true),
  (NULL, 'mahmudahmed12129@gmail.com', 'محمود حمود', 'agent', NULL, NULL, true)
ON CONFLICT (email) DO NOTHING;
