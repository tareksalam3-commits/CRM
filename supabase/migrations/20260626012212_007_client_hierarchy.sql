/*
# Client Hierarchy Update

1. Changes
- Add `group_leader_id`, `supervisor_id`, `general_supervisor_id`, `dev_manager_id` to clients table
- These columns store the full hierarchy chain for each client based on their agent
- This enables auto-linking when creating policies and cascade updates when transferring clients

2. Security
- No RLS changes needed - existing policies cover these columns
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'clients' AND column_name = 'group_leader_id'
  ) THEN
    ALTER TABLE clients ADD COLUMN group_leader_id uuid REFERENCES users(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'clients' AND column_name = 'supervisor_id'
  ) THEN
    ALTER TABLE clients ADD COLUMN supervisor_id uuid REFERENCES users(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'clients' AND column_name = 'general_supervisor_id'
  ) THEN
    ALTER TABLE clients ADD COLUMN general_supervisor_id uuid REFERENCES users(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'clients' AND column_name = 'dev_manager_id'
  ) THEN
    ALTER TABLE clients ADD COLUMN dev_manager_id uuid REFERENCES users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_clients_group_leader ON clients(group_leader_id);
CREATE INDEX IF NOT EXISTS idx_clients_supervisor ON clients(supervisor_id);
CREATE INDEX IF NOT EXISTS idx_clients_general_supervisor ON clients(general_supervisor_id);
CREATE INDEX IF NOT EXISTS idx_clients_dev_manager ON clients(dev_manager_id);
