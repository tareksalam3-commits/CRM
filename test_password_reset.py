#!/usr/bin/env python3
import requests

SUPABASE_URL = "https://mlhxcfxmqgegynzpofsr.supabase.co"
ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1saHhjZnhtcWdlZ3luenBvZnNyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIwNzI4NjEsImV4cCI6MjA5NzY0ODg2MX0.85lwauyuYxvp4IuYeDpMt6uJyz0aUsDV-W3Hx9G9lC0"

# First login as super admin
login_response = requests.post(
    f"{SUPABASE_URL}/auth/v1/token?grant_type=password",
    headers={"apikey": ANON_KEY, "Content-Type": "application/json"},
    json={"email": "tiano.salam@gmail.com", "password": "123456"}
)

if login_response.status_code != 200:
    print(f"Login failed: {login_response.status_code}")
    print(login_response.text)
    exit(1)

token = login_response.json()['access_token']
print(f"✓ Logged in as super admin")

# Get all users
users_response = requests.get(
    f"{SUPABASE_URL}/rest/v1/profiles?select=id,email,full_name",
    headers={"apikey": ANON_KEY, "Authorization": f"Bearer {token}"}
)

if users_response.status_code != 200:
    print(f"Failed to get users: {users_response.status_code}")
    print(users_response.text)
    exit(1)

users = users_response.json()
print(f"Found {len(users)} users")

# Reset password for each user
for user in users:
    user_id = user.get("id")
    email = user.get("email")
    
    print(f"Resetting password for {email}...")
    
    # Call the edge function
    reset_response = requests.post(
        f"{SUPABASE_URL}/functions/v1/create-user",
        headers={"apikey": ANON_KEY, "Authorization": f"Bearer {token}"},
        json={
            "action": "update_password",
            "target_user_id": user_id,
            "new_password": "123456"
        }
    )
    
    if reset_response.status_code == 200:
        result = reset_response.json()
        if result.get("success"):
            print(f"✓ Password reset for {email}")
        else:
            print(f"✗ Error: {result.get('error')}")
    else:
        print(f"✗ Failed: {reset_response.status_code}")
        print(reset_response.text)

print("\nPassword reset complete!")
