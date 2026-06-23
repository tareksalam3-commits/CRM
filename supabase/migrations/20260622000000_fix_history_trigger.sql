-- Fix trigger to handle null auth.uid() (e.g. during migrations or direct SQL)
CREATE OR REPLACE FUNCTION log_target_change()
RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'UPDATE') THEN
    IF (OLD.target_amount <> NEW.target_amount) THEN
      INSERT INTO target_history (target_id, user_id, old_amount, new_amount, changed_by)
      VALUES (NEW.id, NEW.user_id, OLD.target_amount, NEW.target_amount, COALESCE(auth.uid(), NEW.user_id));
    END IF;
  ELSIF (TG_OP = 'INSERT') THEN
    INSERT INTO target_history (target_id, user_id, old_amount, new_amount, changed_by)
    VALUES (NEW.id, NEW.user_id, NULL, NEW.target_amount, COALESCE(auth.uid(), NEW.user_id));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
