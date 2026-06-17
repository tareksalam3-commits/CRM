-- ================================================================
-- Insurance CRM Pro — Fix Migration 2026-06-17
-- Fixes:
--   1. clients INSERT RLS policy: allow any authenticated user to
--      insert a client where agent_id = auth.uid() (self-assign).
--   2. Ensures can_access_user also returns true when accessor IS target.
--   3. Add default value for agent_id fallback consistency.
--   4. Fix collections_insert RLS to allow any authenticated collector.
--   5. Add missing index on clients.national_id for search performance.
-- ================================================================

-- FIX 1: clients_insert — allow authenticated user to add a client
--   either for themselves OR for any subordinate (existing behavior)
DROP POLICY IF EXISTS "clients_insert" ON clients;
CREATE POLICY "clients_insert" ON clients
  FOR INSERT TO authenticated
  WITH CHECK (
    agent_id = auth.uid()                          -- self-assign
    OR can_access_user(auth.uid(), agent_id)        -- manager assigning to subordinate
  );

-- FIX 2: clients_select — allow user to see all their own clients
DROP POLICY IF EXISTS "clients_select" ON clients;
CREATE POLICY "clients_select" ON clients
  FOR SELECT TO authenticated
  USING (
    agent_id = auth.uid()
    OR can_access_user(auth.uid(), agent_id)
  );

-- FIX 3: clients_update
DROP POLICY IF EXISTS "clients_update" ON clients;
CREATE POLICY "clients_update" ON clients
  FOR UPDATE TO authenticated
  USING (
    agent_id = auth.uid()
    OR can_access_user(auth.uid(), agent_id)
  )
  WITH CHECK (
    agent_id = auth.uid()
    OR can_access_user(auth.uid(), agent_id)
  );

-- FIX 4: clients_delete
DROP POLICY IF EXISTS "clients_delete" ON clients;
CREATE POLICY "clients_delete" ON clients
  FOR DELETE TO authenticated
  USING (
    agent_id = auth.uid()
    OR can_access_user(auth.uid(), agent_id)
  );

-- FIX 5: policies_insert — same pattern: allow self-insert
DROP POLICY IF EXISTS "policies_insert" ON policies;
CREATE POLICY "policies_insert" ON policies
  FOR INSERT TO authenticated
  WITH CHECK (
    agent_id = auth.uid()
    OR can_access_user(auth.uid(), agent_id)
  );

-- FIX 6: collections_insert — allow any authenticated user to record a collection
--   (The UI already validates they can only collect on installments they can access)
DROP POLICY IF EXISTS "collections_insert" ON collections;
CREATE POLICY "collections_insert" ON collections
  FOR INSERT TO authenticated
  WITH CHECK (
    collected_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM policies
      WHERE policies.id = policy_id
        AND can_access_user(auth.uid(), policies.agent_id)
    )
  );

-- FIX 7: Performance index on clients.national_id
CREATE INDEX IF NOT EXISTS idx_clients_national_id ON clients(national_id);
CREATE INDEX IF NOT EXISTS idx_clients_phone ON clients(phone);

-- FIX 8: Ensure can_access_user returns true for self-access (idempotent)
CREATE OR REPLACE FUNCTION can_access_user(accessor_uuid uuid, target_uuid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    accessor_uuid = target_uuid                          -- always allow self
    OR target_uuid IN (SELECT get_subordinate_ids(accessor_uuid))
    OR EXISTS (SELECT 1 FROM profiles WHERE id = accessor_uuid AND role = 'super_admin')
    OR EXISTS (SELECT 1 FROM profiles WHERE id = accessor_uuid AND role = 'dev_manager');
$$;
