
import json
import subprocess

PROJECT_ID = "mlhxcfxmqgegynzpofsr"
DEFAULT_PASSWORD = "123456"
BRANCH_ID = "130018eb-64d6-4b7a-8667-e3ca5dd5ecdc" # طنطا 3

users_to_create = [
    {"full_name": "Admin", "email": "tiano.salam@gmail.com", "role": "super_admin", "manager_email": None},
    {"full_name": "محمد الجرشة", "email": "m.elgarsha33@gmail.com", "role": "dev_manager", "manager_email": "tiano.salam@gmail.com"},
    {"full_name": "سمر الهواري", "email": "smra7411@gmail.com", "role": "general_supervisor", "manager_email": "m.elgarsha33@gmail.com"},
    {"full_name": "طارق سلام", "email": "tarek.salam3@gmail.com", "role": "supervisor", "manager_email": "smra7411@gmail.com"},
    {"full_name": "دولت نور الدين", "email": "donianouraldein@gmail.com", "role": "supervisor", "manager_email": "smra7411@gmail.com"},
    {"full_name": "محمد المغربي", "email": "magdymohammed4992@gmail.com", "role": "team_leader", "manager_email": "tarek.salam3@gmail.com"},
    {"full_name": "ضحى مصطفى", "email": "dohamostafa657@gmail.com", "role": "team_leader", "manager_email": "tarek.salam3@gmail.com"},
    {"full_name": "سهير عبد الحليم", "email": "sohier.sokar333@gmail.com", "role": "team_leader", "manager_email": "donianouraldein@gmail.com"},
    {"full_name": "أمنية إبراهيم", "email": "m55103583@gmail.com", "role": "agent", "manager_email": "magdymohammed4992@gmail.com"}
]

def run_sql(query):
    input_json = json.dumps({"project_id": PROJECT_ID, "query": query})
    cmd = ["manus-mcp-cli", "tool", "call", "execute_sql", "--server", "supabase", "--input", input_json]
    result = subprocess.run(cmd, capture_output=True, text=True)
    return result.stdout

def create_user_in_auth(email):
    # This SQL will create user in auth.users if not exists
    # We use extensions like pgcrypto for password hashing
    sql = f"""
    DO $$
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = '{email}') THEN
            INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, recovery_sent_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
            VALUES (
                '00000000-0000-0000-0000-000000000000',
                gen_random_uuid(),
                'authenticated',
                'authenticated',
                '{email}',
                crypt('{DEFAULT_PASSWORD}', gen_salt('bf')),
                now(),
                now(),
                now(),
                '{{"provider":"email","providers":["email"]}}',
                '{{}}',
                now(),
                now(),
                '',
                '',
                '',
                ''
            );
        ELSE
            UPDATE auth.users SET encrypted_password = crypt('{DEFAULT_PASSWORD}', gen_salt('bf')) WHERE email = '{email}';
        END IF;
    END $$;
    """
    return run_sql(sql)

def setup_profiles():
    # 1. First ensure all users exist in Auth and have correct password
    for user in users_to_create:
        print(f"Ensuring Auth user: {user['email']}")
        create_user_in_auth(user['email'])

    # 2. Update profiles and hierarchy
    # We'll do this in a specific order or use subqueries to handle dependencies
    for user in users_to_create:
        print(f"Updating Profile: {user['email']}")
        manager_subquery = f"(SELECT id FROM public.profiles WHERE email = '{user['manager_email']}')" if user['manager_email'] else "NULL"
        
        sql = f"""
        DO $$
        DECLARE
            v_user_id UUID;
            v_manager_id UUID;
        BEGIN
            SELECT id INTO v_user_id FROM auth.users WHERE email = '{user['email']}';
            
            IF '{user['manager_email'] or ''}' != '' THEN
                SELECT id INTO v_manager_id FROM auth.users WHERE email = '{user['manager_email']}';
            ELSE
                v_manager_id := NULL;
            END IF;

            INSERT INTO public.profiles (id, email, full_name, role, branch_id, manager_id, is_active, created_at, updated_at)
            VALUES (v_user_id, '{user['email']}', '{user['full_name']}', '{user['role']}', '{BRANCH_ID}', v_manager_id, true, now(), now())
            ON CONFLICT (id) DO UPDATE SET
                full_name = EXCLUDED.full_name,
                role = EXCLUDED.role,
                branch_id = EXCLUDED.branch_id,
                manager_id = v_manager_id,
                is_active = true,
                updated_at = now();
            
            -- Ensure branch access
            INSERT INTO public.user_branch_access (user_id, branch_id, role, is_active)
            VALUES (v_user_id, '{BRANCH_ID}', '{user['role']}', true)
            ON CONFLICT (user_id, branch_id) DO UPDATE SET
                role = EXCLUDED.role,
                is_active = true;
        END $$;
        """
        run_sql(sql)

if __name__ == "__main__":
    setup_profiles()
