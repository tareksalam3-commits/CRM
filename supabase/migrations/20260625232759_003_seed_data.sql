/*
# Life Insurance CRM - Seed Data

1. Seed Data
- Insert policy types (Life Insurance, Endowment, etc.)
- Insert default settings

2. Notes
- No user accounts created here - they will be created via auth API
*/

-- Insert policy types
INSERT INTO policy_types (name, description) VALUES
('تأمين الحياة', 'وثيقة تأمين الحياة الأساسية'),
('تأمين الحياة والادخار', 'وثيقة تأمين الحياة مع مكون الادخار'),
('تأمين الحياة المؤقت', 'وثيقة تأمين الحياة لفترة محددة'),
('تأمين التقاعد', 'وثيقة تأمين للتقاعد والمعاش'),
('تأمين التعليم', 'وثيقة تأمين لتعليم الأبناء')
ON CONFLICT DO NOTHING;

-- Insert default settings
INSERT INTO settings (key, value) VALUES
('company_name', 'شركة التأمين'),
('currency', 'EGP'),
('fiscal_year_start', '1'),
('default_payment_method', 'annual')
ON CONFLICT DO NOTHING;
