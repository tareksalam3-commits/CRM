-- ================================================================
-- PHASE 1: Enhance Audit Logs Table
-- ================================================================

-- Add additional columns to audit_logs for better tracking
ALTER TABLE IF EXISTS public.audit_logs
ADD COLUMN IF NOT EXISTS details text,
ADD COLUMN IF NOT EXISTS ip_address text,
ADD COLUMN IF NOT EXISTS status text DEFAULT 'success';

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_audit_action ON public.audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON public.audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON public.audit_logs(created_at DESC);

-- ================================================================
-- PHASE 2: Create Audit Logging Functions
-- ================================================================

-- Function to log client operations
CREATE OR REPLACE FUNCTION public.log_client_operation(
  p_user_id uuid,
  p_action text,
  p_client_id uuid,
  p_old_data jsonb DEFAULT NULL,
  p_new_data jsonb DEFAULT NULL,
  p_details text DEFAULT NULL
) RETURNS void AS $$
BEGIN
  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, old_data, new_data, details)
  VALUES (p_user_id, p_action, 'client', p_client_id, p_old_data, p_new_data, p_details);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to log policy operations
CREATE OR REPLACE FUNCTION public.log_policy_operation(
  p_user_id uuid,
  p_action text,
  p_policy_id uuid,
  p_old_data jsonb DEFAULT NULL,
  p_new_data jsonb DEFAULT NULL,
  p_details text DEFAULT NULL
) RETURNS void AS $$
BEGIN
  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, old_data, new_data, details)
  VALUES (p_user_id, p_action, 'policy', p_policy_id, p_old_data, p_new_data, p_details);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to log collection operations
CREATE OR REPLACE FUNCTION public.log_collection_operation(
  p_user_id uuid,
  p_action text,
  p_collection_id uuid,
  p_old_data jsonb DEFAULT NULL,
  p_new_data jsonb DEFAULT NULL,
  p_details text DEFAULT NULL
) RETURNS void AS $$
BEGIN
  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, old_data, new_data, details)
  VALUES (p_user_id, p_action, 'collection', p_collection_id, p_old_data, p_new_data, p_details);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to log user operations
CREATE OR REPLACE FUNCTION public.log_user_operation(
  p_user_id uuid,
  p_action text,
  p_target_user_id uuid,
  p_old_data jsonb DEFAULT NULL,
  p_new_data jsonb DEFAULT NULL,
  p_details text DEFAULT NULL
) RETURNS void AS $$
BEGIN
  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, old_data, new_data, details)
  VALUES (p_user_id, p_action, 'user', p_target_user_id, p_old_data, p_new_data, p_details);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ================================================================
-- PHASE 3: Create Audit Triggers
-- ================================================================

-- Trigger for client operations
CREATE OR REPLACE FUNCTION public.audit_clients_trigger()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, new_data)
    VALUES (auth.uid(), 'CREATE_CLIENT', 'client', NEW.id, to_jsonb(NEW));
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, old_data, new_data)
    VALUES (auth.uid(), 'UPDATE_CLIENT', 'client', NEW.id, to_jsonb(OLD), to_jsonb(NEW));
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, old_data)
    VALUES (auth.uid(), 'DELETE_CLIENT', 'client', OLD.id, to_jsonb(OLD));
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS audit_clients_trigger ON public.clients;
CREATE TRIGGER audit_clients_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.clients
FOR EACH ROW EXECUTE FUNCTION public.audit_clients_trigger();

-- Trigger for policy operations
CREATE OR REPLACE FUNCTION public.audit_policies_trigger()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, new_data)
    VALUES (auth.uid(), 'CREATE_POLICY', 'policy', NEW.id, to_jsonb(NEW));
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, old_data, new_data)
    VALUES (auth.uid(), 'UPDATE_POLICY', 'policy', NEW.id, to_jsonb(OLD), to_jsonb(NEW));
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, old_data)
    VALUES (auth.uid(), 'DELETE_POLICY', 'policy', OLD.id, to_jsonb(OLD));
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS audit_policies_trigger ON public.policies;
CREATE TRIGGER audit_policies_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.policies
FOR EACH ROW EXECUTE FUNCTION public.audit_policies_trigger();

-- Trigger for collection operations
CREATE OR REPLACE FUNCTION public.audit_collections_trigger()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, new_data)
    VALUES (auth.uid(), 'CREATE_COLLECTION', 'collection', NEW.id, to_jsonb(NEW));
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, old_data, new_data)
    VALUES (auth.uid(), 'UPDATE_COLLECTION', 'collection', NEW.id, to_jsonb(OLD), to_jsonb(NEW));
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, old_data)
    VALUES (auth.uid(), 'DELETE_COLLECTION', 'collection', OLD.id, to_jsonb(OLD));
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS audit_collections_trigger ON public.collections;
CREATE TRIGGER audit_collections_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.collections
FOR EACH ROW EXECUTE FUNCTION public.audit_collections_trigger();

-- ================================================================
-- PHASE 4: Grant Permissions
-- ================================================================

GRANT EXECUTE ON FUNCTION public.log_client_operation TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_policy_operation TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_collection_operation TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_user_operation TO authenticated;

GRANT SELECT ON public.audit_logs TO authenticated;
