-- Fix profiles visibility based on hierarchy
DROP POLICY IF EXISTS "Profiles are viewable by users based on hierarchy" ON profiles;

CREATE POLICY "Profiles are viewable by users based on hierarchy" ON profiles
FOR SELECT USING (
  -- Super Admin & Dev Manager can see everyone
  (SELECT role FROM profiles WHERE id = auth.uid()) IN ('super_admin', 'dev_manager')
  OR 
  -- Users can see themselves
  id = auth.uid()
  OR
  -- Team Leader sees their subordinates
  (SELECT role FROM profiles WHERE id = auth.uid()) = 'team_leader' AND manager_id = auth.uid()
  OR
  -- Supervisor sees their team leaders and their agents
  (SELECT role FROM profiles WHERE id = auth.uid()) = 'supervisor' AND (
    manager_id = auth.uid() -- direct team leaders
    OR 
    manager_id IN (SELECT id FROM profiles WHERE manager_id = auth.uid()) -- agents of those team leaders
  )
  OR
  -- General Supervisor sees everyone in their branch
  (SELECT role FROM profiles WHERE id = auth.uid()) = 'general_supervisor' AND active_branch_id = (SELECT active_branch_id FROM profiles WHERE id = auth.uid())
);

-- Ensure Agents cannot see any other profiles except themselves (already covered by logic above, but being explicit)
-- The policy above ensures that if role is 'agent', only 'id = auth.uid()' will be true.
