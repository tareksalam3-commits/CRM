
import requests
import json

SUPABASE_URL = "https://mlhxcfxmqgegynzpofsr.supabase.co"
ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1saHhjZnhtcWdlZ3luenBvZnNyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIwNzI4NjEsImV4cCI6MjA5NzY0ODg2MX0.85lwauyuYxvp4IuYeDpMt6uJyz0aUsDV-W3Hx9G9lC0"

users = [
    ("tiano.salam@gmail.com", "super_admin"),
    ("m.elgarsha33@gmail.com", "dev_manager"),
    ("smra7411@gmail.com", "general_supervisor"),
    ("tarek.salam3@gmail.com", "supervisor"),
    ("magdymohammed4992@gmail.com", "team_leader"),
    ("m55103583@gmail.com", "agent")
]

password = "123456"

def test_user_permissions(email, role):
    print(f"\n--- Testing User: {email} (Role: {role}) ---")
    url = f"{SUPABASE_URL}/auth/v1/token?grant_type=password"
    headers = {
        "apikey": ANON_KEY,
        "Content-Type": "application/json"
    }
    payload = {
        "email": email,
        "password": password
    }
    response = requests.post(url, headers=headers, json=payload)
    if response.status_code != 200:
        print(f"❌ Login Failed: {email}")
        return

    token = response.json()['access_token']
    auth_headers = {
        "apikey": ANON_KEY,
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }

    # Test fetching profiles (Users)
    res_profiles = requests.get(f"{SUPABASE_URL}/rest/v1/profiles?select=id,full_name,role", headers=auth_headers)
    profiles_count = len(res_profiles.json()) if res_profiles.status_code == 200 else 0
    print(f"Profiles visible: {profiles_count}")

    # Test fetching clients
    res_clients = requests.get(f"{SUPABASE_URL}/rest/v1/clients?select=id", headers=auth_headers)
    clients_count = len(res_clients.json()) if res_clients.status_code == 200 else 0
    print(f"Clients visible: {clients_count}")

    # Role specific expectations
    if role == 'agent':
        if profiles_count > 1: print("⚠️ Warning: Agent should only see self profile")
    elif role == 'team_leader':
        print("Team Leader should see self and subordinates")
    
    print(f"✅ Finished test for {role}")

if __name__ == "__main__":
    for email, role in users:
        test_user_permissions(email, role)
