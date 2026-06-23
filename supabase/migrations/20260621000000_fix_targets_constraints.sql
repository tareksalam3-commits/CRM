-- Fix missing unique constraint on targets table
ALTER TABLE targets DROP CONSTRAINT IF EXISTS targets_user_id_period_type_year_period_number_key;
ALTER TABLE targets ADD CONSTRAINT targets_user_id_period_type_year_period_number_key UNIQUE (user_id, period_type, year, period_number);
