
UPDATE auth.users SET raw_app_meta_data = jsonb_set(COALESCE(raw_app_meta_data, '{}'::jsonb), '{role}', '"super_admin"') WHERE email = 'tiano.salam@gmail.com';
UPDATE auth.users SET raw_app_meta_data = jsonb_set(COALESCE(raw_app_meta_data, '{}'::jsonb), '{role}', '"dev_manager"') WHERE email = 'm.elgarsha33@gmail.com';
UPDATE auth.users SET raw_app_meta_data = jsonb_set(COALESCE(raw_app_meta_data, '{}'::jsonb), '{role}', '"general_supervisor"') WHERE email = 'smra7411@gmail.com';
UPDATE auth.users SET raw_app_meta_data = jsonb_set(COALESCE(raw_app_meta_data, '{}'::jsonb), '{role}', '"supervisor"') WHERE email = 'tarek.salam3@gmail.com';
UPDATE auth.users SET raw_app_meta_data = jsonb_set(COALESCE(raw_app_meta_data, '{}'::jsonb), '{role}', '"supervisor"') WHERE email = 'donianouraldein@gmail.com';
UPDATE auth.users SET raw_app_meta_data = jsonb_set(COALESCE(raw_app_meta_data, '{}'::jsonb), '{role}', '"team_leader"') WHERE email = 'magdymohammed4992@gmail.com';
UPDATE auth.users SET raw_app_meta_data = jsonb_set(COALESCE(raw_app_meta_data, '{}'::jsonb), '{role}', '"team_leader"') WHERE email = 'dohamostafa657@gmail.com';
UPDATE auth.users SET raw_app_meta_data = jsonb_set(COALESCE(raw_app_meta_data, '{}'::jsonb), '{role}', '"team_leader"') WHERE email = 'sohier.sokar333@gmail.com';
UPDATE auth.users SET raw_app_meta_data = jsonb_set(COALESCE(raw_app_meta_data, '{}'::jsonb), '{role}', '"agent"') WHERE email = 'm55103583@gmail.com';
