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
  policy_number: '', client_id: '', agent_id: '', branch_id: '', product_id: '', product: '',
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
  const [clients, setClients] = useState<{ id: string; name: string; phone: string; branch_id?: string }[]>([]);
  const [agents, setAgents] = useState<{ id: string; full_name: string; active_branch_id?: string }[]>([]);
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
    // ✅ للمسؤولين: جلب جميع البيانات بدون قائدة
    const [policiesRes, clientsRes, agentsRes, branchesRes, settingsRes] = await Promise.all([
      supabase
        .from('policies')
        .select('*, client:clients(name, phone), agent:profiles!policies_agent_id_fkey(full_name), branch:branches(name), product_data:products(name)')
        .order('created_at', { ascending: false }),
      supabase.from('clients').select('id, name, phone, branch_id').order('name'),
      supabase.from('profiles').select('id, full_name, active_branch_id').eq('is_active', true).order('full_name'),
      supabase.from('branches').select('id, name').eq('is_active', true).order('name'),
      supabase.from('system_settings').select('key, value'),
    ]);

    if (policiesRes.error) {
      toast.error('خطأ في تحميل الوثائق: ' + policiesRes.error.message);
    } else if (policiesRes.data) {
      setPolicies(policiesRes.data as unknown as Policy[]);
    }
    if (clientsRes.data) setClients(clientsRes.data);
    if (agentsRes.data) setAgents(agentsRes.data);
    if (branchesRes.data) setBranches(branchesRes.data);
    if (settingsRes.data) {
      const mapped: Record<string, unknown[]> = {};
      settingsRes.data.forEach(s => { mapped[s.key] = s.value as unknown[]; });
      setProducts((mapped.insurance_products as string[]) || []);
    }
    setLoading(false);
  }, [profile]);

  useEffect(() => { loadData(); }, [loadData, profile]);

  // ✅ الوصول الكامل للمسؤولين: لا تطبيق أي قيود
  // Auto-populate branch when agent is selected
  const handleAgentChange = (agentId: string) => {
    const agent = agents.find(a => a.id === agentId);
    if (agent?.active_branch_id) {
      setFormData(prev => ({
        ...prev,
        agent_id: agentId,
        branch_id: agent.active_branch_id || '',
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        agent_id: agentId,
      }));
    }
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    // Validation
    if (!formData.client_id) { toast.error('يجب اختيار العميل'); return; }
    if (!formData.product) { toast.error('يجب اختيار المنتج'); return; }
    if (!formData.policy_number.trim()) { toast.error('رقم الوثيقة مطلوب'); return; }
    if (!formData.issue_date) { toast.error('تاريخ الإصدار مطلوب'); return; }

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
      branch_id: formData.branch_id || null,
      product: formData.product,
      product_id: formData.product_id || null,
      coverage_amount: coverageAmount,
      annual_premium: annualPremium,
      issue_date: formData.issue_date,
      status: formData.status,
      payment_frequency: formData.payment_frequency,
      payment_method: formData.payment_method || null,
      // team_leader_id, supervisor_id, branch_manager_id will be auto-populated by trigger
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

      // Update installments if frequency or premium changed
      if (editingPolicy.payment_frequency !== formData.payment_frequency || editingPolicy.annual_premium !== annualPremium) {
        await updateInstallments(editingPolicy.id, annualPremium, formData.payment_frequency, editingPolicy.issue_date);
      }

      toast.success('✅ تم تحديث الوثيقة والأقساط');
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
        await generateInstallments(data.id, annualPremium, formData.payment_frequency, formData.issue_date);
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
    if (error) {
      console.error('installment insert error:', error);
      toast.error('تحذير: تم حفظ الوثيقة لكن فشل إنشاء جدول الأقساط: ' + error.message);
    }
  }

  async function updateInstallments(
    policyId: string,
    annualPremium: number,
    frequency: PaymentFrequency,
    startDate: string
  ) {
    // 1. Get existing installments and collections
    const { data: existingInstallments } = await supabase
      .from('installments')
      .select('*, collections(*)')
      .eq('policy_id', policyId)
      .order('installment_number', { ascending: true });

    if (!existingInstallments) return;

    // 2. Identify paid installments
    const paidInstallments = existingInstallments.filter(i => i.status === 'paid' || (i.collections && i.collections.length > 0));
    const totalCollected = paidInstallments.reduce((sum, i) => sum + Number(i.amount), 0);

    // 3. Calculate remaining amount and remaining installments
    const remainingPremium = annualPremium - totalCollected;
    const totalCount = getInstallmentCount(frequency);
    
    // 4. Delete non-paid installments
    const nonPaidIds = existingInstallments.filter(i => !paidInstallments.find(p => p.id === i.id)).map(i => i.id);
    if (nonPaidIds.length > 0) {
      await supabase.from('installments').delete().in('id', nonPaidIds);
    }

    // 5. Generate new installments for the remaining amount
    const paidCount = paidInstallments.length;
    
    if (remainingPremium > 0) {
      const remainingCount = Math.max(0, totalCount - paidCount);

      if (remainingCount > 0) {
        const amountPerRemaining = Math.round((remainingPremium / remainingCount) * 100) / 100;
        const monthsPerInstallment = 12 / totalCount;

        const newInstallments = Array.from({ length: remainingCount }, (_, i) => {
          const installmentIndex = paidCount + i;
          const dueDate = new Date(startDate);
          dueDate.setMonth(dueDate.getMonth() + installmentIndex * monthsPerInstallment);
          
          return {
            policy_id: policyId,
            installment_number: installmentIndex + 1,
            amount: amountPerRemaining,
            due_date: dueDate.toISOString().split('T')[0],
            status: 'pending' as const,
          };
        });

        const { error } = await supabase.from('installments').insert(newInstallments);
        if (error) {
          console.error('New installments insert error:', error);
          toast.error('فشل تحديث جدول الأقساط الجديد: ' + error.message);
        }
      }
    }
  }

  async function deletePolicy(policy: Policy) {
    if (!confirm(`هل أنت متأكد من حذف الوثيقة "${policy.policy_number}"؟\nسيتم حذف الأقساط المرتبطة أيضاً.`)) return;
    const { error } = await supabase.from('policies').delete().eq('id', policy.id);
    if (error) {
      if (error.code === '23503') {
        toast.error('لا يمكن الحذف — الوثيقة بها تحصيلات مسجّلة');
      } else {
        toast.error('خطأ في حذف الوثيقة: ' + error.message);
      }
      return;
    }
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
      branch_id: policy.branch_id || '',
      product: policy.product,
      product_id: policy.product_id || '',
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
      (p.client as unknown as { name: string })?.name?.includes(search) ||
      p.product.includes(search);
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
            className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            وثيقة جديدة
          </button>
        }
      />

      {/* Search & Filter */}
      <div className="mb-6 flex flex-col sm:flex-row gap-4">
        <div className="flex-1 relative">
          <Search className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text" placeholder="ابحث عن رقم وثيقة أو عميل أو منتج..." value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={`${inputCls} pl-4 pr-10`}
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as 'all' | PolicyStatus)}
          className={inputCls}
        >
          {STATUS_FILTER_OPTS.map(opt => (
            <option key={opt.key} value={opt.key}>{opt.label}</option>
          ))}
        </select>
      </div>

      {/* Policies Table */}
      {filtered.length === 0 ? (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-12 text-center">
          <FileText className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-4" />
          <p className="text-slate-500 dark:text-slate-400">لا توجد وثائق تطابق معايير البحث</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900">
                  <th className="px-6 py-4 text-right text-sm font-semibold text-slate-900 dark:text-white">رقم الوثيقة</th>
                  <th className="px-6 py-4 text-right text-sm font-semibold text-slate-900 dark:text-white">العميل</th>
                  <th className="px-6 py-4 text-right text-sm font-semibold text-slate-900 dark:text-white">المنتج</th>
                  <th className="px-6 py-4 text-right text-sm font-semibold text-slate-900 dark:text-white">القسط السنوي</th>
                  <th className="px-6 py-4 text-right text-sm font-semibold text-slate-900 dark:text-white">تاريخ الإصدار</th>
                  <th className="px-6 py-4 text-right text-sm font-semibold text-slate-900 dark:text-white">الحالة</th>
                  <th className="px-6 py-4 text-right text-sm font-semibold text-slate-900 dark:text-white">الإجراء</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                {filtered.map(policy => (
                  <tr key={policy.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                    <td className="px-6 py-4 text-sm font-medium text-slate-900 dark:text-white">{policy.policy_number}</td>
                    <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-300">{(policy.client as unknown as { name: string })?.name}</td>
                    <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-300">{policy.product}</td>
                    <td className="px-6 py-4 text-sm font-semibold text-slate-900 dark:text-white">{formatCurrency(policy.annual_premium)}</td>
                    <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-300">{formatDate(policy.issue_date)}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${statusColors[policy.status]}`}>
                        {POLICY_STATUS_LABELS[policy.status]}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setSelectedPolicy(policy)}
                          className="p-2 hover:bg-blue-50 dark:hover:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-lg transition-colors"
                          title="عرض التفاصيل"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => startEdit(policy)}
                          className="p-2 hover:bg-amber-50 dark:hover:bg-amber-900/20 text-amber-600 dark:text-amber-400 rounded-lg transition-colors"
                          title="تعديل"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => deletePolicy(policy)}
                          className="p-2 hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg transition-colors"
                          title="حذف"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl w-full max-w-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-700 sticky top-0 bg-white dark:bg-slate-800">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                {editingPolicy ? 'تعديل الوثيقة' : 'وثيقة جديدة'}
              </h2>
              <button
                onClick={resetForm}
                className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg"
              >
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Policy Number */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    رقم الوثيقة <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text" value={formData.policy_number}
                    onChange={(e) => setFormData({ ...formData, policy_number: e.target.value })}
                    required placeholder="مثال: POL-2024-001"
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

                {/* Agent */}
                {profile?.role !== 'agent' && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                      الأيجنت <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={formData.agent_id}
                      onChange={(e) => handleAgentChange(e.target.value)}
                      className={inputCls}
                    >
                      <option value="">{profile?.full_name ?? 'أنا'} (أنا)</option>
                      {agents
                        .filter(a => a.id !== profile?.id)
                        .map(a => <option key={a.id} value={a.id}>{a.full_name}</option>)
                      }
                    </select>
                  </div>
                )}

                {/* Branch (auto-populated from agent) */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    الفرع
                  </label>
                  <select
                    value={formData.branch_id}
                    onChange={(e) => setFormData({ ...formData, branch_id: e.target.value })}
                    className={inputCls}
                  >
                    <option value="">اختر الفرع</option>
                    {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">يتم تحديده تلقائياً من الأيجنت إذا كان مرتبطاً بفرع واحد</p>
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

                {/* Payment Method */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">طريقة الدفع</label>
                  <input
                    type="text" value={formData.payment_method}
                    onChange={(e) => setFormData({ ...formData, payment_method: e.target.value })}
                    placeholder="مثال: تحويل بنكي، نقداً"
                    className={inputCls}
                  />
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
                { label: 'العميل', value: (selectedPolicy.client as unknown as { name: string })?.name },
                { label: 'المنتج', value: selectedPolicy.product },
                { label: 'الحالة', value: POLICY_STATUS_LABELS[selectedPolicy.status] },
                { label: 'مبلغ التأمين', value: formatCurrency(selectedPolicy.coverage_amount) },
                { label: 'القسط السنوي', value: formatCurrency(selectedPolicy.annual_premium) },
                { label: 'تاريخ الإصدار', value: formatDate(selectedPolicy.issue_date) },
                { label: 'طريقة السداد', value: PAYMENT_FREQUENCY_LABELS[selectedPolicy.payment_frequency] },
                { label: 'المندوب', value: (selectedPolicy.agent as unknown as { full_name: string })?.full_name },
                { label: 'الفرع', value: (selectedPolicy.branch as unknown as { name: string })?.name || '—' },
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
