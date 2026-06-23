
-- 1. Update Auth Metadata to include roles (This is crucial for RLS)
UPDATE auth.users SET raw_app_meta_data = jsonb_set(COALESCE(raw_app_meta_data, '{}'::jsonb), '{role}', '"super_admin"') WHERE email = 'tiano.salam@gmail.com';
UPDATE auth.users SET raw_app_meta_data = jsonb_set(COALESCE(raw_app_meta_data, '{}'::jsonb), '{role}', '"dev_manager"') WHERE email = 'm.elgarsha33@gmail.com';
UPDATE auth.users SET raw_app_meta_data = jsonb_set(COALESCE(raw_app_meta_data, '{}'::jsonb), '{role}', '"general_supervisor"') WHERE email = 'smra7411@gmail.com';
UPDATE auth.users SET raw_app_meta_data = jsonb_set(COALESCE(raw_app_meta_data, '{}'::jsonb), '{role}', '"supervisor"') WHERE email = 'tarek.salam3@gmail.com';
UPDATE auth.users SET raw_app_meta_data = jsonb_set(COALESCE(raw_app_meta_data, '{}'::jsonb), '{role}', '"supervisor"') WHERE email = 'donianouraldein@gmail.com';
UPDATE auth.users SET raw_app_meta_data = jsonb_set(COALESCE(raw_app_meta_data, '{}'::jsonb), '{role}', '"team_leader"') WHERE email = 'magdymohammed4992@gmail.com';
UPDATE auth.users SET raw_app_meta_data = jsonb_set(COALESCE(raw_app_meta_data, '{}'::jsonb), '{role}', '"team_leader"') WHERE email = 'dohamostafa657@gmail.com';
UPDATE auth.users SET raw_app_meta_data = jsonb_set(COALESCE(raw_app_meta_data, '{}'::jsonb), '{role}', '"team_leader"') WHERE email = 'sohier.sokar333@gmail.com';
UPDATE auth.users SET raw_app_meta_data = jsonb_set(COALESCE(raw_app_meta_data, '{}'::jsonb), '{role}', '"agent"') WHERE email = 'm55103583@gmail.com';

-- 2. Update Profiles to ensure roles match
UPDATE public.profiles SET role = 'super_admin' WHERE email = 'tiano.salam@gmail.com';
UPDATE public.profiles SET role = 'dev_manager' WHERE email = 'm.elgarsha33@gmail.com';
UPDATE public.profiles SET role = 'general_supervisor' WHERE email = 'smra7411@gmail.com';
UPDATE public.profiles SET role = 'supervisor' WHERE email = 'tarek.salam3@gmail.com';
UPDATE public.profiles SET role = 'supervisor' WHERE email = 'donianouraldein@gmail.com';
UPDATE public.profiles SET role = 'team_leader' WHERE email = 'magdymohammed4992@gmail.com';
UPDATE public.profiles SET role = 'team_leader' WHERE email = 'dohamostafa657@gmail.com';
UPDATE public.profiles SET role = 'team_leader' WHERE email = 'sohier.sokar333@gmail.com';
UPDATE public.profiles SET role = 'agent' WHERE email = 'm55103583@gmail.com';

-- 3. Simplify RLS on profiles for testing to ensure visibility
DROP POLICY IF EXISTS profiles_select_all ON public.profiles;
CREATE POLICY profiles_select_all ON public.profiles FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS profiles_admin_all ON public.profiles;
CREATE POLICY profiles_admin_all ON public.profiles FOR ALL TO authenticated USING (true) WITH CHECK (true);
