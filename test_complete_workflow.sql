-- ============================================================================
-- اختبار شامل لدورة العمل الكاملة للتأمين
-- ============================================================================

-- 1. إنشاء بيانات اختبار: فرع وموظفين
INSERT INTO public.branches (name, is_active) VALUES ('فرع الاختبار', true) ON CONFLICT DO NOTHING;
INSERT INTO public.profiles (id, email, full_name, role, is_active, active_branch_id) 
VALUES 
  ('agent-test-001', 'agent@test.com', 'وكيل الاختبار', 'agent', true, (SELECT id FROM branches WHERE name='فرع الاختبار' LIMIT 1)),
  ('tl-test-001', 'tl@test.com', 'رئيس مجموعة الاختبار', 'team_leader', true, (SELECT id FROM branches WHERE name='فرع الاختبار' LIMIT 1))
ON CONFLICT DO NOTHING;

-- 2. إنشاء عميل
INSERT INTO public.clients (name, phone, email, branch_id, agent_id) 
VALUES ('عميل الاختبار', '01012345678', 'client@test.com', (SELECT id FROM branches WHERE name='فرع الاختبار' LIMIT 1), 'agent-test-001')
ON CONFLICT DO NOTHING;

-- 3. اختبار السيناريو الأول: وثيقة شهرية (12 قسط × 1000)
-- ============================================================================
INSERT INTO public.policies (
  policy_number, client_id, agent_id, team_leader_id, branch_id, 
  product, coverage_amount, annual_premium, issue_date, status, 
  payment_frequency, first_year_start, first_year_end, has_new_business_counted
) VALUES (
  'POL-MONTHLY-001', 
  (SELECT id FROM clients WHERE name='عميل الاختبار' LIMIT 1),
  'agent-test-001',
  'tl-test-001',
  (SELECT id FROM branches WHERE name='فرع الاختبار' LIMIT 1),
  'تأمين حياة',
  100000,
  12000,
  '2026-06-22',
  'active',
  'monthly',
  '2026-06-22',
  '2027-06-21',
  false
) ON CONFLICT DO NOTHING;

-- التحقق من الأقساط المُنشأة تلقائياً
SELECT 'وثيقة شهرية - الأقساط المُنشأة' as test_name, COUNT(*) as count, 
  MIN(due_date) as first_due, MAX(due_date) as last_due
FROM installments 
WHERE policy_id = (SELECT id FROM policies WHERE policy_number='POL-MONTHLY-001' LIMIT 1);

-- 4. اختبار السيناريو الثاني: وثيقة ربع سنوية (4 أقساط × 3000)
-- ============================================================================
INSERT INTO public.policies (
  policy_number, client_id, agent_id, team_leader_id, branch_id, 
  product, coverage_amount, annual_premium, issue_date, status, 
  payment_frequency, first_year_start, first_year_end, has_new_business_counted
) VALUES (
  'POL-QUARTERLY-001', 
  (SELECT id FROM clients WHERE name='عميل الاختبار' LIMIT 1),
  'agent-test-001',
  'tl-test-001',
  (SELECT id FROM branches WHERE name='فرع الاختبار' LIMIT 1),
  'تأمين حياة',
  100000,
  12000,
  '2026-06-22',
  'active',
  'quarterly',
  '2026-06-22',
  '2027-06-21',
  false
) ON CONFLICT DO NOTHING;

SELECT 'وثيقة ربع سنوية - الأقساط المُنشأة' as test_name, COUNT(*) as count,
  MIN(due_date) as first_due, MAX(due_date) as last_due
FROM installments 
WHERE policy_id = (SELECT id FROM policies WHERE policy_number='POL-QUARTERLY-001' LIMIT 1);

-- 5. اختبار السيناريو الثالث: وثيقة نصف سنوية (قسطان × 6000)
-- ============================================================================
INSERT INTO public.policies (
  policy_number, client_id, agent_id, team_leader_id, branch_id, 
  product, coverage_amount, annual_premium, issue_date, status, 
  payment_frequency, first_year_start, first_year_end, has_new_business_counted
) VALUES (
  'POL-SEMI-001', 
  (SELECT id FROM clients WHERE name='عميل الاختبار' LIMIT 1),
  'agent-test-001',
  'tl-test-001',
  (SELECT id FROM branches WHERE name='فرع الاختبار' LIMIT 1),
  'تأمين حياة',
  100000,
  12000,
  '2026-06-22',
  'active',
  'semi_annual',
  '2026-06-22',
  '2027-06-21',
  false
) ON CONFLICT DO NOTHING;

SELECT 'وثيقة نصف سنوية - الأقساط المُنشأة' as test_name, COUNT(*) as count,
  MIN(due_date) as first_due, MAX(due_date) as last_due
FROM installments 
WHERE policy_id = (SELECT id FROM policies WHERE policy_number='POL-SEMI-001' LIMIT 1);

-- 6. اختبار السيناريو الرابع: وثيقة سنوية (قسط واحد × 12000)
-- ============================================================================
INSERT INTO public.policies (
  policy_number, client_id, agent_id, team_leader_id, branch_id, 
  product, coverage_amount, annual_premium, issue_date, status, 
  payment_frequency, first_year_start, first_year_end, has_new_business_counted
) VALUES (
  'POL-ANNUAL-001', 
  (SELECT id FROM clients WHERE name='عميل الاختبار' LIMIT 1),
  'agent-test-001',
  'tl-test-001',
  (SELECT id FROM branches WHERE name='فرع الاختبار' LIMIT 1),
  'تأمين حياة',
  100000,
  12000,
  '2026-06-22',
  'active',
  'annual',
  '2026-06-22',
  '2027-06-21',
  false
) ON CONFLICT DO NOTHING;

SELECT 'وثيقة سنوية - الأقساط المُنشأة' as test_name, COUNT(*) as count,
  MIN(due_date) as first_due, MAX(due_date) as last_due
FROM installments 
WHERE policy_id = (SELECT id FROM policies WHERE policy_number='POL-ANNUAL-001' LIMIT 1);

-- 7. اختبار التحصيل: تسجيل أول قسط (يجب أن يكون "جديد")
-- ============================================================================
-- الحصول على أول قسط من الوثيقة الشهرية
WITH first_installment AS (
  SELECT i.id, i.policy_id, i.amount, i.due_date
  FROM installments i
  WHERE i.policy_id = (SELECT id FROM policies WHERE policy_number='POL-MONTHLY-001' LIMIT 1)
  ORDER BY i.installment_number ASC
  LIMIT 1
)
INSERT INTO public.collections (
  installment_id, policy_id, amount, collection_date, collected_by, branch_id
)
SELECT id, policy_id, amount, '2026-06-22', 'agent-test-001', 
  (SELECT branch_id FROM policies WHERE policy_number='POL-MONTHLY-001' LIMIT 1)
FROM first_installment
ON CONFLICT DO NOTHING;

-- التحقق من تصنيف التحصيل (يجب أن يكون "new")
SELECT 'التحصيل الأول - يجب أن يكون جديد' as test_name, 
  collection_category, COUNT(*) as count
FROM collections 
WHERE policy_id = (SELECT id FROM policies WHERE policy_number='POL-MONTHLY-001' LIMIT 1)
GROUP BY collection_category;

-- 8. اختبار التحصيل: تسجيل ثاني قسط (يجب أن يكون "first_year")
-- ============================================================================
WITH second_installment AS (
  SELECT i.id, i.policy_id, i.amount, i.due_date
  FROM installments i
  WHERE i.policy_id = (SELECT id FROM policies WHERE policy_number='POL-MONTHLY-001' LIMIT 1)
  ORDER BY i.installment_number ASC
  LIMIT 1 OFFSET 1
)
INSERT INTO public.collections (
  installment_id, policy_id, amount, collection_date, collected_by, branch_id
)
SELECT id, policy_id, amount, '2026-07-22', 'agent-test-001',
  (SELECT branch_id FROM policies WHERE policy_number='POL-MONTHLY-001' LIMIT 1)
FROM second_installment
ON CONFLICT DO NOTHING;

-- التحقق من تصنيف التحصيلات
SELECT 'التحصيلات - التصنيف الكامل' as test_name, 
  collection_category, COUNT(*) as count
FROM collections 
WHERE policy_id = (SELECT id FROM policies WHERE policy_number='POL-MONTHLY-001' LIMIT 1)
GROUP BY collection_category
ORDER BY collection_category;

-- 9. التحقق من تحديث حالة الأقساط
SELECT 'حالات الأقساط بعد التحصيل' as test_name,
  status, COUNT(*) as count
FROM installments
WHERE policy_id = (SELECT id FROM policies WHERE policy_number='POL-MONTHLY-001' LIMIT 1)
GROUP BY status;

-- 10. التحقق من unified_performance_metrics
SELECT 'بيانات الأداء الموحدة' as test_name,
  collection_category, COUNT(*) as count, SUM(amount) as total_amount
FROM unified_performance_metrics
WHERE policy_id IN (SELECT id FROM policies WHERE policy_number LIKE 'POL-%')
GROUP BY collection_category
ORDER BY collection_category;

-- 11. التحقق من عدم احتساب أكثر من جديد لنفس الوثيقة
SELECT 'التحقق من عدم تكرار الجديد' as test_name,
  policy_id, COUNT(CASE WHEN collection_category='new' THEN 1 END) as new_count
FROM collections
WHERE policy_id IN (SELECT id FROM policies WHERE policy_number LIKE 'POL-%')
GROUP BY policy_id
HAVING COUNT(CASE WHEN collection_category='new' THEN 1 END) > 1;

-- 12. التحقق من has_new_business_counted
SELECT 'حالة احتساب الجديد في الوثائق' as test_name,
  policy_number, has_new_business_counted, 
  (SELECT COUNT(*) FROM collections WHERE policy_id=policies.id AND collection_category='new') as new_collections_count
FROM policies
WHERE policy_number LIKE 'POL-%'
ORDER BY policy_number;
