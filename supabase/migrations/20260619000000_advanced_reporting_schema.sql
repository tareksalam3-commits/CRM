-- ================================================================
-- Insurance CRM Pro — Advanced Reporting Schema
-- Migration Date: 2026-06-19
-- Adds comprehensive reporting tables and enhanced month_closings
-- ================================================================

-- 1. Enhance month_closings table with detailed statistics
ALTER TABLE month_closings ADD COLUMN IF NOT EXISTS total_new_business numeric(12,2) DEFAULT 0;
ALTER TABLE month_closings ADD COLUMN IF NOT EXISTS total_collections numeric(12,2) DEFAULT 0;
ALTER TABLE month_closings ADD COLUMN IF NOT EXISTS new_clients_count int DEFAULT 0;
ALTER TABLE month_closings ADD COLUMN IF NOT EXISTS paid_installments_count int DEFAULT 0;
ALTER TABLE month_closings ADD COLUMN IF NOT EXISTS collection_rate numeric(5,2) DEFAULT 0;
ALTER TABLE month_closings ADD COLUMN IF NOT EXISTS closed_at timestamptz;
ALTER TABLE month_closings ADD COLUMN IF NOT EXISTS notes text;

-- 2. Create detailed_month_closing_data table for storing agent/group leader performance
CREATE TABLE IF NOT EXISTS detailed_month_closing_data (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  month_closing_id uuid NOT NULL REFERENCES month_closings(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  user_role text NOT NULL,
  new_business numeric(12,2) DEFAULT 0,
  collections numeric(12,2) DEFAULT 0,
  new_clients_count int DEFAULT 0,
  paid_installments_count int DEFAULT 0,
  collection_rate numeric(5,2) DEFAULT 0,
  target_amount numeric(12,2),
  target_achievement numeric(5,2),
  created_at timestamptz DEFAULT now(),
  UNIQUE(month_closing_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_detailed_closing_month ON detailed_month_closing_data(month_closing_id);
CREATE INDEX IF NOT EXISTS idx_detailed_closing_user ON detailed_month_closing_data(user_id);

-- 3. Create reports_cache table for optimizing report generation
CREATE TABLE IF NOT EXISTS reports_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_type text NOT NULL,
  report_month int,
  report_year int,
  filters jsonb,
  data jsonb NOT NULL,
  generated_at timestamptz DEFAULT now(),
  expires_at timestamptz,
  UNIQUE(report_type, report_month, report_year)
);

CREATE INDEX IF NOT EXISTS idx_reports_cache_type ON reports_cache(report_type);
CREATE INDEX IF NOT EXISTS idx_reports_cache_period ON reports_cache(report_year, report_month);

-- 4. Enable RLS on new tables
ALTER TABLE detailed_month_closing_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports_cache ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies for detailed_month_closing_data
DROP POLICY IF EXISTS "detailed_closing_select" ON detailed_month_closing_data;
DROP POLICY IF EXISTS "detailed_closing_select" ON detailed_month_closing_data; CREATE POLICY "detailed_closing_select" ON detailed_month_closing_data FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
      AND role IN ('super_admin', 'dev_manager')
    )
    OR user_id IN (SELECT get_subordinate_ids(auth.uid()))
  );

-- 6. RLS Policies for reports_cache (readable by all authenticated users)
DROP POLICY IF EXISTS "reports_cache_select" ON reports_cache;
DROP POLICY IF EXISTS "reports_cache_select" ON reports_cache; CREATE POLICY "reports_cache_select" ON reports_cache FOR SELECT
  TO authenticated
  USING (true);

-- 7. Create function to calculate agent performance
DROP FUNCTION IF EXISTS calculate_agent_performance CASCADE; CREATE OR REPLACE FUNCTION calculate_agent_performance(
  p_agent_id uuid,
  p_month int,
  p_year int
)
RETURNS TABLE (
  new_business numeric,
  collections numeric,
  new_clients int,
  paid_installments int,
  collection_rate numeric
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(SUM(CASE WHEN p.created_at::date >= make_date(p_year, p_month, 1) 
                      AND p.created_at::date < make_date(p_year, p_month, 1) + INTERVAL '1 month'
                      THEN p.annual_premium ELSE 0 END), 0)::numeric,
    COALESCE(SUM(CASE WHEN c.collection_date >= make_date(p_year, p_month, 1)
                      AND c.collection_date < make_date(p_year, p_month, 1) + INTERVAL '1 month'
                      THEN c.amount ELSE 0 END), 0)::numeric,
    COALESCE(COUNT(DISTINCT CASE WHEN cl.created_at::date >= make_date(p_year, p_month, 1)
                                  AND cl.created_at::date < make_date(p_year, p_month, 1) + INTERVAL '1 month'
                                  THEN cl.id END), 0)::int,
    COALESCE(COUNT(DISTINCT CASE WHEN i.paid_date >= make_date(p_year, p_month, 1)
                                  AND i.paid_date < make_date(p_year, p_month, 1) + INTERVAL '1 month'
                                  THEN i.id END), 0)::int,
    CASE 
      WHEN COALESCE(SUM(CASE WHEN p.created_at::date >= make_date(p_year, p_month, 1) 
                              AND p.created_at::date < make_date(p_year, p_month, 1) + INTERVAL '1 month'
                              THEN p.annual_premium ELSE 0 END), 0) = 0 THEN 0
      ELSE ROUND(
        COALESCE(SUM(CASE WHEN c.collection_date >= make_date(p_year, p_month, 1)
                          AND c.collection_date < make_date(p_year, p_month, 1) + INTERVAL '1 month'
                          THEN c.amount ELSE 0 END), 0) /
        COALESCE(SUM(CASE WHEN p.created_at::date >= make_date(p_year, p_month, 1) 
                          AND p.created_at::date < make_date(p_year, p_month, 1) + INTERVAL '1 month'
                          THEN p.annual_premium ELSE 0 END), 0) * 100, 2)
    END
  FROM policies p
  LEFT JOIN clients cl ON p.client_id = cl.id
  LEFT JOIN collections c ON p.id = c.policy_id
  LEFT JOIN installments i ON p.id = i.policy_id
  WHERE p.agent_id = p_agent_id;
END;

$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- 8. Create function to get top/bottom performers
DROP FUNCTION IF EXISTS get_top_performers CASCADE; CREATE OR REPLACE FUNCTION get_top_performers(
  p_month int,
  p_year int,
  p_limit int DEFAULT 5,
  p_order_by text DEFAULT 'new_business'
)
RETURNS TABLE (
  user_id uuid,
  full_name text,
  role text,
  new_business numeric,
  collections numeric,
  new_clients int
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    pr.id,
    pr.full_name,
    pr.role,
    COALESCE(SUM(CASE WHEN p.created_at::date >= make_date(p_year, p_month, 1) 
                      AND p.created_at::date < make_date(p_year, p_month, 1) + INTERVAL '1 month'
                      THEN p.annual_premium ELSE 0 END), 0)::numeric,
    COALESCE(SUM(CASE WHEN c.collection_date >= make_date(p_year, p_month, 1)
                      AND c.collection_date < make_date(p_year, p_month, 1) + INTERVAL '1 month'
                      THEN c.amount ELSE 0 END), 0)::numeric,
    COALESCE(COUNT(DISTINCT CASE WHEN cl.created_at::date >= make_date(p_year, p_month, 1)
                                  AND cl.created_at::date < make_date(p_year, p_month, 1) + INTERVAL '1 month'
                                  THEN cl.id END), 0)::int
  FROM profiles pr
  LEFT JOIN policies p ON pr.id = p.agent_id
  LEFT JOIN clients cl ON p.client_id = cl.id
  LEFT JOIN collections c ON p.id = c.policy_id
  WHERE pr.role = 'agent' AND pr.is_active = true
  GROUP BY pr.id, pr.full_name, pr.role
  ORDER BY
    CASE WHEN p_order_by = 'new_business' THEN COALESCE(SUM(CASE WHEN p.created_at::date >= make_date(p_year, p_month, 1) 
                                                                    AND p.created_at::date < make_date(p_year, p_month, 1) + INTERVAL '1 month'
                                                                    THEN p.annual_premium ELSE 0 END), 0) END DESC,
    CASE WHEN p_order_by = 'collections' THEN COALESCE(SUM(CASE WHEN c.collection_date >= make_date(p_year, p_month, 1)
                                                                   AND c.collection_date < make_date(p_year, p_month, 1) + INTERVAL '1 month'
                                                                   THEN c.amount ELSE 0 END), 0) END DESC
  LIMIT p_limit;
END;

$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- 9. Create indexes for performance optimization
CREATE INDEX IF NOT EXISTS idx_policies_created_at ON policies(created_at);
CREATE INDEX IF NOT EXISTS idx_collections_collection_date ON collections(collection_date);
CREATE INDEX IF NOT EXISTS idx_installments_paid_date ON installments(paid_date);
CREATE INDEX IF NOT EXISTS idx_clients_created_at ON clients(created_at);
