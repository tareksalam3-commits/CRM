import os
from supabase import create_client, Client

url = os.getenv("VITE_SUPABASE_URL")
key = os.getenv("VITE_SUPABASE_ANON_KEY")

if not url or not key:
    print("Missing Supabase credentials")
    exit(1)

supabase: Client = create_client(url, key)

# Check collections table
print("=== Checking Collections Table ===")
try:
    response = supabase.table("collections").select("*").execute()
    print(f"Total collections: {len(response.data)}")
    if response.data:
        print("Sample collection:")
        print(response.data[0])
except Exception as e:
    print(f"Error: {e}")

# Check unified_performance_metrics view
print("\n=== Checking Unified Performance Metrics View ===")
try:
    response = supabase.table("unified_performance_metrics").select("*").execute()
    print(f"Total metrics: {len(response.data)}")
    if response.data:
        print("Sample metric:")
        print(response.data[0])
except Exception as e:
    print(f"Error: {e}")

# Check installments
print("\n=== Checking Installments Table ===")
try:
    response = supabase.table("installments").select("*").limit(5).execute()
    print(f"Sample installments: {len(response.data)}")
    if response.data:
        print("Sample installment:")
        print(response.data[0])
except Exception as e:
    print(f"Error: {e}")
