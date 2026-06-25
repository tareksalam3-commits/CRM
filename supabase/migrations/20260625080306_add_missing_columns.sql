-- Add missing columns to month_closings table
ALTER TABLE public.month_closings ADD COLUMN IF NOT EXISTS closed_at timestamptz;
ALTER TABLE public.month_closings ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES public.branches(id);
ALTER TABLE public.month_closings ADD COLUMN IF NOT EXISTS total_premiums numeric DEFAULT 0;
ALTER TABLE public.month_closings ADD COLUMN IF NOT EXISTS total_collections numeric DEFAULT 0;
ALTER TABLE public.month_closings ADD COLUMN IF NOT EXISTS collection_rate numeric DEFAULT 0;

-- Add missing columns to notifications table
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES public.branches(id);
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS related_entity_type text;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS related_entity_id uuid;

-- Rename entity_type to related_entity_type if it exists and the new column doesn't
-- (We already added related_entity_type above, so we just need to handle the data migration)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'notifications' AND column_name = 'entity_type')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'notifications' AND column_name = 'related_entity_type')
  THEN
    UPDATE public.notifications SET related_entity_type = entity_type WHERE related_entity_type IS NULL AND entity_type IS NOT NULL;
    UPDATE public.notifications SET related_entity_id = entity_id::uuid WHERE related_entity_id IS NULL AND entity_id IS NOT NULL;
  END IF;
END $$;
