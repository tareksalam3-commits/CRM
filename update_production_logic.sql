-- 1. إضافة عمود التصنيف لجدول التحصيلات
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'collections' AND COLUMN_NAME = 'collection_category') THEN
        ALTER TABLE public.collections ADD COLUMN collection_category text CHECK (collection_category IN ('new', 'first_year', 'renewal'));
    END IF;
END $$;

-- 2. تحديث دالة التصنيف التلقائي للتحصيلات
CREATE OR REPLACE FUNCTION public.mark_collection_category()
RETURNS TRIGGER AS $$
DECLARE
    v_installment_number int;
    v_has_counted boolean;
    v_issue_date date;
    v_first_year_end date;
BEGIN
    -- جلب بيانات القسط والوثيقة
    SELECT i.installment_number, p.has_new_business_counted, p.issue_date, p.first_year_end 
    INTO v_installment_number, v_has_counted, v_issue_date, v_first_year_end
    FROM public.installments i
    JOIN public.policies p ON i.policy_id = p.id
    WHERE i.id = NEW.installment_id;

    -- القاعدة 1: أول قسط مسدد فقط يعتبر (جديد)
    IF v_installment_number = 1 AND NOT COALESCE(v_has_counted, false) THEN
        NEW.collection_category := 'new';
        NEW.is_new_business := true;
        -- تحديث الوثيقة بأنها احتسبت جديد
        UPDATE public.policies SET has_new_business_counted = true WHERE id = NEW.policy_id;
    
    -- القاعدة 2: أي قسط بعد الأول خلال أول سنة يعتبر (تحصيل أول سنة)
    ELSIF NEW.collection_date <= v_first_year_end THEN
        NEW.collection_category := 'first_year';
        NEW.is_new_business := false;
        
    -- القاعدة 3: أي قسط بعد مرور سنة كاملة يعتبر (تحصيل سنوات تالية / تجديد)
    ELSE
        NEW.collection_category := 'renewal';
        NEW.is_new_business := false;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. إعادة إنشاء التريجر للتحصيلات
DROP TRIGGER IF EXISTS trg_mark_new_business ON public.collections;
CREATE TRIGGER trg_mark_collection_category
BEFORE INSERT ON public.collections
FOR EACH ROW
EXECUTE FUNCTION public.mark_collection_category();

-- 4. إضافة دالة وتريجر لمعالجة حذف التحصيلات (إعادة احتساب المؤشرات)
CREATE OR REPLACE FUNCTION public.handle_collection_deletion()
RETURNS TRIGGER AS $$
BEGIN
    -- إذا تم حذف تحصيل كان مصنفاً كـ (جديد)، نعيد السماح باحتساب جديد للوثيقة
    IF OLD.collection_category = 'new' THEN
        UPDATE public.policies SET has_new_business_counted = false WHERE id = OLD.policy_id;
    END IF;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_handle_collection_deletion ON public.collections;
CREATE TRIGGER trg_handle_collection_deletion
AFTER DELETE ON public.collections
FOR EACH ROW
EXECUTE FUNCTION public.handle_collection_deletion();

-- 5. تحديث البيانات الحالية بناءً على القواعد الجديدة
UPDATE public.collections c
SET collection_category = 
    CASE 
        WHEN c.is_new_business = true THEN 'new'
        WHEN c.collection_date <= p.first_year_end THEN 'first_year'
        ELSE 'renewal'
    END
FROM public.policies p
WHERE c.policy_id = p.id;

-- 6. تحديث الـ View الموحد ليشمل التصنيفات الجديدة
DROP VIEW IF EXISTS public.unified_performance_metrics CASCADE;
CREATE VIEW public.unified_performance_metrics AS
SELECT 
    c.id as collection_id,
    c.amount,
    c.collection_date,
    c.collection_category,
    c.is_new_business,
    (c.collection_category = 'first_year') as is_first_year_collection,
    (c.collection_category = 'renewal') as is_renewal_collection,
    c.branch_id,
    p.id as policy_id,
    p.agent_id,
    p.team_leader_id,
    p.supervisor_id,
    p.branch_manager_id,
    p.first_year_start,
    p.first_year_end,
    EXTRACT(YEAR FROM c.collection_date)::int as collection_year,
    EXTRACT(MONTH FROM c.collection_date)::int as collection_month
FROM public.collections c
JOIN public.policies p ON c.policy_id = p.id;

-- 7. تحديث دالة حساب أداء المندوب
CREATE OR REPLACE FUNCTION calculate_agent_performance(
  p_agent_id uuid,
  p_month int,
  p_year int
)
RETURNS TABLE (
  new_business numeric,
  first_year_collections numeric,
  renewal_collections numeric,
  total_collections numeric,
  new_clients int,
  paid_installments int,
  target_amount numeric,
  achievement_rate numeric
) AS $$
DECLARE
    v_target numeric;
BEGIN
    -- جلب الهدف
    SELECT COALESCE(t.target_amount, 0) INTO v_target
    FROM public.targets t
    WHERE t.user_id = p_agent_id 
    AND t.period_number = p_month 
    AND t.year = p_year 
    AND t.period_type = 'monthly'
    LIMIT 1;

    RETURN QUERY
    SELECT
        COALESCE(SUM(CASE WHEN collection_category = 'new' THEN amount ELSE 0 END), 0)::numeric as new_business,
        COALESCE(SUM(CASE WHEN collection_category = 'first_year' THEN amount ELSE 0 END), 0)::numeric as first_year_collections,
        COALESCE(SUM(CASE WHEN collection_category = 'renewal' THEN amount ELSE 0 END), 0)::numeric as renewal_collections,
        COALESCE(SUM(amount), 0)::numeric as total_collections,
        COALESCE(COUNT(DISTINCT CASE WHEN collection_category = 'new' THEN policy_id END), 0)::int as new_clients,
        COALESCE(COUNT(collection_id), 0)::int as paid_installments,
        v_target as target_amount,
        CASE WHEN v_target > 0 THEN 
            ROUND((COALESCE(SUM(CASE WHEN collection_category = 'new' THEN amount ELSE 0 END), 0) / v_target) * 100, 2)
        ELSE 0 END::numeric as achievement_rate
    FROM public.unified_performance_metrics
    WHERE agent_id = p_agent_id
    AND collection_month = p_month
    AND collection_year = p_year;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;
