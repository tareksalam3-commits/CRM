-- ============================================================================
-- اختبار وإصلاح نظام الأهداف والتسلسل الهرمي للإنتاج
-- ============================================================================

-- 1. التحقق من وجود بيانات الموظفين والهيكل الإداري
SELECT 'الموظفون والهيكل الإداري' as test_name;
SELECT 
  p.id,
  p.full_name,
  p.role,
  p.active_branch_id,
  (SELECT full_name FROM profiles WHERE id=p.team_leader_id) as team_leader_name,
  (SELECT full_name FROM profiles WHERE id=p.supervisor_id) as supervisor_name,
  (SELECT full_name FROM profiles WHERE id=p.branch_manager_id) as branch_manager_name
FROM profiles
WHERE is_active = true AND role IN ('agent', 'team_leader', 'supervisor', 'general_supervisor')
ORDER BY role, full_name;

-- 2. التحقق من وجود الأهداف
SELECT 'الأهداف الموجودة' as test_name;
SELECT 
  t.id,
  (SELECT full_name FROM profiles WHERE id=t.user_id) as user_name,
  t.period_type,
  t.year,
  t.period_number,
  t.target_amount,
  (SELECT SUM(amount) FROM collections WHERE collected_by=t.user_id AND EXTRACT(YEAR FROM collection_date)=t.year) as actual_amount
FROM targets t
ORDER BY t.year DESC, t.period_type, t.period_number;

-- 3. التحقق من unified_performance_metrics
SELECT 'بيانات الأداء الموحدة' as test_name;
SELECT 
  COUNT(*) as total_records,
  COUNT(DISTINCT policy_id) as total_policies,
  COUNT(DISTINCT collected_by) as total_collectors,
  SUM(amount) as total_amount,
  COUNT(CASE WHEN collection_category='new' THEN 1 END) as new_count,
  COUNT(CASE WHEN collection_category='first_year' THEN 1 END) as first_year_count,
  COUNT(CASE WHEN collection_category='renewal' THEN 1 END) as renewal_count
FROM unified_performance_metrics;

-- 4. اختبار: إنشاء عميل جديد
INSERT INTO clients (name, phone, email, branch_id, agent_id)
SELECT 'عميل اختبار الأهداف', '01098765432', 'test-targets@example.com', 
  (SELECT id FROM branches WHERE is_active=true LIMIT 1),
  (SELECT id FROM profiles WHERE role='agent' AND is_active=true LIMIT 1)
WHERE NOT EXISTS (SELECT 1 FROM clients WHERE name='عميل اختبار الأهداف')
RETURNING id, name;

-- 5. اختبار: إنشاء وثيقة شهرية
INSERT INTO policies (
  policy_number, client_id, agent_id, team_leader_id, supervisor_id, branch_manager_id, branch_id,
  product, coverage_amount, annual_premium, issue_date, status, payment_frequency,
  first_year_start, first_year_end, has_new_business_counted
)
SELECT 
  'POL-TEST-MONTHLY-' || TO_CHAR(NOW(), 'YYYYMMDDHH24MISS'),
  (SELECT id FROM clients WHERE name='عميل اختبار الأهداف' LIMIT 1),
  (SELECT id FROM profiles WHERE role='agent' AND is_active=true LIMIT 1),
  (SELECT team_leader_id FROM profiles WHERE role='agent' AND is_active=true LIMIT 1),
  (SELECT supervisor_id FROM profiles WHERE role='agent' AND is_active=true LIMIT 1),
  (SELECT branch_manager_id FROM profiles WHERE role='agent' AND is_active=true LIMIT 1),
  (SELECT active_branch_id FROM profiles WHERE role='agent' AND is_active=true LIMIT 1),
  'تأمين حياة',
  100000,
  12000,
  CURRENT_DATE,
  'active',
  'monthly',
  CURRENT_DATE,
  CURRENT_DATE + INTERVAL '1 year',
  false
WHERE NOT EXISTS (SELECT 1 FROM policies WHERE policy_number LIKE 'POL-TEST-MONTHLY-%')
RETURNING id, policy_number, agent_id;

-- 6. التحقق من الأقساط المُنشأة
SELECT 'الأقساط المُنشأة' as test_name;
SELECT 
  i.id,
  i.installment_number,
  i.amount,
  i.due_date,
  i.status,
  p.policy_number
FROM installments i
JOIN policies p ON i.policy_id = p.id
WHERE p.policy_number LIKE 'POL-TEST-MONTHLY-%'
ORDER BY i.installment_number;

-- 7. اختبار: تسجيل أول قسط (يجب أن يكون "new")
WITH first_inst AS (
  SELECT i.id, i.policy_id, i.amount
  FROM installments i
  JOIN policies p ON i.policy_id = p.id
  WHERE p.policy_number LIKE 'POL-TEST-MONTHLY-%' AND i.installment_number = 1
  LIMIT 1
)
INSERT INTO collections (installment_id, policy_id, amount, collection_date, collected_by, branch_id)
SELECT 
  id, policy_id, amount, CURRENT_DATE,
  (SELECT agent_id FROM policies WHERE id=policy_id LIMIT 1),
  (SELECT branch_id FROM policies WHERE id=policy_id LIMIT 1)
FROM first_inst
WHERE NOT EXISTS (
  SELECT 1 FROM collections WHERE installment_id IN (SELECT id FROM first_inst)
)
RETURNING id, collection_category, is_new_business;

-- 8. التحقق من تصنيف التحصيل
SELECT 'تصنيف التحصيل الأول' as test_name;
SELECT 
  c.id,
  c.collection_category,
  c.is_new_business,
  c.amount,
  c.collection_date,
  (SELECT full_name FROM profiles WHERE id=c.collected_by) as collector_name,
  (SELECT policy_number FROM policies WHERE id=c.policy_id) as policy_number
FROM collections c
WHERE c.policy_id IN (SELECT id FROM policies WHERE policy_number LIKE 'POL-TEST-MONTHLY-%')
ORDER BY c.created_at DESC;

-- 9. التحقق من تحديث has_new_business_counted
SELECT 'تحديث حالة الجديد في الوثيقة' as test_name;
SELECT 
  p.id,
  p.policy_number,
  p.has_new_business_counted,
  (SELECT COUNT(*) FROM collections WHERE policy_id=p.id AND collection_category='new') as new_collections_count
FROM policies p
WHERE p.policy_number LIKE 'POL-TEST-MONTHLY-%';

-- 10. اختبار: تسجيل ثاني قسط (يجب أن يكون "first_year")
WITH second_inst AS (
  SELECT i.id, i.policy_id, i.amount
  FROM installments i
  JOIN policies p ON i.policy_id = p.id
  WHERE p.policy_number LIKE 'POL-TEST-MONTHLY-%' AND i.installment_number = 2
  LIMIT 1
)
INSERT INTO collections (installment_id, policy_id, amount, collection_date, collected_by, branch_id)
SELECT 
  id, policy_id, amount, CURRENT_DATE + INTERVAL '1 month',
  (SELECT agent_id FROM policies WHERE id=policy_id LIMIT 1),
  (SELECT branch_id FROM policies WHERE id=policy_id LIMIT 1)
FROM second_inst
WHERE NOT EXISTS (
  SELECT 1 FROM collections WHERE installment_id IN (SELECT id FROM second_inst)
)
RETURNING id, collection_category, is_new_business;

-- 11. التحقق من التسلسل الهرمي للإنتاج
SELECT 'التسلسل الهرمي للإنتاج' as test_name;
WITH agent_production AS (
  SELECT 
    c.collected_by as user_id,
    SUM(CASE WHEN c.collection_category='new' THEN c.amount ELSE 0 END) as new_production,
    SUM(CASE WHEN c.collection_category='first_year' THEN c.amount ELSE 0 END) as first_year_production,
    SUM(CASE WHEN c.collection_category='renewal' THEN c.amount ELSE 0 END) as renewal_production,
    SUM(c.amount) as total_production
  FROM collections c
  GROUP BY c.collected_by
)
SELECT 
  p.full_name as user_name,
  p.role,
  ap.new_production,
  ap.first_year_production,
  ap.renewal_production,
  ap.total_production,
  (SELECT full_name FROM profiles WHERE id=p.team_leader_id) as team_leader,
  (SELECT full_name FROM profiles WHERE id=p.supervisor_id) as supervisor,
  (SELECT full_name FROM profiles WHERE id=p.branch_manager_id) as branch_manager
FROM agent_production ap
JOIN profiles p ON ap.user_id = p.id
ORDER BY ap.total_production DESC;

-- 12. التحقق من تحديث الأقساط المسددة
SELECT 'حالات الأقساط بعد التحصيل' as test_name;
SELECT 
  status,
  COUNT(*) as count,
  SUM(amount) as total_amount
FROM installments
WHERE policy_id IN (SELECT id FROM policies WHERE policy_number LIKE 'POL-TEST-MONTHLY-%')
GROUP BY status;

-- 13. الملخص النهائي
SELECT 'ملخص الاختبار' as test_name;
SELECT 
  (SELECT COUNT(*) FROM policies WHERE policy_number LIKE 'POL-TEST-MONTHLY-%') as test_policies,
  (SELECT COUNT(*) FROM installments WHERE policy_id IN (SELECT id FROM policies WHERE policy_number LIKE 'POL-TEST-MONTHLY-%')) as test_installments,
  (SELECT COUNT(*) FROM collections WHERE policy_id IN (SELECT id FROM policies WHERE policy_number LIKE 'POL-TEST-MONTHLY-%')) as test_collections,
  (SELECT SUM(amount) FROM collections WHERE policy_id IN (SELECT id FROM policies WHERE policy_number LIKE 'POL-TEST-MONTHLY-%')) as total_collected;
