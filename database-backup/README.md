# Life Insurance Sales CRM - Database Backup

## Overview
This folder contains a complete backup of the Life Insurance Sales CRM database.

## Folder Structure

```
database-backup/
├── README.md                          # This file
├── migrations/                        # Database migrations (schema)
│   ├── 20260625185148_001_initial_schema.sql
│   ├── 20260625185245_003_fix_audit_trigger.sql
│   ├── 20260625185411_004_default_users_and_branches.sql
│   └── 20260625191657_005_auto_collections_trigger.sql
├── seed/                              # Seed data files
│   ├── 001_default_branches.sql
│   ├── 002_default_users.sql
│   ├── 003_profiles_and_hierarchy.sql
│   ├── 004_default_targets.sql
│   └── 005_system_settings.sql
├── functions/                          # Database functions
│   └── (included in migrations)
├── triggers/                           # Database triggers
│   └── (included in migrations)
└── rls/                                # Row Level Security policies
    └── (included in migrations)
```

## Restore Instructions

### Option 1: Full Restore (New Database)

1. Create a new Supabase project
2. Run migrations in order:
   ```
   001_initial_schema.sql
   003_fix_audit_trigger.sql
   004_default_users_and_branches.sql
   005_auto_collections_trigger.sql
   ```
3. Run seed files in order:
   ```
   001_default_branches.sql
   002_default_users.sql
   003_profiles_and_hierarchy.sql
   004_default_targets.sql
   005_system_settings.sql
   ```

### Option 2: Using Supabase CLI

```bash
supabase db reset
supabase db push
```

## Default Users

All users have password: **123456**

| Role | Name | Email |
|------|------|-------|
| Super Admin | أحمد محمد | ahmed.mohamed@insurance.com |
| Development Manager | عبدالله سعد | abdullah.saad@insurance.com |
| General Supervisor | فهد عبدالعزيز | fahad.abdulaziz@insurance.com |
| General Supervisor | سلطان خالد | sultan.khalid@insurance.com |
| Supervisor | ماجد فهد | majed.fahad@insurance.com |
| Supervisor | ناصر محمد | nasser.mohamed@insurance.com |
| Group Leader | عمر سعود | omar.saud@insurance.com |
| Agent | خالد أحمد | khaled.ahmed@insurance.com |
| Agent | فيصل سلمان | faisal.salman@insurance.com |
| Agent | راشد محمد | rashed.mohamed@insurance.com |

## Database Tables

| Table | Description | RLS |
|-------|-------------|-----|
| branches | Branch offices | Yes |
| profiles | User profiles | Yes |
| organizational_hierarchy | Reporting structure | Yes |
| clients | Insurance clients | Yes |
| policies | Insurance policies | Yes |
| collections | Premium payments | Yes |
| targets | Monthly targets | Yes |
| notifications | User notifications | Yes |
| tasks | User tasks | Yes |
| audit_log | Audit trail | Yes |
| month_closing | Period closing | Yes |
| system_settings | Configuration | Yes |

## Important Notes

1. **RLS Policies**: All tables have Row Level Security enabled. Make sure to test access after restore.

2. **Triggers**: Automatic collection generation and target updates are handled by triggers.

3. **Functions**: Hierarchical access functions (`get_user_descendants`, `get_user_ancestors`) are critical for RLS.

4. **UUIDs**: All IDs use UUID. The seed data uses predictable UUIDs for easy reference.

## Backup Date
Generated: 2026-06-25
