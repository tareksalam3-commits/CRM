import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import {
  Policy, POLICY_STATUS_LABELS, PAYMENT_FREQUENCY_LABELS,
  PolicyStatus, PaymentFrequency,
} from '../../types';
import { formatCurrency, formatDate, getInstallmentCount } from '../../lib/utils';
import PageHeader from '../common/PageHeader';
import LoadingSpinner from '../common/LoadingSpinner';
import {
  FileText, Plus, Edit2, Trash2, X, Search, Eye,
  Calendar, DollarSign, ChevronDown,
} from 'lucide-react';
import toast from 'react-hot-toast';

const EMPTY_FORM = {
  policy_number: '', client_id: '', agent_id: '', team_leader_id: '', branch_id: '', product: '',
  coverage_amount: '', annual_premium: '', issue_date: '',
  status: 'under_issuance' as PolicyStatus,
  payment_frequency: 'monthly' as PaymentFrequency,
  payment_method: '',
};

const STATUS_FILTER_OPTS = [
  { key: 'all', label: 'الكل' },
  { key: 'under_issuance', label: 'تحت الإصدار' },
  { key: 'active', label: 'سارية' },
  { key: 'suspended', label: 'معلقة' },
  { key: 'cancelled', label: 'ملغاة' },
];

export default function PolicyManagement() {
  const { profile } = useAuth();
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [clients, setClients] = useState<{ id: string; name: string; phone: string }[]>([]);
  const [agents, setAgents] = useState<{ id: string; full_name: string; role: string }[]>([]);
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([]);
  const [products, setProducts] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingPolicy, setEditingPolicy] = useState<Policy | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | PolicyStatus>('all');
  const [selectedPolicy, setSelectedPolicy] = useState<Policy | null>(null);

  const [formData, setFormData] = useState({ ...EMPTY_FORM });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const userRole = profile?.role;
      const userId = profile?.id;
      const branchId = profile?.active_branch_id;

      // Queries
      let policiesQuery = supabase
        .from('policies')
        .select('*, client:clients(name, phone), agent:profiles!policies_agent_id_fkey(full_name), branch:branches(name)')
        .order('created_at', { ascending: false });

      let clientsQuery = supabase.from('clients').select('id, name, phone').order('name');
      let agentsQuery = supabase.from('profiles').select('id, full_name, role').eq('is_active', true).order('full_name');
      let branchesQuery = supabase.from('branches').select('id, name').eq('is_active', true).order('name');
      let settingsQuery = supabase.from('system_settings').select('key, value');

      // تطبيق الفلاتر حسب الدور الوظيفي والهيكل الهرمي
      if (userRole === 'agent') {
        // الوكيل يرى وثائقه فقط
        policiesQuery = policiesQuery.eq('agent_id', userId);
        clientsQuery = clientsQuery.eq('agent_id', userId);
      } else if (userRole === 'team_leader') {
        // رئيس المجموعة يرى نفسه وأعضاء فريقه
        policiesQuery = policiesQuery.or(`agent_id.eq.${userId},team_leader_id.eq.${userId}`);
      } else if (userRole === 'supervisor') {
        // المشرف يرى رؤساء المجموعات والوكلاء التابعين له
        policiesQuery = policiesQuery.eq('supervisor_id', userId);
      } else if (userRole === 'general_supervisor') {
        // المشرف العام يرى وثائق فرعه بالكامل
        policiesQuery = policiesQuery.eq('branch_id', branchId);
      }
      // Super Admin و Dev Manager يرون الكل بدون فلاتر

      const [policiesRes, clientsRes, agentsRes, branchesRes, settingsRes] = await Promise.all([
        policiesQuery,
        clientsQuery,
        agentsQuery,
        branchesQuery,
        settingsQuery,
      ]);

      if (policiesRes.error) throw policiesRes.error;
      
      setPolicies(policiesRes.data as unknown as Policy[]);
      if (clientsRes.data) setClients(clientsRes.data);
      if (agentsRes.data) setAgents(agentsRes.data);
      if (branchesRes.data) setBranches(branchesRes.data);
      
      if (settingsRes.data) {
        const mapped: Record<string, any> = {};
        settingsRes.data.forEach(s => { mapped[s.key] = s.value; });
        setProducts(mapped.insurance_products || []);
      }
    } catch (err: any) {
      console.error('loadData error:', err);
      toast.error('خطأ في تحميل البيانات: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, [profile]);

  useEffect(() => { loadData(); }, [loadData]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!formData.client_id) { toast.error('يجب اختيار العميل'); return; }
    if (!formData.product) { toast.error('يجب اختيار المنتج'); return; }
    if (!formData.policy_number.trim()) { toast.error('رقم الوثيقة مطلوب'); return; }
    
    // التحقق من صيغة رقم الوثيقة
    const policyNumberRegex = /^POL-\d{4}-\d{5}$/;
    if (!policyNumberRegex.test(formData.policy_number.trim())) {
      toast.error('صيغة رقم الوثيقة غير صحيحة (POL-YYYY-XXXXX)');
      return;
    }
    
    if (!formData.issue_date) { toast.error('تاريخ الإصدار مطلوب'); return; }

    const coverageAmount = Number(formData.coverage_amount);
    const annualPremium = Number(formData.annual_premium);

    if (isNaN(coverageAmount) || coverageAmount <= 0) { toast.error('مبلغ التأمين غير صحيح'); return; }
    if (isNaN(annualPremium) || annualPremium <= 0) { toast.error('القسط السنوي غير صحيح'); return; }

    setSubmitting(true);

    const payload = {
      policy_number: formData.policy_number.trim(),
      client_id: formData.client_id,
      agent_id: profile?.role === 'agent' ? profile.id : (formData.agent_id || profile?.id),
      branch_id: formData.branch_id || profile?.active_branch_id,
      product: formData.product,
      coverage_amount: coverageAmount,
      annual_premium: annualPremium,
      issue_date: formData.issue_date,
      status: formData.status,
      payment_frequency: formData.payment_frequency,
      payment_method: formData.payment_method || null,
    };

    try {
      if (editingPolicy) {
        const { error } = await supabase
          .from('policies')
          .update({ ...payload, updated_at: new Date().toISOString() })
          .eq('id', editingPolicy.id);
        if (error) throw error;
        toast.success('✅ تم تحديث الوثيقة');
      } else {
        const { data, error } = await supabase.from('policies').insert(payload).select().single();
        if (error) throw error;
        if (data) {
          await generateInstallments(data.id, annualPremium, formData.payment_frequency, formData.issue_date);
        }
        toast.success('✅ تم إنشاء الوثيقة وجدول الأقساط');
      }
      resetForm();
      loadData();
    } catch (err: any) {
      toast.error('خطأ في الحفظ: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function generateInstallments(policyId: string, annualPremium: number, frequency: PaymentFrequency, startDate: string) {
    const count = getInstallmentCount(frequency);
    const amount = Math.round((annualPremium / count) * 100) / 100;
    const monthsPerInstallment = 12 / count;

    const installments = Array.from({ length: count }, (_, i) => {
      const dueDate = new Date(startDate);
      dueDate.setMonth(dueDate.getMonth() + i * monthsPerInstallment);
      return {
        policy_id: policyId,
        installment_number: i + 1,
        amount,
        due_date: dueDate.toISOString().split('T')[0],
        status: 'pending' as const,
      };
    });

    const { error } = await supabase.from('installments').insert(installments);
    if (error) toast.error('تحذير: فشل إنشاء جدول الأقساط');
  }

  async function deletePolicy(policy: Policy) {
    if (!confirm(`هل أنت متأكد من حذف الوثيقة "${policy.policy_number}"؟`)) return;
    const { error } = await supabase.from('policies').delete().eq('id', policy.id);
    if (error) {
      toast.error('خطأ في الحذف: ' + error.message);
      return;
    }
    toast.success('تم حذف الوثيقة');
    loadData();
  }

  function startEdit(policy: Policy) {
    setEditingPolicy(policy);
    setFormData({
      policy_number: policy.policy_number,
      client_id: policy.client_id,
      agent_id: policy.agent_id,
      team_leader_id: policy.team_leader_id || '',
      branch_id: policy.branch_id || '',
      product: policy.product,
      coverage_amount: String(policy.coverage_amount),
      annual_premium: String(policy.annual_premium),
      issue_date: policy.issue_date,
      status: policy.status,
      payment_frequency: policy.payment_frequency,
      payment_method: policy.payment_method || '',
    });
    setShowForm(true);
  }

  function resetForm() {
    setShowForm(false);
    setEditingPolicy(null);
    setFormData({ ...EMPTY_FORM });
    setSubmitting(false);
  }

  const filtered = policies.filter(p => {
    const matchSearch = p.policy_number.toLowerCase().includes(search.toLowerCase()) ||
                        (p.client as any)?.name?.includes(search);
    const matchStatus = statusFilter === 'all' || p.status === statusFilter;
    return matchSearch && matchStatus;
  });

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="إدارة الوثائق"
        description={`${filtered.length} من ${policies.length} وثيقة`}
        icon={FileText}
        actions={
          <button onClick={() => { setEditingPolicy(null); setFormData({ ...EMPTY_FORM }); setShowForm(true); }} className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-medium transition-colors">
            <Plus className="w-4 h-4" />
            <span>إضافة وثيقة</span>
          </button>
        }
      />

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث باسم العميل أو رقم الوثيقة..." className="w-full pr-10 pl-4 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none" />
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)} className="px-4 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none">
          {STATUS_FILTER_OPTS.map(opt => <option key={opt.key} value={opt.key}>{opt.label}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {filtered.map(policy => (
          <div key={policy.id} className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-100 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-blue-50 dark:bg-blue-900/20 rounded-xl flex items-center justify-center text-blue-600"><FileText className="w-6 h-6" /></div>
              <div>
                <p className="font-bold text-slate-900 dark:text-white">{(policy.client as any)?.name}</p>
                <p className="text-sm text-slate-500">الوثيقة: {policy.policy_number} | المندوب: {(policy.agent as any)?.full_name}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className={`px-3 py-1 rounded-full text-xs font-bold ${policy.status === 'active' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>{POLICY_STATUS_LABELS[policy.status]}</span>
              <button onClick={() => startEdit(policy)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg text-blue-600"><Edit2 className="w-4 h-4" /></button>
              <button onClick={() => deletePolicy(policy)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg text-red-600"><Trash2 className="w-4 h-4" /></button>
            </div>
          </div>
        ))}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold">{editingPolicy ? 'تعديل وثيقة' : 'إضافة وثيقة جديدة'}</h3>
              <button onClick={resetForm} className="p-2 hover:bg-slate-100 rounded-full"><X className="w-6 h-6" /></button>
            </div>
            <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-bold">رقم الوثيقة *</label>
                <input required type="text" value={formData.policy_number} onChange={e => setFormData({...formData, policy_number: e.target.value})} placeholder="POL-YYYY-00001" className="w-full px-4 py-2 border rounded-xl" />
                <p className="text-xs text-slate-500">الصيغة: POL-YYYY-XXXXX (مثال: POL-2026-00001)</p>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-bold">العميل *</label>
                <select required value={formData.client_id} onChange={e => setFormData({...formData, client_id: e.target.value})} className="w-full px-4 py-2 border rounded-xl">
                  <option value="">اختر العميل</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-bold">المنتج *</label>
                <select required value={formData.product} onChange={e => setFormData({...formData, product: e.target.value})} className="w-full px-4 py-2 border rounded-xl">
                  <option value="">اختر المنتج</option>
                  {products.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-bold">تاريخ الإصدار *</label>
                <input required type="date" value={formData.issue_date} onChange={e => setFormData({...formData, issue_date: e.target.value})} className="w-full px-4 py-2 border rounded-xl" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-bold">مبلغ التأمين *</label>
                <input required type="number" value={formData.coverage_amount} onChange={e => setFormData({...formData, coverage_amount: e.target.value})} className="w-full px-4 py-2 border rounded-xl" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-bold">القسط السنوي *</label>
                <input required type="number" value={formData.annual_premium} onChange={e => setFormData({...formData, annual_premium: e.target.value})} className="w-full px-4 py-2 border rounded-xl" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-bold">نظام الدفع</label>
                <select value={formData.payment_frequency} onChange={e => setFormData({...formData, payment_frequency: e.target.value as any})} className="w-full px-4 py-2 border rounded-xl">
                  {Object.entries(PAYMENT_FREQUENCY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-bold">الحالة</label>
                <select value={formData.status} onChange={e => setFormData({...formData, status: e.target.value as any})} className="w-full px-4 py-2 border rounded-xl">
                  {Object.entries(POLICY_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div className="col-span-full pt-4">
                <button type="submit" disabled={submitting} className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold disabled:bg-blue-400">
                  {submitting ? 'جاري الحفظ...' : (editingPolicy ? 'تحديث الوثيقة' : 'إنشاء الوثيقة')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
