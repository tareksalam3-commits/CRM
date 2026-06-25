/*
================================================================================
LIFE INSURANCE SALES CRM - SEED DATA: BRANCHES
================================================================================
Generated: 2026-06-25
Description: Default branches for the insurance CRM system
================================================================================
*/

-- Insert default branches
INSERT INTO branches (id, name, code, region, address, phone, email, manager_id, is_active) VALUES
  ('11111111-1111-1111-1111-111111111001', 'المركز الرئيسي', 'HQ001', 'الرياض', 'شارع الملك فهد، الرياض', '0112345678', 'main@insurance.com', NULL, true),
  ('11111111-1111-1111-1111-111111111002', 'فرع الرياض', 'RYD001', 'الرياض', 'شارع العليا، الرياض', '0112345679', 'riyadh@insurance.com', NULL, true),
  ('11111111-1111-1111-1111-111111111003', 'فرع جدة', 'JED001', 'جدة', 'شارع التحلية، جدة', '0129876543', 'jeddah@insurance.com', NULL, true)
ON CONFLICT (id) DO NOTHING;
