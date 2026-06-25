-- Add missing branch_id column to tasks table
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES public.branches(id);
