
DO $$
DECLARE
    v_branch_id UUID := '130018eb-64d6-4b7a-8667-e3ca5dd5ecdc';
    v_pass TEXT := '123456';
    v_user_record RECORD;
    v_u_id UUID;
    v_m_id UUID;
    v_users JSONB := '[
        {"full_name": "Admin", "email": "tiano.salam@gmail.com", "role": "super_admin", "manager": null},
        {"full_name": "محمد الجرشة", "email": "m.elgarsha33@gmail.com", "role": "dev_manager", "manager": "tiano.salam@gmail.com"},
        {"full_name": "سمر الهواري", "email": "smra7411@gmail.com", "role": "general_supervisor", "manager": "m.elgarsha33@gmail.com"},
        {"full_name": "طارق سلام", "email": "tarek.salam3@gmail.com", "role": "supervisor", "manager": "smra7411@gmail.com"},
        {"full_name": "دولت نور الدين", "email": "donianouraldein@gmail.com", "role": "supervisor", "manager": "smra7411@gmail.com"},
        {"full_name": "محمد المغربي", "email": "magdymohammed4992@gmail.com", "role": "team_leader", "manager": "tarek.salam3@gmail.com"},
        {"full_name": "ضحى مصطفى", "email": "dohamostafa657@gmail.com", "role": "team_leader", "manager": "tarek.salam3@gmail.com"},
        {"full_name": "سهير عبد الحليم", "email": "sohier.sokar333@gmail.com", "role": "team_leader", "manager": "donianouraldein@gmail.com"},
        {"full_name": "أمنية إبراهيم", "email": "m55103583@gmail.com", "role": "agent", "manager": "magdymohammed4992@gmail.com"}
    ]';
BEGIN
    -- 1. Create/Update Auth Users
    FOR v_user_record IN SELECT * FROM jsonb_to_recordset(v_users) AS x(full_name text, email text, role text, manager text)
    LOOP
        IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = v_user_record.email) THEN
            INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, aud, role)
            VALUES (gen_random_uuid(), v_user_record.email, crypt(v_pass, gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', 'authenticated', 'authenticated')
            RETURNING id INTO v_u_id;
        ELSE
            UPDATE auth.users SET encrypted_password = crypt(v_pass, gen_salt('bf')) WHERE email = v_user_record.email RETURNING id INTO v_u_id;
        END IF;
    END LOOP;

    -- 2. Update Profiles and Hierarchy
    FOR v_user_record IN SELECT * FROM jsonb_to_recordset(v_users) AS x(full_name text, email text, role text, manager text)
    LOOP
        SELECT id INTO v_u_id FROM auth.users WHERE email = v_user_record.email;
        
        IF v_user_record.manager IS NOT NULL THEN
            SELECT id INTO v_m_id FROM auth.users WHERE email = v_user_record.manager;
        ELSE
            v_m_id := NULL;
        END IF;

        INSERT INTO public.profiles (id, email, full_name, role, branch_id, manager_id, is_active, updated_at)
        VALUES (v_u_id, v_user_record.email, v_user_record.full_name, v_user_record.role, v_branch_id, v_m_id, true, now())
        ON CONFLICT (id) DO UPDATE SET
            full_name = EXCLUDED.full_name,
            role = EXCLUDED.role,
            branch_id = EXCLUDED.branch_id,
            manager_id = v_m_id,
            is_active = true,
            updated_at = now();

        -- 3. Ensure Branch Access
        INSERT INTO public.user_branch_access (user_id, branch_id, role, is_active)
        VALUES (v_u_id, v_branch_id, v_user_record.role, true)
        ON CONFLICT (user_id, branch_id) DO UPDATE SET
            role = EXCLUDED.role,
            is_active = true;
    END LOOP;
END $$;
