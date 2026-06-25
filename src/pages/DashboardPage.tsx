import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { StatsCard, Card, CardHeader, Badge, Table } from '../components/ui';
import type { DashboardStats, Policy, Collection, Target } from '../types/database';
import {
  FileText,
  CreditCard,
  Users,
  TrendingUp,
  Target as TargetIcon,
  AlertTriangle,
  DollarSign,
  Calendar,
} from 'lucide-react';

export default function DashboardPage() {
  const { profile } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentPolicies, setRecentPolicies] = useState<Policy[]>([]);
  const [pendingCollections, setPendingCollections] = useState<Collection[]>([]);
  const [target, setTarget] = useState<Target | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (profile) {
      fetchDashboardData();
    }
  }, [profile]);

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth() + 1;
      const startOfMonth = new Date(currentYear, currentMonth - 1, 1).toISOString();
      const endOfMonth = new Date(currentYear, currentMonth, 0).toISOString();

      // Fetch policies count
      const { count: totalPolicies } = await supabase
        .from('policies')
        .select('*', { count: 'exact', head: true });

      const { count: activePolicies } = await supabase
        .from('policies')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'active');

      // Fetch new policies this month
      const { data: newPoliciesData } = await supabase
        .from('policies')
        .select('premium_amount')
        .gte('issue_date', startOfMonth)
        .lte('issue_date', endOfMonth);

      const newPoliciesCount = newPoliciesData?.length || 0;
      const totalNewPremium = newPoliciesData?.reduce((sum, p) => sum + Number(p.premium_amount), 0) || 0;

      // Fetch pending collections
      const { count: pendingCount } = await supabase
        .from('collections')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending');

      const { count: overdueCount } = await supabase
        .from('collections')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'overdue');

      // Fetch clients count
      const { count: totalClients } = await supabase
        .from('clients')
        .select('*', { count: 'exact', head: true });

      const { count: newClients } = await supabase
        .from('clients')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', startOfMonth);

      // Fetch users count based on role
      let agentsQuery = supabase.from('profiles').select('*', { count: 'exact', head: true });
      if (profile?.role !== 'super_admin' && profile?.branch_id) {
        agentsQuery = agentsQuery.eq('branch_id', profile.branch_id);
      }
      const { count: totalAgents } = await agentsQuery;

      const { count: activeAgents } = await agentsQuery.eq('is_active', true);

      // Fetch recent policies
      const { data: recentPoliciesData } = await supabase
        .from('policies')
        .select('*, client:clients(full_name), agent:profiles(full_name)')
        .order('created_at', { ascending: false })
        .limit(5);

      // Fetch pending collections with details
      const { data: pendingCollectionsData } = await supabase
        .from('collections')
        .select('*, policy:policies(policy_number), client:clients(full_name)')
        .eq('status', 'pending')
        .order('due_date', { ascending: true })
        .limit(5);

      // Fetch target
      const { data: targetData } = await supabase
        .from('targets')
        .select('*')
        .eq('user_id', profile!.id)
        .eq('year', currentYear)
        .eq('month', currentMonth)
        .maybeSingle();

      setStats({
        total_policies: totalPolicies || 0,
        active_policies: activePolicies || 0,
        new_policies_this_month: newPoliciesCount,
        total_premium: totalNewPremium,
        monthly_premium: totalNewPremium,
        pending_collections: pendingCount || 0,
        overdue_collections: overdueCount || 0,
        total_agents: totalAgents || 0,
        active_agents: activeAgents || 0,
        total_clients: totalClients || 0,
        new_clients_this_month: newClients || 0,
        achievement_percentage: targetData
          ? (Number(targetData.achieved_amount) / Number(targetData.target_amount)) * 100
          : 0,
      });

      setRecentPolicies(recentPoliciesData || []);
      setPendingCollections(pendingCollectionsData || []);
      setTarget(targetData);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const policyColumns = [
    { key: 'policy_number', header: 'رقم الوثيقة' },
    {
      key: 'client',
      header: 'العميل',
      render: (policy: Policy) => policy.client?.full_name || '-',
    },
    {
      key: 'premium_amount',
      header: 'قيمة القسط',
      render: (policy: Policy) => `${Number(policy.premium_amount).toLocaleString()} ر.س`,
    },
    {
      key: 'status',
      header: 'الحالة',
      render: (policy: Policy) => {
        const variants: Record<string, 'success' | 'warning' | 'danger' | 'default'> = {
          active: 'success',
          pending: 'warning',
          cancelled: 'danger',
          expired: 'default',
        };
        const labels: Record<string, string> = {
          active: 'نشط',
          pending: 'قيد الانتظار',
          cancelled: 'ملغي',
          expired: 'منتهي',
        };
        return (
          <Badge variant={variants[policy.status] || 'default'}>
            {labels[policy.status] || policy.status}
          </Badge>
        );
      },
    },
  ];

  const collectionColumns = [
    { key: 'policy', header: 'رقم الوثيقة', render: (c: Collection) => c.policy?.policy_number || '-' },
    { key: 'client', header: 'العميل', render: (c: Collection) => c.client?.full_name || '-' },
    {
      key: 'amount',
      header: 'المبلغ',
      render: (c: Collection) => `${Number(c.amount).toLocaleString()} ر.س`,
    },
    {
      key: 'due_date',
      header: 'تاريخ الاستحقاق',
      render: (c: Collection) => new Date(c.due_date).toLocaleDateString('ar-SA'),
    },
  ];

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="animate-pulse">
          <div className="h-8 w-48 bg-gray-200 rounded mb-6" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-32 bg-gray-100 rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Welcome */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          مرحباً، {profile?.full_name}
        </h1>
        <p className="text-gray-500 mt-1">
          {new Date().toLocaleDateString('ar-SA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard
          title="الوثائق الجديدة هذا الشهر"
          value={stats?.new_policies_this_month || 0}
          icon={<FileText className="w-6 h-6" />}
          variant="primary"
        />
        <StatsCard
          title="إجمالي الأقساط"
          value={`${(stats?.total_premium || 0).toLocaleString()} ر.س`}
          icon={<DollarSign className="w-6 h-6" />}
          variant="success"
        />
        <StatsCard
          title="التحصيلات المعلقة"
          value={stats?.pending_collections || 0}
          icon={<CreditCard className="w-6 h-6" />}
          variant="warning"
        />
        <StatsCard
          title="العملاء الجدد"
          value={stats?.new_clients_this_month || 0}
          icon={<Users className="w-6 h-6" />}
        />
      </div>

      {/* Target Progress */}
      {target && (
        <Card>
          <CardHeader title="تقدم الهدف الشهري" subtitle={`${target.month}/${target.year}`} />
          <div className="mt-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-600">
                {Number(target.achieved_amount).toLocaleString()} / {Number(target.target_amount).toLocaleString()} ر.س
              </span>
              <span className="text-sm font-medium text-blue-600">
                {stats?.achievement_percentage.toFixed(1)}%
              </span>
            </div>
            <div className="w-full h-3 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-blue-500 to-blue-600 rounded-full transition-all duration-500"
                style={{ width: `${Math.min(stats?.achievement_percentage || 0, 100)}%` }}
              />
            </div>
          </div>
        </Card>
      )}

      {/* Tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader title="أحدث الوثائق" />
          <Table columns={policyColumns} data={recentPolicies} emptyMessage="لا توجد وثائق حديثة" />
        </Card>

        <Card>
          <CardHeader title="التحصيلات المعلقة" action={
            <Badge variant="danger">{stats?.overdue_collections || 0} متأخر</Badge>
          } />
          <Table columns={collectionColumns} data={pendingCollections} emptyMessage="لا توجد تحصيلات معلقة" />
        </Card>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-blue-500 text-white rounded-xl">
              <FileText className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm text-blue-600 font-medium">إجمالي الوثائق</p>
              <p className="text-2xl font-bold text-blue-900">{stats?.total_policies}</p>
              <p className="text-xs text-blue-600">{stats?.active_policies} نشط</p>
            </div>
          </div>
        </Card>

        <Card className="bg-gradient-to-br from-green-50 to-green-100 border-green-200">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-green-500 text-white rounded-xl">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm text-green-600 font-medium">إجمالي العملاء</p>
              <p className="text-2xl font-bold text-green-900">{stats?.total_clients}</p>
              <p className="text-xs text-green-600">{stats?.active_agents} وكيل نشط</p>
            </div>
          </div>
        </Card>

        <Card className="bg-gradient-to-br from-yellow-50 to-yellow-100 border-yellow-200">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-yellow-500 text-white rounded-xl">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm text-yellow-600 font-medium">تحصيلات متأخرة</p>
              <p className="text-2xl font-bold text-yellow-900">{stats?.overdue_collections}</p>
              <p className="text-xs text-yellow-600">تحتاج متابعة</p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
