
-- 1. Ensure Branch exists
INSERT INTO public.branches (id, name, code, is_active) 
VALUES ('130018eb-64d6-4b7a-8667-e3ca5dd5ecdc', 'طنطا 3', 'TANTA3', true)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, code = EXCLUDED.code, is_active = true;

-- 2. Update passwords for all users to 123456 in auth.users
-- Note: This requires pgcrypto extension which is usually enabled in Supabase
UPDATE auth.users 
SET encrypted_password = crypt('123456', gen_salt('bf'))
WHERE email IN (
    'tiano.salam@gmail.com', 
    'm.elgarsha33@gmail.com', 
    'smra7411@gmail.com', 
    'tarek.salam3@gmail.com', 
    'donianouraldein@gmail.com', 
    'magdymohammed4992@gmail.com', 
    'dohamostafa657@gmail.com', 
    'sohier.sokar333@gmail.com', 
    'm55103583@gmail.com'
);

-- 3. Update Profiles and Hierarchy
-- Admin
UPDATE public.profiles SET full_name = 'Admin', role = 'super_admin', branch_id = '130018eb-64d6-4b7a-8667-e3ca5dd5ecdc', manager_id = NULL WHERE email = 'tiano.salam@gmail.com';

-- محمد الجرشة -> Admin
UPDATE public.profiles SET full_name = 'محمد الجرشة', role = 'dev_manager', branch_id = '130018eb-64d6-4b7a-8667-e3ca5dd5ecdc', manager_id = (SELECT id FROM public.profiles WHERE email = 'tiano.salam@gmail.com') WHERE email = 'm.elgarsha33@gmail.com';

-- سمر الهواري -> محمد الجرشة
UPDATE public.profiles SET full_name = 'سمر الهواري', role = 'general_supervisor', branch_id = '130018eb-64d6-4b7a-8667-e3ca5dd5ecdc', manager_id = (SELECT id FROM public.profiles WHERE email = 'm.elgarsha33@gmail.com') WHERE email = 'smra7411@gmail.com';

-- طارق سلام -> سمر الهواري
UPDATE public.profiles SET full_name = 'طارق سلام', role = 'supervisor', branch_id = '130018eb-64d6-4b7a-8667-e3ca5dd5ecdc', manager_id = (SELECT id FROM public.profiles WHERE email = 'smra7411@gmail.com') WHERE email = 'tarek.salam3@gmail.com';

-- دولت نور الدين -> سمر الهواري
UPDATE public.profiles SET full_name = 'دولت نور الدين', role = 'supervisor', branch_id = '130018eb-64d6-4b7a-8667-e3ca5dd5ecdc', manager_id = (SELECT id FROM public.profiles WHERE email = 'smra7411@gmail.com') WHERE email = 'donianouraldein@gmail.com';

-- محمد المغربي -> طارق سلام
UPDATE public.profiles SET full_name = 'محمد المغربي', role = 'team_leader', branch_id = '130018eb-64d6-4b7a-8667-e3ca5dd5ecdc', manager_id = (SELECT id FROM public.profiles WHERE email = 'tarek.salam3@gmail.com') WHERE email = 'magdymohammed4992@gmail.com';

-- ضحى مصطفى -> طارق سلام
UPDATE public.profiles SET full_name = 'ضحى مصطفى', role = 'team_leader', branch_id = '130018eb-64d6-4b7a-8667-e3ca5dd5ecdc', manager_id = (SELECT id FROM public.profiles WHERE email = 'tarek.salam3@gmail.com') WHERE email = 'dohamostafa657@gmail.com';

-- سهير عبد الحليم -> دولت نور الدين
UPDATE public.profiles SET full_name = 'سهير عبد الحليم', role = 'team_leader', branch_id = '130018eb-64d6-4b7a-8667-e3ca5dd5ecdc', manager_id = (SELECT id FROM public.profiles WHERE email = 'donianouraldein@gmail.com') WHERE email = 'sohier.sokar333@gmail.com';

-- أمنية إبراهيم -> محمد المغربي
UPDATE public.profiles SET full_name = 'أمنية إبراهيم', role = 'agent', branch_id = '130018eb-64d6-4b7a-8667-e3ca5dd5ecdc', manager_id = (SELECT id FROM public.profiles WHERE email = 'magdymohammed4992@gmail.com') WHERE email = 'm55103583@gmail.com';

-- Ensure all users are active
UPDATE public.profiles SET is_active = true WHERE email IN (
    'tiano.salam@gmail.com', 
    'm.elgarsha33@gmail.com', 
    'smra7411@gmail.com', 
    'tarek.salam3@gmail.com', 
    'donianouraldein@gmail.com', 
    'magdymohammed4992@gmail.com', 
    'dohamostafa657@gmail.com', 
    'sohier.sokar333@gmail.com', 
    'm55103583@gmail.com'
);
