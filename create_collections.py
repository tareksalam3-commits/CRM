import os
import json
import requests
from datetime import datetime, timedelta
import random

url = os.getenv("VITE_SUPABASE_URL")
key = os.getenv("VITE_SUPABASE_ANON_KEY")

if not url or not key:
    print("Missing Supabase credentials")
    exit(1)

headers = {
    "apikey": key,
    "Authorization": f"Bearer {key}",
    "Content-Type": "application/json"
}

# Get all installments
print("Fetching installments...")
response = requests.get(
    f"{url}/rest/v1/installments?select=*",
    headers=headers
)
installments = response.json()
print(f"Found {len(installments)} installments")

# Create collections for some installments
print("\nCreating collections...")
collections_created = 0

for i, inst in enumerate(installments[:10]):  # Create collections for first 10 installments
    collection_date = (datetime.now() - timedelta(days=random.randint(1, 30))).strftime("%Y-%m-%d")
    
    collection_data = {
        "installment_id": inst["id"],
        "policy_id": inst["policy_id"],
        "amount": inst["amount"],
        "collection_date": collection_date,
        "collected_by": "00000000-0000-0000-0000-000000000001",  # Admin user
        "payment_method": random.choice(["cash", "check", "bank_transfer"]),
        "receipt_number": f"REC-{2026:04d}-{i+1:06d}",
        "notes": f"Collection for installment {inst['installment_number']}"
    }
    
    response = requests.post(
        f"{url}/rest/v1/collections",
        headers=headers,
        json=collection_data
    )
    
    if response.status_code in [200, 201]:
        collections_created += 1
        print(f"✓ Created collection {i+1}")
    else:
        print(f"✗ Failed to create collection {i+1}: {response.text}")

print(f"\nTotal collections created: {collections_created}")

# Verify collections were created
print("\nVerifying collections...")
response = requests.get(
    f"{url}/rest/v1/collections?select=*",
    headers=headers
)
collections = response.json()
print(f"Total collections in database: {len(collections)}")
