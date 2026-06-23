-- Update installments table to cascade delete when policy is deleted
ALTER TABLE installments
DROP CONSTRAINT IF EXISTS installments_policy_id_fkey,
ADD CONSTRAINT installments_policy_id_fkey
    FOREIGN KEY (policy_id)
    REFERENCES policies(id)
    ON DELETE CASCADE;

-- Update collections table to cascade delete when policy is deleted
ALTER TABLE collections
DROP CONSTRAINT IF EXISTS collections_policy_id_fkey,
ADD CONSTRAINT collections_policy_id_fkey
    FOREIGN KEY (policy_id)
    REFERENCES policies(id)
    ON DELETE CASCADE;

-- Also update collections to cascade delete when installment is deleted (secondary safety)
ALTER TABLE collections
DROP CONSTRAINT IF EXISTS collections_installment_id_fkey,
ADD CONSTRAINT collections_installment_id_fkey
    FOREIGN KEY (installment_id)
    REFERENCES installments(id)
    ON DELETE CASCADE;
