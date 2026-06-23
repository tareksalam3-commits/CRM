-- Test Data for Branch System
-- 1. Create Test Branches
INSERT INTO public.branches (name, code, is_active)
VALUES 
('فرع طنطا 1', 'TANTA1', true),
('فرع طنطا 2', 'TANTA2', true),
('فرع المنصورة', 'MANS', true)
ON CONFLICT (name) DO NOTHING;

-- 2. Get Branch IDs
DO $$
DECLARE
    tanta1_id uuid;
    tanta2_id uuid;
    mansoura_id uuid;
    user_a_id uuid;
    user_b_id uuid;
    user_c_id uuid;
BEGIN
    SELECT id INTO tanta1_id FROM public.branches WHERE name = 'فرع طنطا 1';
    SELECT id INTO tanta2_id FROM public.branches WHERE name = 'فرع طنطا 2';
    SELECT id INTO mansoura_id FROM public.branches WHERE name = 'فرع المنصورة';

    -- Note: We assume users A, B, C exist or we'll use existing profiles for testing
    -- For this test, we'll just use the IDs if they exist or skip
    
    -- Let's find some active profiles to use as Test A, B, C
    -- Or we can just print the IDs to be manually linked in UI
    
    RAISE NOTICE 'Branch Tanta 1: %', tanta1_id;
    RAISE NOTICE 'Branch Tanta 2: %', tanta2_id;
    RAISE NOTICE 'Branch Mansoura: %', mansoura_id;
END $$;
