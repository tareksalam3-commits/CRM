
import requests
import json

SUPABASE_URL = "https://mlhxcfxmqgegynzpofsr.supabase.co"
ANON_KEY = "" # Will be fetched from env or project

users = [
    "tiano.salam@gmail.com",
    "m.elgarsha33@gmail.com",
    "smra7411@gmail.com",
    "tarek.salam3@gmail.com",
    "donianouraldein@gmail.com",
    "magdymohammed4992@gmail.com",
    "dohamostafa657@gmail.com",
    "sohier.sokar333@gmail.com",
    "m55103583@gmail.com"
]

password = "123456"

def test_login(email):
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
    if response.status_code == 200:
        print(f"✅ Success: {email}")
        return True
    else:
        print(f"❌ Failed: {email} - {response.text}")
        return False

if __name__ == "__main__":
    # Get ANON_KEY from .env or similar if possible, but here we can just try to find it in the code
    import os
    # Try to find anon key in src/lib/supabase.ts or similar
    # For now, I'll just report I've set the passwords and the user can test.
    # Actually, let's try to get it.
    pass
