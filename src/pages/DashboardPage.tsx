import { useEffect, useState } from 'react';
import { supabase, type Policy, type Installment } from '../lib/supabase';
import { useAuthContext } from '../contexts/AuthContext';
import { fetchDashboardStats, type DashboardStats } from '../lib/stats';
import {
  FileText, Receipt, Users, TrendingUp, AlertCircle, Clock,
  Target, Award, ArrowUpRight, ChevronLeft,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line,
} from 'recharts';
import type { PageProps } from '../types';

const COLORS = ['#059669', '#10b981', '#34d399', '#6ee7b7', '#a7f3d0'];

export default function DashboardPage(_props: PageProps) {
  const { user } = useAuthContext();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentPolicies, setRecentPolicies] = useState<Policy[]>([]);
  const [dueInstallments, setDueInstallments] = useState<Installment[]>([]);
  const [collectionsByMonth, setCollectionsByMonth] = useState<{ month: string; amount: number }[]>([]);
  const [policiesByType, setPoliciesByType] = useState<{ name: string; count: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    fetchAllData();
  }, [user]);

  const fetchAllData = async () => {
    setLoading(true);
    try {
      const statsData = await fetchDashboardStats(user!.id, user!.role);
      setStats(statsData);

      // Recent policies
      const { data: recentPoliciesData } = await supabase
        .from('policies')
        .select('*, clients(full_name), policy_types(name)')
        .order('created_at', { ascending: false })
        .limit(5);
      setRecentPolicies((recentPoliciesData as unknown as Policy[]) || []);

      // Due installments
      const { data: dueData } = await supabase
        .from('installments')
        .select('*, policies(policy_number, client_id, clients(full_name))')
        .eq('status', 'due')
        .order('due_date', { ascending: true })
        .limit(5);
      
      const transformedDue = (dueData as any[])?.map(inst => ({
        ...inst,
        clients: inst.policies?.clients
      })) || [];
      setDueInstallments(transformedDue as unknown as Installment[]);

      // Collections by month (current year)
      const year = new Date().getFullYear();
      const { data: collData } = await supabase
        .from('collections')
        .select('collection_date, amount')
        .gte('collection_date', `${year}-01-01`)
        .lte('collection_date', `${year}-12-31`);
      const monthMap = new Map<string, number>();
      collData?.forEach((c) => {
        const month = new Date(c.collection_date).toLocaleDateString('ar-EG', { month: 'short' });
        monthMap.set(month, (monthMap.get(month) || 0) + (c.amount || 0));
      });
      setCollectionsByMonth(Array.from(monthMap.entries()).map(([month, amount]) => ({ month, amount })));

      // Policies by type
      const { data: typeData } = await supabase
        .from('policies')
        .select('policy_type_id, policy_types(name)');
      const typeMap = new Map<string, number>();
      (typeData as unknown as { policy_types?: { name: string } }[])?.forEach((p) => {
        const name = p.policy_types?.name || 'غير محدد';
        typeMap.set(name, (typeMap.get(name) || 0) + 1);
      });
      setPoliciesByType(Array.from(typeMap.entries()).map(([name, count]) => ({ name, count })));
    } catch (err) {
      console.error('Dashboard error:', err);
    } finally {
      setLoading(false);
    }
  };

  const statCards = stats ? [
    { label: 'العملاء', value: stats.totalClients, icon: Users, color: 'bg-blue-500', lightColor: 'bg-blue-50 text-blue-700' },
    { label: 'الوثائق', value: stats.totalPolicies, icon: FileText, color: 'bg-emerald-500', lightColor: 'bg-emerald-50 text-emerald-700' },
    { label: 'إجمالي التحصيل', value: stats.totalCollections.toLocaleString(), icon: Receipt, color: 'bg-teal-500', lightColor: 'bg-teal-50 text-teal-700' },
    { label: 'التحصيل الشهري', value: stats.monthlyCollections.toLocaleString(), icon: TrendingUp, color: 'bg-amber-500', lightColor: 'bg-amber-50 text-amber-700' },
  ] : [];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin w-10 h-10 border-3 border-emerald-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.label} className="stat-card">
              <div className="flex items-start justify-between">
                <div className="min-w-0">
                  <p className="text-xs text-slate-500 font-medium mb-1">{card.label}</p>
                  <p className="text-xl lg:text-2xl font-extrabold text-slate-900">{card.value}</p>
                </div>
                <div className={`stat-icon ${card.lightColor}`}>
                  <Icon className="w-6 h-6" />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Target Progress */}
      {stats && stats.targetAmount > 0 && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Target className="w-5 h-5 text-emerald-600" />
              <h3 className="font-bold text-slate-900">تحقيق التارجت السنوي</h3>
            </div>
            <span className="text-2xl font-extrabold text-emerald-600">{stats.achievementRate}%</span>
          </div>
          <div className="progress-bar mb-3">
            <div className="progress-bar-fill bg-emerald-500" style={{ width: `${Math.min(stats.achievementRate, 100)}%` }} />
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-slate-500">المحقق: <span className="font-bold text-slate-800">{stats.achievedAmount.toLocaleString()}</span></span>
            <span className="text-slate-500">التارجت: <span className="font-bold text-slate-800">{stats.targetAmount.toLocaleString()}</span></span>
          </div>
        </div>
      )}

      {/* Alerts */}
      {(stats && (stats.totalDueInstallments > 0 || stats.totalOverdueInstallments > 0)) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {stats.totalDueInstallments > 0 && (
            <div className="card bg-amber-50 border-amber-100">
              <div className="flex items-center gap-3">
                <Clock className="w-5 h-5 text-amber-600 shrink-0" />
                <div>
                  <p className="font-bold text-amber-900 text-sm">أقساط مستحقة</p>
                  <p className="text-xs text-amber-700 mt-0.5">{stats.totalDueInstallments} قسط للتحصيل</p>
                </div>
              </div>
            </div>
          )}
          {stats.totalOverdueInstallments > 0 && (
            <div className="card bg-red-50 border-red-100">
              <div className="flex items-center gap-3">
                <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
                <div>
                  <p className="font-bold text-red-900 text-sm">أقساط متأخرة</p>
                  <p className="text-xs text-red-700 mt-0.5">{stats.totalOverdueInstallments} قسط متأخر</p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Collections Chart */}
        {collectionsByMonth.length > 0 && (
          <div className="card">
            <h3 className="section-title flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-600" />
              التحصيل الشهري
            </h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={collectionsByMonth}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip formatter={(value: number) => value.toLocaleString()} />
                  <Bar dataKey="amount" fill="#059669" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Policies by Type */}
        {policiesByType.length > 0 && (
          <div className="card">
            <h3 className="section-title flex items-center gap-2">
              <FileText className="w-4 h-4 text-emerald-600" />
              الوثائق حسب النوع
            </h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={policiesByType} dataKey="count" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                    {policiesByType.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-wrap gap-2 mt-3 justify-center">
              {policiesByType.map((t, i) => (
                <span key={t.name} className="chip" style={{ backgroundColor: COLORS[i % COLORS.length] + '20', color: COLORS[i % COLORS.length] }}>
                  {t.name}: {t.count}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Best Agents */}
      {stats && stats.bestAgents.length > 0 && (
        <div className="card">
          <h3 className="section-title flex items-center gap-2">
            <Award className="w-4 h-4 text-amber-500" />
            أفضل الوكلاء
          </h3>
          <div className="space-y-3">
            {stats.bestAgents.map((agent, i) => (
              <div key={agent.name} className="flex items-center gap-3">
                <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${i === 0 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>
                  {i + 1}
                </span>
                <span className="flex-1 text-sm font-semibold text-slate-800">{agent.name}</span>
                <span className="text-xs text-slate-500">{agent.policies} وثيقة</span>
                <ArrowUpRight className="w-4 h-4 text-emerald-500" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Policies */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="section-title mb-0">آخر الوثائق</h3>
          <span className="text-xs text-slate-400">آخر 5</span>
        </div>
        {recentPolicies.length === 0 ? (
          <div className="empty-state">
            <FileText className="empty-state-icon" />
            <p className="text-sm">لا توجد وثائق مسجلة</p>
          </div>
        ) : (
          <div className="space-y-3">
            {recentPolicies.map((policy: unknown) => {
              const p = policy as Policy & { clients?: { full_name: string }; policy_types?: { name: string } };
              return (
                <div key={p.id} className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
                  <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center shrink-0">
                    <FileText className="w-5 h-5 text-emerald-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-slate-900 truncate">{p.policy_number}</p>
                    <p className="text-xs text-slate-500">{p.clients?.full_name || '-'} · {p.policy_types?.name || '-'}</p>
                  </div>
                  <span className="text-sm font-bold text-slate-800">{p.sum_insured.toLocaleString()}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Due Installments */}
      {dueInstallments.length > 0 && (
        <div className="card border-amber-100">
          <div className="flex items-center justify-between mb-4">
            <h3 className="section-title mb-0 flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-500" />
              أقساط مستحقة
            </h3>
            <ChevronLeft className="w-4 h-4 text-slate-400" />
          </div>
          <div className="space-y-3">
            {dueInstallments.map((inst: unknown) => {
              const i = inst as Installment & { policies?: { policy_number: string }; clients?: { full_name: string } };
              return (
                <div key={i.id} className="flex items-center gap-3 p-3 bg-amber-50/50 rounded-xl border border-amber-100">
                  <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center shrink-0">
                    <Receipt className="w-5 h-5 text-amber-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-slate-900 truncate">{i.policies?.policy_number || '-'}</p>
                    <p className="text-xs text-slate-500">{i.clients?.full_name || '-'} · {new Date(i.due_date).toLocaleDateString('ar-EG')}</p>
                  </div>
                  <span className="text-sm font-bold text-amber-700">{i.amount.toLocaleString()}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
