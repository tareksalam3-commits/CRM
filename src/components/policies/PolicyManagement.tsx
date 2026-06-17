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
  policy_number: '', client_id: '', agent_id: '', product: '', insurance_company: '',
  coverage_amount: '', annual_premium: '', issue_date: '', start_date: '',
  status: 'under_issuance' as PolicyStatus,
  payment_frequency: 'monthly' as PaymentFrequency,
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
  const [agents, setAgents] = useState<{ id: string; full_name: string }[]>([]);
  const [products, setProducts] = useState<string[]>([]);
  const [companies, setCompanies] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingPolicy, setEditingPolicy] = useState<Policy | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | PolicyStatus>('all');
  const [selectedPolicy, setSelectedPolicy] = useState<Policy | null>(null);

  const [formData, setFormData] = useState({ ...EMPTY_FORM });

  const loadData = useCallback(async () => {
    const [policiesRes, clientsRes, agentsRes, settingsRes] = await Promise.all([
      supabase
        .from('policies')
        .select('*, client:clients(name, phone), agent:profiles!policies_agent_id_fkey(full_name)')
        .order('created_at', { ascending: false }),
      supabase.from('clients').select('id, name, phone').order('name'),
      supabase.from('profiles').select('id, full_name').eq('is_active', true).order('full_name'),
      supabase.from('system_settings').select('key, value'),
    ]);

    if (policiesRes.error) {
      toast.error('خطأ في تحميل الوثائق: ' + policiesRes.error.message);
    } else if (policiesRes.data) {
      setPolicies(policiesRes.data as unknown as Policy[]);
    }
    if (clientsRes.data) setClients(clientsRes.data);
    if (agentsRes.data) setAgents(agentsRes.data);
    if (settingsRes.data) {
      const mapped: Record<string, unknown[]> = {};
      settingsRes.data.forEach(s => { mapped[s.key] = s.value as unknown[]; });
      setProducts((mapped.insurance_products as string[]) || []);
      setCompanies((mapped.insurance_companies as string[]) || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    // Validation
    if (!formData.client_id) { toast.error('يجب اختيار العميل'); return; }
    if (!formData.product) { toast.error('يجب اختيار المنتج'); return; }
    if (!formData.insurance_company) { toast.error('يجب اختيار شركة التأمين'); return; }
    if (!formData.policy_number.trim()) { toast.error('رقم الوثيقة مطلوب'); return; }
    if (!formData.issue_date) { toast.error('تاريخ الإصدار مطلوب'); return; }
    if (!formData.start_date) { toast.error('تاريخ السريان مطلوب'); return; }

    const coverageAmount = Number(formData.coverage_amount);
    const annualPremium = Number(formData.annual_premium);

    if (isNaN(coverageAmount) || coverageAmount <= 0) {
      toast.error('مبلغ التأمين يجب أن يكون رقماً أكبر من صفر');
      return;
    }
    if (isNaN(annualPremium) || annualPremium <= 0) {
      toast.error('القسط السنوي يجب أن يكون رقماً أكبر من صفر');
      return;
    }
    if (annualPremium > coverageAmount) {
      toast.error('القسط السنوي لا يجب أن يتجاوز مبلغ التأمين');
      return;
    }

    setSubmitting(true);

    const payload = {
      policy_number: formData.policy_number.trim(),
      client_id: formData.client_id,
      agent_id: formData.agent_id || profile?.id,
      product: formData.product,
      insurance_company: formData.insurance_company,
      coverage_amount: coverageAmount,
      annual_premium: annualPremium,
      issue_date: formData.issue_date,
      start_date: formData.start_date,
      status: formData.status,
      payment_frequency: formData.payment_frequency,
    };

    if (editingPolicy) {
      const { error } = await supabase
        .from('policies')
        .update({ ...payload, updated_at: new Date().toISOString() })
        .eq('id', editingPolicy.id);
      if (error) {
        if (error.code === '23505') {
          toast.error('رقم الوثيقة مستخدم بالفعل — اختر رقماً آخر');
        } else {
          toast.error('خطأ في تحديث الوثيقة: ' + error.message);
        }
        setSubmitting(false);
        return;
      }
      toast.success('✅ تم تحديث الوثيقة');
    } else {
      const { data, error } = await supabase.from('policies').insert(payload).select().single();
      if (error) {
        if (error.code === '23505') {
          toast.error('رقم الوثيقة مستخدم بالفعل — اختر رقماً آخر');
        } else if (error.code === '42501') {
          toast.error('غير مصرح بإنشاء وثيقة لهذا المندوب');
        } else {
          toast.error('خطأ في إنشاء الوثيقة: ' + error.message);
        }
        setSubmitting(false);
        return;
      }
      if (data) {
        await generateInstallments(data.id, annualPremium, formData.payment_frequency, formData.start_date);
      }
      toast.success('✅ تم إنشاء الوثيقة وجدول الأقساط');
    }

    setSubmitting(false);
    resetForm();
    loadData();
  }

  async function generateInstallments(
    policyId: string,
    annualPremium: number,
    frequency: PaymentFrequency,
    startDate: string
  ) {
    const count = getInstallmentCount(frequency);
    const amount = Math.round((annualPremium / count) * 100) / 100;
    const start = new Date(startDate);
    const monthsPerInstallment = 12 / count;

    const installments = Array.from({ length: count }, (_, i) => {
      const dueDate = new Date(start);
      dueDate.setMonth(dueDate.getMonth() + i * monthsPerInstallment);
      return {
        policy_id: policyId,
        installment_number: i + 1,
        amount,
        due_date: dueDate.toISOString().split('T')[0],
        status: 'pending' as const,
      };
    });

<<<<<<< HEAD
    const { error } = await supabase.from('installments').insert(installments);
    if (error) {
      console.error('installment insert error:', error);
      toast.error('تحذير: تم حفظ الوثيقة لكن فشل إنشاء جدول الأقساط: ' + error.message);
    }
=======
    // FIX #P1: Handle insert failure — was completely silent
    const { error: instError } = await supabase.from('installments').insert(installments);
    if (instError) toast.error('تم حفظ الوثيقة لكن فشل جدول الأقساط: ' + instError.message);
>>>>>>> 4f861908343d864f2dd8df883bdc55b699004211
  }

  async function deletePolicy(policy: Policy) {
    if (!confirm(`هل أنت متأكد من حذف الوثيقة "${policy.policy_number}"؟\nسيتم حذف الأقساط المرتبطة أيضاً.`)) return;
    const { error } = await supabase.from('policies').delete().eq('id', policy.id);
<<<<<<< HEAD
    if (error) {
      if (error.code === '23503') {
        toast.error('لا يمكن الحذف — الوثيقة بها تحصيلات مسجّلة');
      } else {
        toast.error('خطأ في حذف الوثيقة: ' + error.message);
      }
      return;
    }
=======
    // FIX #P2: Distinguish FK from other errors
    if (error) { toast.error(error.code === '23503' ? 'لا يمكن الحذف — الوثيقة بها تحصيلات مسجّلة' : 'خطأ: ' + error.message); return; }
>>>>>>> 4f861908343d864f2dd8df883bdc55b699004211
    toast.success('تم حذف الوثيقة');
    if (selectedPolicy?.id === policy.id) setSelectedPolicy(null);
    loadData();
  }

  function startEdit(policy: Policy) {
    setEditingPolicy(policy);
    setFormData({
      policy_number: policy.policy_number,
      client_id: policy.client_id,
      agent_id: policy.agent_id,
      product: policy.product,
      insurance_company: policy.insurance_company,
      coverage_amount: String(policy.coverage_amount),
      annual_premium: String(policy.annual_premium),
      issue_date: policy.issue_date,
      start_date: policy.start_date,
      status: policy.status,
      payment_frequency: policy.payment_frequency,
    });
    setShowForm(true);
  }

  function resetForm() {
    setShowForm(false);
    setEditingPolicy(null);
    setFormData({ ...EMPTY_FORM });
    setSubmitting(false);
  }

  const statusColors: Record<PolicyStatus, string> = {
    under_issuance: 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800',
    active: 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800',
    suspended: 'bg-slate-50 dark:bg-slate-700 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-600',
    cancelled: 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800',
    rejected: 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800',
  };

  const filtered = policies.filter(p => {
    const matchSearch =
      p.policy_number.toLowerCase().includes(search.toLowerCase()) ||
      (p.client as any)?.name?.includes(search) ||
      p.product.includes(search) ||
      p.insurance_company.includes(search);
    const matchStatus = statusFilter === 'all' || p.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const inputCls = "w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-900 dark:text-white placeholder-slate-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all";

  if (loading) return <LoadingSpinner />;

  return (
    <div>
      <PageHeader
        title="إدارة الوثائق"
        description={`${filtered.length} من ${policies.length} وثيقة`}
        icon={FileText}
        actions={
          <button
            onClick={() => { setEditingPolicy(null); setFormData({ ...EMPTY_FORM }); setShowForm(true); }}
            className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-medium transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">إضافة وثيقة</span>
          </button>
        }
      />

      {/* Search & Filter */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="بحث برقم الوثيقة أو اسم العميل أو المنتج..."
            className="w-full pr-10 pl-4 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white placeholder-slate-400 focus:ring-2 focus:ring-blue-500 outline-none"
          />
        </div>
        <div className="relative">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'all' | PolicyStatus)}
            className="appearance-none pr-4 pl-8 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none text-sm"
          >
            {STATUS_FILTER_OPTS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select>
          <ChevronDown className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
        </div>
      </div>

      {/* Policies List */}
      <div className="space-y-3">
        {filtered.map(policy => (
          <div
            key={policy.id}
            className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-100 dark:border-slate-700 hover:border-blue-200 dark:hover:border-blue-700 transition-colors"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <p className="font-semibold text-slate-900 dark:text-white" dir="ltr">
                    {policy.policy_number}
                  </p>
                  <span className={`px-2 py-0.5 rounded-lg text-xs font-medium ${statusColors[policy.status]}`}>
                    {POLICY_STATUS_LABELS[policy.status]}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                  <span className="font-medium text-slate-700 dark:text-slate-300">
                    {(policy.client as any)?.name || '—'}
                  </span>
                  <span>{policy.product}</span>
                  <span>{policy.insurance_company}</span>
                  <span className="flex items-center gap-1">
                    <DollarSign className="w-3 h-3" />
                    {formatCurrency(policy.annual_premium)}
                  </span>
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {formatDate(policy.start_date)}
                  </span>
                  <span>{PAYMENT_FREQUENCY_LABELS[policy.payment_frequency]}</span>
                </div>
                {/* Agent */}
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                  المندوب: {(policy.agent as any)?.full_name || '—'}
                </p>
              </div>

              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  onClick={() => setSelectedPolicy(policy)}
                  className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                  title="عرض التفاصيل"
                >
                  <Eye className="w-4 h-4 text-slate-500" />
                </button>
                <button
                  onClick={() => startEdit(policy)}
                  className="p-2 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                  title="تعديل"
                >
                  <Edit2 className="w-4 h-4 text-blue-500" />
                </button>
                <button
                  onClick={() => deletePolicy(policy)}
                  className="p-2 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                  title="حذف"
                >
                  <Trash2 className="w-4 h-4 text-red-500" />
                </button>
              </div>
            </div>
          </div>
        ))}

        {filtered.length === 0 && (
          <div className="text-center py-16">
            <FileText className="w-12 h-12 mx-auto text-slate-300 dark:text-slate-600 mb-3" />
            <p className="text-slate-400 dark:text-slate-500">
              {search ? `لا توجد نتائج لـ "${search}"` : 'لا توجد وثائق حتى الآن'}
            </p>
          </div>
        )}
      </div>

      {/* Policy Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl w-full max-w-lg max-h-[92vh] overflow-y-auto shadow-2xl">
            <div className="flex items-center justify-between p-6 border-b border-slate-100 dark:border-slate-700 sticky top-0 bg-white dark:bg-slate-800 z-10">
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                  {editingPolicy ? 'تعديل وثيقة' : 'إضافة وثيقة جديدة'}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {editingPolicy ? 'عدّل البيانات ثم اضغط تحديث' : 'أدخل بيانات الوثيقة'}
                </p>
              </div>
              <button onClick={resetForm} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg">
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Policy Number */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    رقم الوثيقة <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text" value={formData.policy_number}
                    onChange={(e) => setFormData({ ...formData, policy_number: e.target.value })}
                    required dir="ltr" placeholder="مثال: POL-2024-001"
                    className={inputCls}
                  />
                </div>

                {/* Client */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    العميل <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={formData.client_id}
                    onChange={(e) => setFormData({ ...formData, client_id: e.target.value })}
                    required className={inputCls}
                  >
                    <option value="">اختر العميل</option>
                    {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>

                {/* Product */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    المنتج <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={formData.product}
                    onChange={(e) => setFormData({ ...formData, product: e.target.value })}
                    required className={inputCls}
                  >
                    <option value="">اختر المنتج</option>
                    {products.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>

                {/* Insurance Company */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    شركة التأمين <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={formData.insurance_company}
                    onChange={(e) => setFormData({ ...formData, insurance_company: e.target.value })}
                    required className={inputCls}
                  >
                    <option value="">اختر الشركة</option>
                    {companies.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>

                {/* Coverage Amount */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    مبلغ التأمين (جنيه) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number" value={formData.coverage_amount}
                    onChange={(e) => setFormData({ ...formData, coverage_amount: e.target.value })}
                    required min="1" step="0.01" placeholder="0.00"
                    className={inputCls}
                  />
                </div>

                {/* Annual Premium */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    القسط السنوي (جنيه) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number" value={formData.annual_premium}
                    onChange={(e) => setFormData({ ...formData, annual_premium: e.target.value })}
                    required min="1" step="0.01" placeholder="0.00"
                    className={inputCls}
                  />
                </div>

                {/* Issue Date */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    تاريخ الإصدار <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date" value={formData.issue_date}
                    onChange={(e) => setFormData({ ...formData, issue_date: e.target.value })}
                    required className={inputCls}
                  />
                </div>

                {/* Start Date */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    تاريخ السريان <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date" value={formData.start_date}
                    onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                    required className={inputCls}
                  />
                </div>

                {/* Payment Frequency */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">طريقة السداد</label>
                  <select
                    value={formData.payment_frequency}
                    onChange={(e) => setFormData({ ...formData, payment_frequency: e.target.value as PaymentFrequency })}
                    className={inputCls}
                  >
                    {Object.entries(PAYMENT_FREQUENCY_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>

                {/* Status */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">الحالة</label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as PolicyStatus })}
                    className={inputCls}
                  >
                    {Object.entries(POLICY_STATUS_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>

                {/* Agent */}
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">المندوب</label>
                  <select
                    value={formData.agent_id}
                    onChange={(e) => setFormData({ ...formData, agent_id: e.target.value })}
                    className={inputCls}
                  >
                    <option value="">{profile?.full_name ?? 'أنا'} (أنا)</option>
                    {agents
                      .filter(a => a.id !== profile?.id)
                      .map(a => <option key={a.id} value={a.id}>{a.full_name}</option>)
                    }
                  </select>
                </div>
              </div>

              {/* Installments preview */}
              {!editingPolicy && formData.annual_premium && formData.payment_frequency && (
                <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl text-xs text-blue-700 dark:text-blue-400">
                  <strong>معاينة جدول الأقساط: </strong>
                  {getInstallmentCount(formData.payment_frequency)} قسط بقيمة{' '}
                  {formatCurrency(Math.round((Number(formData.annual_premium) / getInstallmentCount(formData.payment_frequency)) * 100) / 100)} كل قسط
                </div>
              )}

              <div className="flex gap-3 pt-2 border-t border-slate-100 dark:border-slate-700">
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 disabled:cursor-not-allowed text-white rounded-xl font-medium transition-colors flex items-center justify-center gap-2"
                >
                  {submitting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      جاري الحفظ...
                    </>
                  ) : (
                    editingPolicy ? '✏️ تحديث' : '✅ إنشاء الوثيقة'
                  )}
                </button>
                <button
                  type="button"
                  onClick={resetForm}
                  disabled={submitting}
                  className="flex-1 py-2.5 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-medium transition-colors disabled:opacity-50"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Policy Detail Modal */}
      {selectedPolicy && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between p-5 border-b border-slate-100 dark:border-slate-700">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">تفاصيل الوثيقة</h3>
              <button
                onClick={() => setSelectedPolicy(null)}
                className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg"
              >
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>
            <div className="p-5 space-y-3 text-sm">
              {[
                { label: 'رقم الوثيقة', value: selectedPolicy.policy_number, dir: 'ltr' as const },
                { label: 'العميل', value: (selectedPolicy.client as any)?.name },
                { label: 'المنتج', value: selectedPolicy.product },
                { label: 'شركة التأمين', value: selectedPolicy.insurance_company },
                { label: 'الحالة', value: POLICY_STATUS_LABELS[selectedPolicy.status] },
                { label: 'مبلغ التأمين', value: formatCurrency(selectedPolicy.coverage_amount) },
                { label: 'القسط السنوي', value: formatCurrency(selectedPolicy.annual_premium) },
                { label: 'تاريخ الإصدار', value: formatDate(selectedPolicy.issue_date) },
                { label: 'تاريخ السريان', value: formatDate(selectedPolicy.start_date) },
                { label: 'طريقة السداد', value: PAYMENT_FREQUENCY_LABELS[selectedPolicy.payment_frequency] },
                { label: 'المندوب', value: (selectedPolicy.agent as any)?.full_name },
              ].map(({ label, value, dir }) => (
                <div key={label} className="flex justify-between items-center py-1.5 border-b border-slate-50 dark:border-slate-700/50 last:border-0">
                  <span className="text-slate-500 dark:text-slate-400">{label}</span>
                  <span className="font-medium text-slate-900 dark:text-white" dir={dir}>{value || '—'}</span>
                </div>
              ))}
            </div>
            <div className="p-5 border-t border-slate-100 dark:border-slate-700 flex gap-2">
              <button
                onClick={() => { setSelectedPolicy(null); startEdit(selectedPolicy); }}
                className="flex-1 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700"
              >
                تعديل
              </button>
              <button
                onClick={() => setSelectedPolicy(null)}
                className="flex-1 py-2 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-sm font-medium"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
