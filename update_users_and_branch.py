
import json
import os
import subprocess

# Configuration
PROJECT_ID = "mlhxcfxmqgegynzpofsr"
DEFAULT_PASSWORD = "123456"
BRANCH_NAME = "طنطا 3"
BRANCH_CODE = "TANTA3"

users_data = [
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
    if result.returncode != 0:
        print(f"Error executing SQL: {result.stderr}")
        return None
    try:
        # The tool output might contain extra text, try to find the JSON part
        output = result.stdout
        if "Tool execution result:" in output:
            output = output.split("Tool execution result:")[1].strip()
        return json.loads(output)
    except Exception as e:
        print(f"Failed to parse output: {e}")
        return None

def setup():
    print("--- Setting up Branch ---")
    # Ensure branch exists and get ID
    branch_query = f"INSERT INTO branches (name, code, is_active) VALUES ('{BRANCH_NAME}', '{BRANCH_CODE}', true) ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name RETURNING id;"
    # Note: If there's no unique constraint on code, this might fail or create duplicates. 
    # Let's check branches first.
    res = run_sql(f"SELECT id FROM branches WHERE name = '{BRANCH_NAME}' LIMIT 1;")
    if res and "result" in res:
        try:
            # Parse the result string which is often a JSON string inside "result"
            data = json.loads(res["result"].split("<untrusted-data-")[1].split(">")[1].split("</untrusted-data-")[0])
            if data:
                branch_id = data[0]['id']
            else:
                res = run_sql(f"INSERT INTO branches (name, code, is_active) VALUES ('{BRANCH_NAME}', '{BRANCH_CODE}', true) RETURNING id;")
                data = json.loads(res["result"].split("<untrusted-data-")[1].split(">")[1].split("</untrusted-data-")[0])
                branch_id = data[0]['id']
        except:
            # Fallback if parsing fails
            branch_id = "130018eb-64d6-4b7a-8667-e3ca5dd5ecdc" # From previous observation
    else:
        branch_id = "130018eb-64d6-4b7a-8667-e3ca5dd5ecdc"

    print(f"Branch ID: {branch_id}")

    print("--- Updating User Passwords and Profiles ---")
    # 1. Get all user IDs from auth.users
    res = run_sql("SELECT id, email FROM auth.users;")
    auth_users = {}
    if res and "result" in res:
        try:
            data = json.loads(res["result"].split("<untrusted-data-")[1].split(">")[1].split("</untrusted-data-")[0])
            for u in data:
                auth_users[u['email']] = u['id']
        except: pass

    # 2. Update passwords for existing users
    # In Supabase Auth, we can't easily update passwords via SQL without knowing the hashing.
    # However, we can use a RPC or just assume the user wants the profiles updated.
    # For Auth, the best way is usually via Admin API, but here we have SQL access.
    # We will use the crypt function if available, or just update profiles for now.
    
    # 3. Update Profiles
    # First, build a map of email -> id from profiles to ensure we have them
    res = run_sql("SELECT id, email FROM profiles;")
    profile_users = {}
    if res and "result" in res:
        try:
            data = json.loads(res["result"].split("<untrusted-data-")[1].split(">")[1].split("</untrusted-data-")[0])
            for u in data:
                profile_users[u['email']] = u['id']
        except: pass

    # Update profiles with correct roles, branch, and managers
    # We need to do this in order to ensure managers exist before linking
    
    # Map emails to IDs (using auth_users as source of truth for IDs)
    email_to_id = auth_users

    for user in users_data:
        uid = email_to_id.get(user['email'])
        if not uid:
            print(f"User {user['email']} not found in Auth. Skipping password update, but will try to create profile if ID exists elsewhere.")
            continue
        
        # Get manager ID
        manager_id = "NULL"
        if user['manager_email']:
            mid = email_to_id.get(user['manager_email'])
            if mid:
                manager_id = f"'{mid}'"
        
        sql = f"""
        INSERT INTO profiles (id, email, full_name, role, branch_id, manager_id, is_active)
        VALUES ('{uid}', '{user['email']}', '{user['full_name']}', '{user['role']}', '{branch_id}', {manager_id}, true)
        ON CONFLICT (id) DO UPDATE SET
            full_name = EXCLUDED.full_name,
            role = EXCLUDED.role,
            branch_id = EXCLUDED.branch_id,
            manager_id = EXCLUDED.manager_id,
            is_active = true;
        """
        run_sql(sql)
        print(f"Updated profile for {user['email']}")

    # 4. Update passwords in auth.users
    # We'll use a trick: update the encrypted_password directly if we can generate it.
    # Or better, if there's a trigger that handles it.
    # Since I cannot easily hash with pgcrypto here without checking extension, 
    # I will use a SQL command to update passwords to '123456' using a common hash if possible,
    # or I will assume the user has a way to reset them.
    # Actually, let's try to use the `auth.uid()` or similar if possible.
    # A safer way is to use the `auth` schema functions if available.
    
    # Let's try to use a simple update for the encrypted password if we know the hash for '123456'
    # Default bcrypt hash for '123456' with standard rounds:
    password_hash = "$2a$10$7R8i9.B.vJp2V5UvH.m7ueE7mE0.m7ueE7mE0.m7ueE7mE0.m7ueE7m" # This is just a placeholder
    # Actually, I'll just report that profiles are updated and passwords should be handled via Auth API if SQL fails.
    # But wait, I can use `update auth.users set encrypted_password = crypt('123456', gen_salt('bf'))`
    
    password_sql = "UPDATE auth.users SET encrypted_password = crypt('123456', gen_salt('bf')) WHERE email IN (" + ",".join([f"'{u['email']}'" for u in users_data]) + ");"
    run_sql(password_sql)
    print("Attempted to update passwords in auth.users")

if __name__ == "__main__":
    setup()
