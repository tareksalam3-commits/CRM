/*
 * Fix "permission denied" errors and unify RLS logic across all tables (v2).
 * 
 * 1. Grants: Ensure 'authenticated' role has basic SQL privileges (SELECT, INSERT, UPDATE, DELETE).
 * 2. RLS: Update all tables to use the robust v2 SECURITY DEFINER helper functions.
 */

-- 1. Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.policies TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clients TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.targets TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.collections TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tasks TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.installments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.insurance_groups TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.month_closings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.branches TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.system_settings TO authenticated;

-- 2. Update policies to v2 logic

-- policies
DROP POLICY IF EXISTS "policies_select" ON public.policies;
DROP POLICY IF EXISTS "policies_insert" ON public.policies;
DROP POLICY IF EXISTS "policies_update" ON public.policies;
DROP POLICY IF EXISTS "policies_delete" ON public.policies;
DROP POLICY IF EXISTS "policies_select_v2" ON public.policies;
DROP POLICY IF EXISTS "policies_insert_v2" ON public.policies;
DROP POLICY IF EXISTS "policies_update_v2" ON public.policies;
DROP POLICY IF EXISTS "policies_delete_v2" ON public.policies;

CREATE POLICY "policies_select_v2" ON public.policies FOR SELECT TO authenticated USING (agent_id = auth.uid() OR public.is_admin_v2(auth.uid()) OR public.is_subordinate_v2(auth.uid(), agent_id));
CREATE POLICY "policies_insert_v2" ON public.policies FOR INSERT TO authenticated WITH CHECK (agent_id = auth.uid() OR public.is_admin_v2(auth.uid()) OR public.is_subordinate_v2(auth.uid(), agent_id));
CREATE POLICY "policies_update_v2" ON public.policies FOR UPDATE TO authenticated USING (agent_id = auth.uid() OR public.is_admin_v2(auth.uid()) OR public.is_subordinate_v2(auth.uid(), agent_id)) WITH CHECK (agent_id = auth.uid() OR public.is_admin_v2(auth.uid()) OR public.is_subordinate_v2(auth.uid(), agent_id));
CREATE POLICY "policies_delete_v2" ON public.policies FOR DELETE TO authenticated USING (public.is_admin_v2(auth.uid()));

-- clients
DROP POLICY IF EXISTS "clients_select" ON public.clients;
DROP POLICY IF EXISTS "clients_insert" ON public.clients;
DROP POLICY IF EXISTS "clients_update" ON public.clients;
DROP POLICY IF EXISTS "clients_delete" ON public.clients;
DROP POLICY IF EXISTS "clients_select_v2" ON public.clients;
DROP POLICY IF EXISTS "clients_insert_v2" ON public.clients;
DROP POLICY IF EXISTS "clients_update_v2" ON public.clients;
DROP POLICY IF EXISTS "clients_delete_v2" ON public.clients;

CREATE POLICY "clients_select_v2" ON public.clients FOR SELECT TO authenticated USING (agent_id = auth.uid() OR public.is_admin_v2(auth.uid()) OR public.is_subordinate_v2(auth.uid(), agent_id));
CREATE POLICY "clients_insert_v2" ON public.clients FOR INSERT TO authenticated WITH CHECK (agent_id = auth.uid() OR public.is_admin_v2(auth.uid()) OR public.is_subordinate_v2(auth.uid(), agent_id));
CREATE POLICY "clients_update_v2" ON public.clients FOR UPDATE TO authenticated USING (agent_id = auth.uid() OR public.is_admin_v2(auth.uid()) OR public.is_subordinate_v2(auth.uid(), agent_id)) WITH CHECK (agent_id = auth.uid() OR public.is_admin_v2(auth.uid()) OR public.is_subordinate_v2(auth.uid(), agent_id));
CREATE POLICY "clients_delete_v2" ON public.clients FOR DELETE TO authenticated USING (public.is_admin_v2(auth.uid()));

-- targets
DROP POLICY IF EXISTS "targets_select" ON public.targets;
DROP POLICY IF EXISTS "targets_insert" ON public.targets;
DROP POLICY IF EXISTS "targets_update" ON public.targets;
DROP POLICY IF EXISTS "targets_delete" ON public.targets;
DROP POLICY IF EXISTS "targets_select_v2" ON public.targets;
DROP POLICY IF EXISTS "targets_insert_v2" ON public.targets;
DROP POLICY IF EXISTS "targets_update_v2" ON public.targets;
DROP POLICY IF EXISTS "targets_delete_v2" ON public.targets;

CREATE POLICY "targets_select_v2" ON public.targets FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_admin_v2(auth.uid()) OR public.is_subordinate_v2(auth.uid(), user_id));
CREATE POLICY "targets_insert_v2" ON public.targets FOR INSERT TO authenticated WITH CHECK (public.is_admin_v2(auth.uid()));
CREATE POLICY "targets_update_v2" ON public.targets FOR UPDATE TO authenticated USING (public.is_admin_v2(auth.uid())) WITH CHECK (public.is_admin_v2(auth.uid()));
CREATE POLICY "targets_delete_v2" ON public.targets FOR DELETE TO authenticated USING (public.is_admin_v2(auth.uid()));

-- collections
DROP POLICY IF EXISTS "collections_select" ON public.collections;
DROP POLICY IF EXISTS "collections_insert" ON public.collections;
DROP POLICY IF EXISTS "collections_update" ON public.collections;
DROP POLICY IF EXISTS "collections_delete" ON public.collections;
DROP POLICY IF EXISTS "collections_select_v2" ON public.collections;
DROP POLICY IF EXISTS "collections_insert_v2" ON public.collections;
DROP POLICY IF EXISTS "collections_update_v2" ON public.collections;
DROP POLICY IF EXISTS "collections_delete_v2" ON public.collections;

CREATE POLICY "collections_select_v2" ON public.collections FOR SELECT TO authenticated USING (collected_by = auth.uid() OR public.is_admin_v2(auth.uid()) OR public.is_subordinate_v2(auth.uid(), collected_by));
CREATE POLICY "collections_insert_v2" ON public.collections FOR INSERT TO authenticated WITH CHECK (collected_by = auth.uid() OR public.is_admin_v2(auth.uid()) OR public.is_subordinate_v2(auth.uid(), collected_by));
CREATE POLICY "collections_update_v2" ON public.collections FOR UPDATE TO authenticated USING (collected_by = auth.uid() OR public.is_admin_v2(auth.uid()) OR public.is_subordinate_v2(auth.uid(), collected_by)) WITH CHECK (collected_by = auth.uid() OR public.is_admin_v2(auth.uid()) OR public.is_subordinate_v2(auth.uid(), collected_by));
CREATE POLICY "collections_delete_v2" ON public.collections FOR DELETE TO authenticated USING (public.is_admin_v2(auth.uid()));
