#!/usr/bin/env python3
"""Generate realistic test data for the Insurance CRM system"""
import requests
import json
from datetime import datetime, timedelta
import random

SUPABASE_URL = "https://mlhxcfxmqgegynzpofsr.supabase.co"
ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1saHhjZnhtcWdlZ3luenBvZnNyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIwNzI4NjEsImV4cCI6MjA5NzY0ODg2MX0.85lwauyuYxvp4IuYeDpMt6uJyz0aUsDV-W3Hx9G9lC0"

# Login as Super Admin
login_response = requests.post(
    f"{SUPABASE_URL}/auth/v1/token?grant_type=password",
    headers={"apikey": ANON_KEY, "Content-Type": "application/json"},
    json={"email": "tiano.salam@gmail.com", "password": "123456"}
)

if login_response.status_code != 200:
    print(f"Login failed: {login_response.status_code}")
    exit(1)

token = login_response.json()['access_token']
print("✓ Logged in as Super Admin")

# Get branches
branches_response = requests.get(
    f"{SUPABASE_URL}/rest/v1/branches?select=id,name",
    headers={"apikey": ANON_KEY, "Authorization": f"Bearer {token}"}
)
branches = branches_response.json()
print(f"✓ Found {len(branches)} branches")

# Get users
users_response = requests.get(
    f"{SUPABASE_URL}/rest/v1/profiles?select=id,full_name,role",
    headers={"apikey": ANON_KEY, "Authorization": f"Bearer {token}"}
)
users = users_response.json()
print(f"✓ Found {len(users)} users")

agents = [u for u in users if u['role'] == 'agent']
print(f"✓ Found {len(agents)} agents")

# Create test clients
print("\n=== Creating Test Clients ===")
client_names = ["أحمد محمد علي", "فاطمة عبدالله حسن", "محمود إبراهيم سالم", "ليلى محمد أحمد", "علي حسن محمود"]

clients = []
for i, name in enumerate(client_names):
    client_data = {
        "name": name,
        "national_id": f"30{i:08d}",
        "phone": f"01001{i:06d}",
        "address": "شارع النيل، القاهرة",
        "job": random.choice(["مهندس", "طبيب", "معلم"]),
        "agent_id": agents[i % len(agents)]['id'],
        "branch_id": branches[0]['id']
    }
    
    client_response = requests.post(
        f"{SUPABASE_URL}/rest/v1/clients",
        headers={"apikey": ANON_KEY, "Authorization": f"Bearer {token}", "Content-Type": "application/json", "Prefer": "return=representation"},
        json=client_data
    )
    
    if client_response.status_code in [200, 201]:
        client = client_response.json()
        if isinstance(client, list):
            clients.append(client[0])
        else:
            clients.append(client)
        print(f"✓ Created client: {name}")
    else:
        print(f"✗ Failed: {client_response.status_code} - {client_response.text[:100]}")

print(f"\n✓ Created {len(clients)} test clients")

# Create test policies
print("\n=== Creating Test Policies ===")
policies = []
companies = ["الأهلية", "التعاونية", "الشرقية", "الدولية"]

for i, client in enumerate(clients):
    policy_data = {
        "policy_number": f"POL-2026-{i+1:05d}",
        "client_id": client['id'],
        "agent_id": client['agent_id'],
        "product": random.choice(["تأمين حياة", "تأمين صحي"]),
        "insurance_company": random.choice(companies),
        "coverage_amount": random.choice([50000, 100000, 200000]),
        "annual_premium": random.randint(1000, 5000),
        "issue_date": (datetime.now() - timedelta(days=random.randint(1, 30))).strftime("%Y-%m-%d"),
        "start_date": (datetime.now() - timedelta(days=random.randint(1, 30))).strftime("%Y-%m-%d"),
        "status": "active",
        "payment_frequency": random.choice(["monthly", "quarterly"])
    }
    
    policy_response = requests.post(
        f"{SUPABASE_URL}/rest/v1/policies",
        headers={"apikey": ANON_KEY, "Authorization": f"Bearer {token}", "Content-Type": "application/json", "Prefer": "return=representation"},
        json=policy_data
    )
    
    if policy_response.status_code in [200, 201]:
        policy = policy_response.json()
        if isinstance(policy, list):
            policies.append(policy[0])
        else:
            policies.append(policy)
        print(f"✓ Created policy: {policy_data['policy_number']}")
    else:
        print(f"✗ Failed: {policy_response.status_code}")

print(f"\n✓ Created {len(policies)} test policies")

# Create test installments
print("\n=== Creating Test Installments ===")
installments = []
for policy in policies:
    num_installments = random.randint(3, 6)
    for inst_num in range(1, num_installments + 1):
        due_date = (datetime.now() + timedelta(days=30 * inst_num)).strftime("%Y-%m-%d")
        installment_data = {
            "policy_id": policy['id'],
            "installment_number": inst_num,
            "amount": policy['annual_premium'] / num_installments,
            "due_date": due_date,
            "status": random.choice(["pending", "paid"]) if inst_num <= 2 else "pending",
            "paid_date": (datetime.now() - timedelta(days=random.randint(0, 10))).strftime("%Y-%m-%d") if inst_num <= 2 else None
        }
        
        inst_response = requests.post(
            f"{SUPABASE_URL}/rest/v1/installments",
            headers={"apikey": ANON_KEY, "Authorization": f"Bearer {token}", "Content-Type": "application/json", "Prefer": "return=representation"},
            json=installment_data
        )
        
        if inst_response.status_code in [200, 201]:
            inst = inst_response.json()
            if isinstance(inst, list):
                installments.append(inst[0])
            else:
                installments.append(inst)

print(f"\n✓ Created {len(installments)} test installments")

# Create test collections
print("\n=== Creating Test Collections ===")
collections_count = 0
for installment in installments:
    if installment['status'] == 'paid':
        collection_data = {
            "installment_id": installment['id'],
            "policy_id": installment['policy_id'],
            "amount": installment['amount'],
            "collection_date": installment['paid_date'],
            "collection_category": random.choice(["new", "first_year"]),
            "is_new_business": random.random() > 0.5,
            "receipt_number": f"REC-{collections_count+1:05d}",
            "collected_by": agents[0]['id']
        }
        
        coll_response = requests.post(
            f"{SUPABASE_URL}/rest/v1/collections",
            headers={"apikey": ANON_KEY, "Authorization": f"Bearer {token}", "Content-Type": "application/json", "Prefer": "return=representation"},
            json=collection_data
        )
        
        if coll_response.status_code in [200, 201]:
            collections_count += 1

print(f"\n✓ Created {collections_count} test collections")
print("\n✅ Test data generation completed!")
