/*
================================================================================
LIFE INSURANCE SALES CRM - SEED DATA: SYSTEM SETTINGS
================================================================================
Generated: 2026-06-25
Description: Default system configuration settings
================================================================================
*/

-- Insert default system settings
INSERT INTO system_settings (key, value, description) VALUES
  ('company_name', 'شركة التأمين على الحياة', 'Company name'),
  ('currency', 'SAR', 'Default currency'),
  ('default_target_dm', '750000', 'Default monthly target for Development Manager'),
  ('default_target_gs', '240000', 'Default monthly target for General Supervisor'),
  ('first_year_only', 'true', 'Track first year only for policies'),
  ('notifications_enabled', 'true', 'Enable system notifications')
ON CONFLICT (key) DO NOTHING;
