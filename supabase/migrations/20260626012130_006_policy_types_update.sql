/*
# Update Policy Types System

1. Changes
- Add `is_active` column to `policy_types` table for soft-delete/disable
- Delete old default policy types
- Insert company-specific policy types:
  - الرباعية
  - حماية واستثمار
  - مختلط
  - ذو أقساط
  - معاش واطمئنان

2. Security
- Keep existing RLS policies (admin-only write, public read)
*/

-- Add is_active column if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'policy_types' AND column_name = 'is_active'
  ) THEN
    ALTER TABLE policy_types ADD COLUMN is_active boolean NOT NULL DEFAULT true;
  END IF;
END $$;

-- Delete old default types
DELETE FROM policy_types WHERE name IN (
  'تأمين الحياة',
  'تأمين الحياة والادخار',
  'تأمين الحياة المؤقت',
  'تأمين التقاعد',
  'تأمين التعليم'
);

-- Insert company-specific types
INSERT INTO policy_types (name, description, is_active) VALUES
('الرباعية', 'وثيقة الرباعية للتأمين', true),
('حماية واستثمار', 'وثيقة الحماية والاستثمار', true),
('مختلط', 'وثيقة مختلط', true),
('ذو أقساط', 'وثيقة ذو أقساط', true),
('معاش واطمئنان', 'وثيقة معاش واطمئنان', true)
ON CONFLICT DO NOTHING;
