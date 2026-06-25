/*
================================================================================
LIFE INSURANCE SALES CRM - SEED DATA: DEFAULT TARGETS
================================================================================
Generated: 2026-06-25
Description: Default monthly targets for Development Manager and General Supervisors
- Development Manager: 750,000 SAR/month
- General Supervisor: 240,000 SAR/month
================================================================================
*/

-- Set default targets for current month
INSERT INTO targets (user_id, branch_id, year, month, target_type, target_amount)
VALUES (
  '22222222-2222-2222-2222-222222222002',
  '11111111-1111-1111-1111-111111111001',
  EXTRACT(YEAR FROM now())::INTEGER,
  EXTRACT(MONTH FROM now())::INTEGER,
  'premium',
  750000
) ON CONFLICT (user_id, year, month, target_type) DO NOTHING;

INSERT INTO targets (user_id, branch_id, year, month, target_type, target_amount)
VALUES (
  '22222222-2222-2222-2222-222222222003',
  '11111111-1111-1111-1111-111111111001',
  EXTRACT(YEAR FROM now())::INTEGER,
  EXTRACT(MONTH FROM now())::INTEGER,
  'premium',
  240000
) ON CONFLICT (user_id, year, month, target_type) DO NOTHING;

INSERT INTO targets (user_id, branch_id, year, month, target_type, target_amount)
VALUES (
  '22222222-2222-2222-2222-222222222004',
  '11111111-1111-1111-1111-111111111002',
  EXTRACT(YEAR FROM now())::INTEGER,
  EXTRACT(MONTH FROM now())::INTEGER,
  'premium',
  240000
) ON CONFLICT (user_id, year, month, target_type) DO NOTHING;
