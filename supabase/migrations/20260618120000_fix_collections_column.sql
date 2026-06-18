-- ================================================================
-- Insurance CRM Pro — Fix Collections Table & RLS Policies
-- Migration Date: 2026-06-18 (Fix for missing collected_by column)
-- ================================================================

-- Verify collections table has collected_by column
-- If it doesn't exist, add it
ALTER TABLE collections
ADD COLUMN IF NOT EXISTS collected_by uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE RESTRICT;

-- Create index for collected_by
CREATE INDEX IF NOT EXISTS idx_collections_collected_by ON collections(collected_by);

-- Update RLS policy for collections_insert to ensure collected_by is set correctly
DROP POLICY IF EXISTS "collections_insert" ON collections;
DROP POLICY IF EXISTS "collections_insert" ON collections; CREATE POLICY "collections_insert" ON collections FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM policies WHERE policies.id = policy_id AND can_access_user(auth.uid(), policies.agent_id))
    AND collected_by = auth.uid()
  );

-- Ensure the collections table has proper RLS enabled
ALTER TABLE collections ENABLE ROW LEVEL SECURITY;

-- Verify all other RLS policies for collections are in place
DROP POLICY IF EXISTS "collections_select" ON collections;
DROP POLICY IF EXISTS "collections_select" ON collections; CREATE POLICY "collections_select" ON collections FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM policies WHERE policies.id = policy_id AND can_access_user(auth.uid(), policies.agent_id)));

DROP POLICY IF EXISTS "collections_update" ON collections;
DROP POLICY IF EXISTS "collections_update" ON collections; CREATE POLICY "collections_update" ON collections FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM policies WHERE policies.id = policy_id AND can_access_user(auth.uid(), policies.agent_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM policies WHERE policies.id = policy_id AND can_access_user(auth.uid(), policies.agent_id)));

DROP POLICY IF EXISTS "collections_delete" ON collections;
DROP POLICY IF EXISTS "collections_delete" ON collections; CREATE POLICY "collections_delete" ON collections FOR DELETE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM policies WHERE policies.id = policy_id AND can_access_user(auth.uid(), policies.agent_id)));
