-- تعديل دالة توليد الأقساط لتقتصر على السنة الأولى فقط
CREATE OR REPLACE FUNCTION generate_installments()
RETURNS TRIGGER AS $$
DECLARE
  i integer;
  total_installments integer;
  installment_amount numeric(12,2);
  due_date date;
  interval_months integer;
BEGIN
  -- تحديد عدد الأقساط في السنة الأولى بناءً على طريقة السداد
  CASE NEW.payment_method
    WHEN 'annual' THEN
      total_installments := 1;
      interval_months := 12;
    WHEN 'semi_annual' THEN
      total_installments := 2;
      interval_months := 6;
    WHEN 'quarterly' THEN
      total_installments := 4;
      interval_months := 3;
    WHEN 'monthly' THEN
      total_installments := 12;
      interval_months := 1;
  END CASE;

  installment_amount := NEW.periodic_premium;

  -- حذف أي أقساط قديمة في حال التحديث (إذا لزم الأمر، لكن التريجر يعمل عند الإدخال فقط حالياً)
  -- لجعل التعديلات تنعكس، سنحتاج لتريجر عند التحديث أيضاً

  FOR i IN 1..total_installments LOOP
    due_date := NEW.start_date + (interval_months * (i - 1) || ' months')::interval;
    INSERT INTO installments (policy_id, installment_number, due_date, amount, insurance_year, status)
    VALUES (NEW.id, i, due_date, installment_amount, 1, 'due')
    ON CONFLICT (policy_id, installment_number) 
    DO UPDATE SET 
      due_date = EXCLUDED.due_date,
      amount = EXCLUDED.amount,
      status = CASE 
        WHEN installments.status = 'collected' THEN 'collected' 
        ELSE 'due' 
      END;
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- إضافة تريجر للتحديث لضمان انعكاس التغييرات فوراً
DROP TRIGGER IF EXISTS trigger_generate_installments_update ON policies;
CREATE TRIGGER trigger_generate_installments_update
AFTER UPDATE OF payment_method, annual_premium, start_date ON policies
FOR EACH ROW
EXECUTE FUNCTION generate_installments();

-- تحديث دالة تحديث حالة الوثيقة لتتوافق مع منطق السنة الأولى
CREATE OR REPLACE FUNCTION update_policy_status()
RETURNS TRIGGER AS $$
DECLARE
  total_installments_year1 integer;
  collected_installments_year1 integer;
BEGIN
  -- حساب الأقساط للسنة الأولى فقط
  SELECT COUNT(*) INTO total_installments_year1
  FROM installments
  WHERE policy_id = NEW.policy_id AND insurance_year = 1;

  SELECT COUNT(*) INTO collected_installments_year1
  FROM installments
  WHERE policy_id = NEW.policy_id AND status = 'collected' AND insurance_year = 1;

  IF total_installments_year1 = collected_installments_year1 THEN
    UPDATE policies SET status = 'paid' WHERE id = NEW.policy_id;
  ELSIF collected_installments_year1 > 0 THEN
    UPDATE policies SET status = 'active' WHERE id = NEW.policy_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
