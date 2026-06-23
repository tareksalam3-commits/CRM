#!/usr/bin/env python3
import requests
import json

SUPABASE_URL = "https://mlhxcfxmqgegynzpofsr.supabase.co"
SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1saHhjZnhtcWdlZ3luenBvZnNyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MjA3Mjg2MSwiZXhwIjoyMDk3NjQ4ODYxfQ.u-6VqZPVzLCqBIr3Ydvvj_L3OJvLcVtVXLcxbLMxKkc"

users_to_reset = [
    "tiano.salam@gmail.com",
    "m.elgarsha33@gmail.com",
    "smra7411@gmail.com",
    "tarek.salam3@gmail.com",
    "magdymohammed4992@gmail.com",
    "m55103583@gmail.com",
    "test_crm_user@example.com",
    "test_agent@example.com",
    "donianouraldein@gmail.com",
    "sohier.sokar333@gmail.com",
    "dohamostafa657@gmail.com"
]

headers = {
    "apikey": SERVICE_KEY,
    "Authorization": f"Bearer {SERVICE_KEY}",
    "Content-Type": "application/json"
}

# First, get all users
response = requests.get(
    f"{SUPABASE_URL}/auth/v1/admin/users",
    headers=headers
)

if response.status_code != 200:
    print(f"Error fetching users: {response.status_code}")
    print(response.text)
    exit(1)

users = response.json()
print(f"Found {len(users)} users")

# Reset password for each user
for user in users:
    email = user.get("email")
    user_id = user.get("id")
    
    print(f"Resetting password for {email}...")
    
    reset_response = requests.put(
        f"{SUPABASE_URL}/auth/v1/admin/users/{user_id}",
        headers=headers,
        json={"password": "123456"}
    )
    
    if reset_response.status_code == 200:
        print(f"✓ Password reset for {email}")
    else:
        print(f"✗ Failed to reset password for {email}: {reset_response.status_code}")
        print(reset_response.text)

print("\nPassword reset complete!")
