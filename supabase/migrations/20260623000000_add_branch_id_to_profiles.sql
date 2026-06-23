-- Add branch_id to profiles table if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'branch_id') THEN
        ALTER TABLE profiles ADD COLUMN branch_id uuid;
    END IF;
END $$;

-- Update RLS policies to ensure they still work or add comments
COMMENT ON COLUMN profiles.branch_id IS 'Reference to the branch this profile belongs to';
