#!/usr/bin/env python3
"""
Script to assign all users to "طنطا 3" branch with different roles
"""

import os
import sys
from supabase import create_client, Client

# Get Supabase credentials from environment
SUPABASE_URL = os.getenv("VITE_SUPABASE_URL")
SUPABASE_KEY = os.getenv("VITE_SUPABASE_ANON_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("❌ Error: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY environment variables are required")
    sys.exit(1)

# Initialize Supabase client
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

def get_branch_by_name(branch_name: str):
    """Get branch by name"""
    try:
        response = supabase.table("branches").select("*").ilike("name", f"%{branch_name}%").execute()
        if response.data and len(response.data) > 0:
            return response.data[0]
        return None
    except Exception as e:
        print(f"❌ Error fetching branch: {e}")
        return None

def get_all_users():
    """Get all users from profiles table"""
    try:
        response = supabase.table("profiles").select("*").execute()
        return response.data if response.data else []
    except Exception as e:
        print(f"❌ Error fetching users: {e}")
        return []

def assign_user_to_branch(user_id: str, branch_id: str, role: str):
    """Assign user to branch with specific role"""
    try:
        # Check if user already has access to this branch
        existing = supabase.table("user_branch_access").select("*").eq("user_id", user_id).eq("branch_id", branch_id).execute()
        
        if existing.data and len(existing.data) > 0:
            # Update existing access
            response = supabase.table("user_branch_access").update({
                "role": role,
                "is_active": True,
                "updated_at": "now()"
            }).eq("user_id", user_id).eq("branch_id", branch_id).execute()
            return True, "updated"
        else:
            # Insert new access
            response = supabase.table("user_branch_access").insert({
                "user_id": user_id,
                "branch_id": branch_id,
                "role": role,
                "is_active": True,
                "assigned_at": "now()",
                "updated_at": "now()"
            }).execute()
            return True, "created"
    except Exception as e:
        print(f"❌ Error assigning user to branch: {e}")
        return False, str(e)

def main():
    print("🔍 Fetching branch 'طنطا 3'...")
    branch = get_branch_by_name("طنطا 3")
    
    if not branch:
        print("❌ Branch 'طنطا 3' not found")
        sys.exit(1)
    
    branch_id = branch["id"]
    branch_name = branch["name"]
    print(f"✅ Found branch: {branch_name} (ID: {branch_id})")
    
    print("\n🔍 Fetching all users...")
    users = get_all_users()
    
    if not users:
        print("❌ No users found")
        sys.exit(1)
    
    print(f"✅ Found {len(users)} users")
    
    # Define role distribution
    # You can customize this based on your needs
    role_distribution = {
        0: "super_admin",      # First user as super_admin
        1: "dev_manager",      # Second user as dev_manager
        2: "general_supervisor", # Third user as general_supervisor
        3: "supervisor",       # Fourth user as supervisor
        4: "branch_manager",   # Fifth user as branch_manager
        5: "team_leader",      # Sixth user as team_leader
    }
    
    print("\n📋 Assigning users to branch...")
    print("-" * 80)
    
    success_count = 0
    error_count = 0
    
    for idx, user in enumerate(users):
        user_id = user["id"]
        user_name = user["full_name"]
        user_email = user["email"]
        
        # Assign role based on index, default to agent if more users than roles
        role = role_distribution.get(idx, "agent")
        
        success, action = assign_user_to_branch(user_id, branch_id, role)
        
        if success:
            status = "✅" if action == "created" else "🔄"
            print(f"{status} {user_name} ({user_email}) -> {role} [{action}]")
            success_count += 1
        else:
            print(f"❌ {user_name} ({user_email}) -> ERROR: {action}")
            error_count += 1
    
    print("-" * 80)
    print(f"\n📊 Summary:")
    print(f"   ✅ Success: {success_count}")
    print(f"   ❌ Errors: {error_count}")
    print(f"   📍 Branch: {branch_name}")
    
    if error_count == 0:
        print("\n🎉 All users have been successfully assigned to the branch!")
    else:
        print(f"\n⚠️  {error_count} users failed to be assigned")

if __name__ == "__main__":
    main()
