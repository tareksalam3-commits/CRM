import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Policy, POLICY_STATUS_LABELS, PAYMENT_FREQUENCY_LABELS, PolicyStatus, PaymentFrequency } from '../../types';
import { formatCurrency, formatDate, getInstallmentCount } from '../../lib/utils';
import PageHeader from '../common/PageHeader';
import LoadingSpinner from '../common/LoadingSpinner';
import { FileText, Plus, Edit2, Trash2, X, Search, Eye } from 'lucide-react';
import toast from 'react-hot-toast';

export default function PolicyManagement() {
  const { profile } = useAuth();
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [clients, setClients] = useState<{ id: string; name: string }[]>([]);
  const [agents, setAgents] = useState<{ id: string; full_name: string; role: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingPolicy, setEditingPolicy] = useState<Policy | null>(null);
  const [search, setSearch] = useState('');
  const [selectedPolicy, setSelectedPolicy] = useState<Policy | null>(null);

  const [formData, setFormData] = useState({
    policy_number: '', client_id: '', agent_id: '', product: '', insurance_company: '',
    coverage_amount: '', annual_premium: '', issue_date: '', start_date: '',
    status: 'under_issuance' as PolicyStatus, payment_frequency: 'monthly' as PaymentFrequency,
  });

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    const [policiesRes, clientsRes, agentsRes] = await Promise.all([
      supabase.from('policies').select('*, client:clients(name), agent:profiles!policies_agent_id_fkey(full_name)').order('created_at', { ascending: false }),
      supabase.from('clients').select('id, name'),
      supabase.from('profiles').select('id, full_name, role').eq('is_active', true),
    ]);
    if (policiesRes.data) setPolicies(policiesRes.data as any);
    if (clientsRes.data) setClients(clientsRes.data);
    if (agentsRes.data) setAgents(agentsRes.data);
    setLoading(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      ...formData,
      coverage_amount: Number(formData.coverage_amount),
      annual_premium: Number(formData.annual_premium),
      agent_id: formData.agent_id || profile?.id,
    };

    if (editingPolicy) {
      const { error } = await supabase.from('policies').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', editingPolicy.id);
      if (error) { toast.error('خطأ في تحديث الوثيقة'); return; }
      toast.success('تم تحديث الوثيقة');
    } else {
      const { data, error } = await supabase.from('policies').insert(payload).select().single();
      if (error) { toast.error('خطأ في إنشاء الوثيقة'); return; }
      // Generate installments
      if (data) await generateInstallments(data.id, Number(formData.annual_premium), formData.payment_frequency, formData.start_date);
      toast.success('تم إنشاء الوثيقة وجدول الأقساط');
    }
    resetForm();
    loadData();
  }

  async function generateInstallments(policyId: string, annualPremium: number, frequency: PaymentFrequency, startDate: string) {
    const count = getInstallmentCount(frequency);
    const amount = annualPremium / count;
    const start = new Date(startDate);
    const monthsPerInstallment = 12 / count;

    const installments = Array.from({ length: count }, (_, i) => {
      const dueDate = new Date(start);
      dueDate.setMonth(dueDate.getMonth() + i * monthsPerInstallment);
      return {
        policy_id: policyId,
        installment_number: i + 1,
        amount: Math.round(amount * 100) / 100,
        due_date: dueDate.toISOString().split('T')[0],
        status: 'pending' as const,
      };
    });

    await supabase.from('installments').insert(installments);
  }

  async function deletePolicy(policy: Policy) {
    if (!confirm('هل أنت متأكد من حذف هذه الوثيقة؟')) return;
    const { error } = await supabase.from('policies').delete().eq('id', policy.id);
    if (error) { toast.error('لا يمكن حذف وثيقة مرتبطة بتحصيلات'); return; }
    toast.success('تم حذف الوثيقة');
    loadData();
  }

  function startEdit(policy: Policy) {
    setEditingPolicy(policy);
    setFormData({
      policy_number: policy.policy_number, client_id: policy.client_id, agent_id: policy.agent_id,
      product: policy.product, insurance_company: policy.insurance_company,
      coverage_amount: String(policy.coverage_amount), annual_premium: String(policy.annual_premium),
      issue_date: policy.issue_date, start_date: policy.start_date,
      status: policy.status, payment_frequency: policy.payment_frequency,
    });
    setShowForm(true);
  }

  function resetForm() {
    setShowForm(false);
    setEditingPolicy(null);
    setFormData({ policy_number: '', client_id: '', agent_id: '', product: '', insurance_company: '', coverage_amount: '', annual_premium: '', issue_date: '', start_date: '', status: 'under_issuance', payment_frequency: 'monthly' });
  }

  const statusColors: Record<PolicyStatus, string> = {
    under_issuance: 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400',
    active: 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400',
    suspended: 'bg-slate-50 dark:bg-slate-700 text-slate-600 dark:text-slate-400',
    cancelled: 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400',
    rejected: 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400',
  };

  const filtered = policies.filter(p =>
    p.policy_number.includes(search) || (p.client as any)?.name?.includes(search) || p.product.includes(search)
  );

  if (loading) return <LoadingSpinner />;

  return (
    <div>
      <PageHeader title="إدارة الوثائق" description={`${policies.length} وثيقة`} icon={FileText}
        actions={<button onClick={() => setShowForm(true)} className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-medium"><Plus className="w-4 h-4" /><span className="hidden sm:inline">إضافة وثيقة</span></button>}
      />

      <div className="relative mb-4">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث برقم الوثيقة أو اسم العميل..." className="w-full pr-10 pl-4 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white placeholder-slate-400 focus:ring-2 focus:ring-blue-500" />
      </div>

      <div className="space-y-3">
        {filtered.map(policy => (
          <div key={policy.id} className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-100 dark:border-slate-700">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <p className="font-medium text-slate-900 dark:text-white">{policy.policy_number}</p>
                  <span className={`px-2 py-0.5 rounded-lg text-xs font-medium ${statusColors[policy.status]}`}>{POLICY_STATUS_LABELS[policy.status]}</span>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                  <span>{(policy.client as any)?.name}</span>
                  <span>{policy.product}</span>
                  <span>{formatCurrency(policy.annual_premium)}</span>
                  <span>{PAYMENT_FREQUENCY_LABELS[policy.payment_frequency]}</span>
                </div>
              </div>
              <div className="flex items-center gap-2 mr-auto sm:mr-0">
                <button onClick={() => setSelectedPolicy(policy)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg"><Eye className="w-4 h-4 text-slate-500" /></button>
                <button onClick={() => startEdit(policy)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg"><Edit2 className="w-4 h-4 text-slate-500" /></button>
                <button onClick={() => deletePolicy(policy)} className="p-2 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"><Trash2 className="w-4 h-4 text-red-500" /></button>
              </div>
            </div>
          </div>
        ))}
        {filtered.length === 0 && <div className="text-center py-12 text-slate-400">لا توجد وثائق</div>}
      </div>

      {/* Policy Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">{editingPolicy ? 'تعديل وثيقة' : 'إضافة وثيقة'}</h3>
              <button onClick={resetForm} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg"><X className="w-5 h-5 text-slate-500" /></button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">رقم الوثيقة</label>
                  <input type="text" value={formData.policy_number} onChange={(e) => setFormData({ ...formData, policy_number: e.target.value })} required dir="ltr" className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">العميل</label>
                  <select value={formData.client_id} onChange={(e) => setFormData({ ...formData, client_id: e.target.value })} required className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500">
                    <option value="">اختر العميل</option>
                    {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">المنتج</label>
                  <input type="text" value={formData.product} onChange={(e) => setFormData({ ...formData, product: e.target.value })} required className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">شركة التأمين</label>
                  <input type="text" value={formData.insurance_company} onChange={(e) => setFormData({ ...formData, insurance_company: e.target.value })} required className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">مبلغ التأمين</label>
                  <input type="number" value={formData.coverage_amount} onChange={(e) => setFormData({ ...formData, coverage_amount: e.target.value })} required className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">القسط السنوي</label>
                  <input type="number" value={formData.annual_premium} onChange={(e) => setFormData({ ...formData, annual_premium: e.target.value })} required className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">تاريخ الإصدار</label>
                  <input type="date" value={formData.issue_date} onChange={(e) => setFormData({ ...formData, issue_date: e.target.value })} required className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">تاريخ السريان</label>
                  <input type="date" value={formData.start_date} onChange={(e) => setFormData({ ...formData, start_date: e.target.value })} required className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">طريقة السداد</label>
                  <select value={formData.payment_frequency} onChange={(e) => setFormData({ ...formData, payment_frequency: e.target.value as PaymentFrequency })} className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500">
                    {Object.entries(PAYMENT_FREQUENCY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">الحالة</label>
                  <select value={formData.status} onChange={(e) => setFormData({ ...formData, status: e.target.value as PolicyStatus })} className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500">
                    {Object.entries(POLICY_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">المندوب</label>
                  <select value={formData.agent_id} onChange={(e) => setFormData({ ...formData, agent_id: e.target.value })} className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500">
                    <option value="">أنا</option>
                    {agents.map(a => <option key={a.id} value={a.id}>{a.full_name}</option>)}
                  </select>
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="submit" className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium">{editingPolicy ? 'تحديث' : 'إنشاء'}</button>
                <button type="button" onClick={resetForm} className="flex-1 py-2.5 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-medium">إلغاء</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Policy Detail Modal */}
      {selectedPolicy && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">تفاصيل الوثيقة</h3>
              <button onClick={() => setSelectedPolicy(null)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg"><X className="w-5 h-5 text-slate-500" /></button>
            </div>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between"><span className="text-slate-500">رقم الوثيقة:</span><span className="text-slate-900 dark:text-white font-medium">{selectedPolicy.policy_number}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">العميل:</span><span className="text-slate-900 dark:text-white">{(selectedPolicy.client as any)?.name}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">المنتج:</span><span className="text-slate-900 dark:text-white">{selectedPolicy.product}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">الشركة:</span><span className="text-slate-900 dark:text-white">{selectedPolicy.insurance_company}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">مبلغ التأمين:</span><span className="text-slate-900 dark:text-white">{formatCurrency(selectedPolicy.coverage_amount)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">القسط السنوي:</span><span className="text-slate-900 dark:text-white">{formatCurrency(selectedPolicy.annual_premium)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">تاريخ السريان:</span><span className="text-slate-900 dark:text-white">{formatDate(selectedPolicy.start_date)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">طريقة السداد:</span><span className="text-slate-900 dark:text-white">{PAYMENT_FREQUENCY_LABELS[selectedPolicy.payment_frequency]}</span></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
