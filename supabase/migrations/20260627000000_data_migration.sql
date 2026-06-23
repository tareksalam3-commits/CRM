-- Phase 7: Data Migration
-- Link all existing data to the default branch (Main Branch)

DO $$
DECLARE
    default_branch_id uuid;
BEGIN
    -- Get the ID of the default branch
    SELECT id INTO default_branch_id FROM branches WHERE name = 'الفرع الرئيسي' LIMIT 1;

    IF default_branch_id IS NOT NULL THEN
        -- Update profiles
        UPDATE profiles SET branch_id = default_branch_id WHERE branch_id IS NULL;

        -- Update clients
        UPDATE clients SET branch_id = default_branch_id WHERE branch_id IS NULL;

        -- Update policies
        UPDATE policies SET branch_id = default_branch_id WHERE branch_id IS NULL;

        -- Update collections
        UPDATE collections SET branch_id = default_branch_id WHERE branch_id IS NULL;

        -- Update targets
        UPDATE targets SET branch_id = default_branch_id WHERE branch_id IS NULL;

        -- Update tasks
        UPDATE tasks SET branch_id = default_branch_id WHERE branch_id IS NULL;

        -- Update notifications
        UPDATE notifications SET branch_id = default_branch_id WHERE branch_id IS NULL;

        -- Update month_closings
        UPDATE month_closings SET branch_id = default_branch_id WHERE branch_id IS NULL;

        -- Give all existing users access to the main branch
        INSERT INTO user_branch_access (user_id, branch_id)
        SELECT id, default_branch_id FROM profiles
        ON CONFLICT (user_id, branch_id) DO NOTHING;
    END IF;
END $$;
