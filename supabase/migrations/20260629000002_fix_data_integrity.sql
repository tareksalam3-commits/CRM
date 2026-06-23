-- Phase 3: Fix Data Integrity and Ensure Proper Relationships

-- Ensure all users have at least one active branch access
-- This query identifies users without any active branch access
-- SELECT id, email FROM profiles WHERE id NOT IN (SELECT DISTINCT user_id FROM user_branch_access WHERE is_active = true);

-- Add default branch access for users without any
-- First, get the default/first branch
DO $$
DECLARE
  default_branch_id uuid;
  user_record RECORD;
BEGIN
  -- Get the first active branch (or create one if needed)
  SELECT id INTO default_branch_id FROM branches WHERE is_active = true ORDER BY created_at ASC LIMIT 1;
  
  IF default_branch_id IS NULL THEN
    RAISE NOTICE 'No active branches found. Please create at least one branch first.';
    RETURN;
  END IF;
  
  -- Add branch access for users without any active access
  FOR user_record IN 
    SELECT id FROM profiles 
    WHERE id NOT IN (SELECT DISTINCT user_id FROM user_branch_access WHERE is_active = true)
  LOOP
    INSERT INTO user_branch_access (user_id, branch_id, role, is_active, assigned_at)
    VALUES (user_record.id, default_branch_id, 'agent', true, now())
    ON CONFLICT DO NOTHING;
  END LOOP;
  
  RAISE NOTICE 'Added default branch access for users without active access.';
END $$;

-- Ensure all active users have valid roles
UPDATE user_branch_access 
SET role = 'agent' 
WHERE role IS NULL OR role = '' AND is_active = true;

-- Ensure branch references are valid
DELETE FROM user_branch_access 
WHERE branch_id NOT IN (SELECT id FROM branches) AND is_active = true;

-- Verify RLS is enabled on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_branch_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE installments ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_user_branch_access_user_id ON user_branch_access(user_id);
CREATE INDEX IF NOT EXISTS idx_user_branch_access_branch_id ON user_branch_access(branch_id);
CREATE INDEX IF NOT EXISTS idx_user_branch_access_is_active ON user_branch_access(is_active);
CREATE INDEX IF NOT EXISTS idx_user_branch_access_user_branch ON user_branch_access(user_id, branch_id);
CREATE INDEX IF NOT EXISTS idx_user_branch_access_user_active ON user_branch_access(user_id, is_active);
