import { useEffect, useState } from 'react';
import { supabase, type Policy, type Client, type PolicyType, PAYMENT_METHOD_LABELS } from '../lib/supabase';
import { useAuthContext } from '../contexts/AuthContext';
import type { PageProps } from '../types';
import {
  FileText, Plus, Pencil, Trash2, X, Check, Search, Eye,
  UserCircle, Calendar, DollarSign, Shield, ChevronDown, ChevronUp,
} from 'lucide-react';

export default function PoliciesPage({ showSuccess, showError }: PageProps) {
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [policyTypes, setPolicyTypes] = useState<PolicyType[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showDetails, setShowDetails] = useState<Policy | null>(null);
  const [editingPolicy, setEditingPolicy] = useState<Policy | null>(null);
  const [search, setSearch] = useState('');
  const [expandedPolicy, setExpandedPolicy] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    policy_number: '', client_id: '', policy_type_id: '', issue_date: '', start_date: '',
    duration_years: 1, payment_method: 'annual' as 'annual' | 'semi_annual' | 'quarterly' | 'monthly',
    annual_premium: 0, periodic_premium: 0, sum_insured: 0,
  });

  const { user: currentUser } = useAuthContext();
  
  useEffect(() => { if (currentUser) { fetchPolicies(); fetchClients(); fetchPolicyTypes(); } }, [currentUser]);

  const fetchPolicies = async () => {
    setLoading(true);
    if (!currentUser) return;
    
    const { getAccessibleUserIds } = await import('../lib/permissions');
    const accessibleIds = await getAccessibleUserIds(currentUser);
    
    let query = supabase
      .from('policies')
      .select('*, clients(full_name), policy_types(name), agent:users!policies_agent_id_fkey(full_name), group_leader:users!policies_group_leader_id_fkey(full_name), supervisor:users!policies_supervisor_id_fkey(full_name)')
      .order('created_at', { ascending: false });
    
    if (accessibleIds.length > 0) {
      query = query.in('agent_id', accessibleIds);
    }
    
    const { data } = await query;
    setPolicies((data as unknown as Policy[]) || []);
    setLoading(false);
  };

  const fetchClients = async () => {
    if (!currentUser) return;
    
    const { getAccessibleUserIds } = await import('../lib/permissions');
    const accessibleIds = await getAccessibleUserIds(currentUser);
    
    let query = supabase.from('clients').select('*').order('full_name');
    if (accessibleIds.length > 0) {
      query = query.in('agent_id', accessibleIds);
    }
    
    const { data } = await query;
    setClients((data as Client[]) || []);
  };

  const fetchPolicyTypes = async () => {
    const { data } = await supabase.from('policy_types').select('*').eq('is_active', true).order('name');
    setPolicyTypes((data as PolicyType[]) || []);
  };

  const getClientData = (clientId: string) => clients.find((c) => c.id === clientId);

  const calculatePeriodicPremium = () => {
    const annual = Number(formData.annual_premium) || 0;
    switch (formData.payment_method) {
      case 'annual': return annual;
      case 'semi_annual': return annual / 2;
      case 'quarterly': return annual / 4;
      case 'monthly': return annual / 12;
      default: return annual;
    }
  };

  // ملاحظة هامة: لا تقم بإدخال الأقساط يدويًا هنا. توليد الأقساط يتم تلقائيًا
  // عبر Trigger في قاعدة البيانات (trigger_generate_installments على جدول policies،
  // migration 004_functions_triggers.sql). أي محاولة إدخال يدوي إضافي من الواجهة
  // ستتعارض مع قيد UNIQUE(policy_id, installment_number) وتفشل بخطأ "duplicate key"
  // فور إنشاء كل وثيقة، رغم أن الوثيقة والأقساط الصحيحة قد حُفظت بالفعل من الـ Trigger.
  // تم حذف الدالة المكررة بعد رصد هذا الخطأ في اختبار دورة عمل الوكيل.

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const clientData = getClientData(formData.client_id);
      if (!clientData) { showError('العميل غير موجود'); return; }

      const periodic = calculatePeriodicPremium();
      const payload = {
        policy_number: formData.policy_number,
        client_id: formData.client_id,
        agent_id: clientData.agent_id,
        group_leader_id: clientData.group_leader_id,
        supervisor_id: clientData.supervisor_id,
        policy_type_id: formData.policy_type_id,
        issue_date: formData.issue_date,
        start_date: formData.start_date,
        duration_years: Number(formData.duration_years),
        payment_method: formData.payment_method,
        annual_premium: Number(formData.annual_premium),
        periodic_premium: periodic,
        sum_insured: Number(formData.sum_insured),
      };

      if (editingPolicy) {
        const { error } = await supabase.from('policies').update(payload).eq('id', editingPolicy.id);
        if (error) throw error;
        showSuccess('تم تحديث الوثيقة بنجاح');
      } else {
        const { error } = await supabase.from('policies').insert(payload);
        if (error) throw error;
        // الأقساط تُنشأ تلقائيًا من Trigger في قاعدة البيانات (لا حاجة لإدخال يدوي هنا)
        showSuccess('تم إنشاء الوثيقة والأقساط بنجاح');
      }
      closeForm();
      fetchPolicies();
    } catch (err: unknown) { showError(err instanceof Error ? err.message : 'حدث خطأ'); }
  };

  const closeForm = () => {
    setShowForm(false); setEditingPolicy(null);
    setFormData({ policy_number: '', client_id: '', policy_type_id: '', issue_date: '', start_date: '', duration_years: 1, payment_method: 'annual', annual_premium: 0, periodic_premium: 0, sum_insured: 0 });
  };

  const handleEdit = (p: Policy) => {
    setEditingPolicy(p);
    setFormData({ policy_number: p.policy_number, client_id: p.client_id, policy_type_id: p.policy_type_id, issue_date: p.issue_date, start_date: p.start_date, duration_years: p.duration_years, payment_method: p.payment_method, annual_premium: p.annual_premium, periodic_premium: p.periodic_premium, sum_insured: p.sum_insured });
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('هل أنت متأكد من حذف هذه الوثيقة؟ سيتم حذف جميع الأقساط المرتبطة بها.')) return;
    const { error } = await supabase.from('policies').delete().eq('id', id);
    if (error) { showError(error.message); return; }
    showSuccess('تم حذف الوثيقة بنجاح'); fetchPolicies();
  };

  const filteredPolicies = policies.filter((p) =>
    p.policy_number.toLowerCase().includes(search.toLowerCase()) ||
    (p as unknown as { clients?: { full_name: string } }).clients?.full_name?.toLowerCase().includes(search.toLowerCase())
  );

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active': return <span className="badge badge-info">نشط</span>;
      case 'paid': return <span className="badge badge-success">مدفوع</span>;
      case 'cancelled': return <span className="badge badge-danger">ملغى</span>;
      case 'expired': return <span className="badge badge-secondary">منتهي</span>;
      default: return <span className="badge badge-secondary">{status}</span>;
    }
  };

  return (
    <div className="space-y-5">
      <div className="page-header flex items-center justify-between">
        <div>
          <h2 className="page-title">الوثائق</h2>
          <p className="page-subtitle">إدارة وثائق التأمين</p>
        </div>
        <button onClick={() => { setShowForm(true); setEditingPolicy(null); }} className="btn-primary">
          <Plus className="w-5 h-5" />
          <span className="hidden sm:inline">وثيقة جديدة</span>
        </button>
      </div>

      <div className="search-bar">
        <Search className="search-bar-icon" />
        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث برقم الوثيقة أو اسم العميل..." className="input-field" />
      </div>

      {/* Form Drawer */}
      {showForm && (
        <>
          <div className="bottom-sheet-overlay" onClick={closeForm} />
          <div className="bottom-sheet p-5 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-lg font-extrabold text-slate-900">{editingPolicy ? 'تعديل وثيقة' : 'وثيقة جديدة'}</h3>
              <button onClick={closeForm} className="btn-icon"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4 pb-8">
              <div>
                <label className="label">رقم الوثيقة *</label>
                <input value={formData.policy_number} onChange={(e) => setFormData({ ...formData, policy_number: e.target.value })} className="input-field" required />
              </div>
              <div>
                <label className="label">العميل *</label>
                <select value={formData.client_id} onChange={(e) => setFormData({ ...formData, client_id: e.target.value })} className="input-field" required>
                  <option value="">اختر العميل</option>
                  {clients.map((c) => <option key={c.id} value={c.id}>{c.full_name}</option>)}
                </select>
              </div>
              <div>
                <label className="label">نوع الوثيقة *</label>
                <select value={formData.policy_type_id} onChange={(e) => setFormData({ ...formData, policy_type_id: e.target.value })} className="input-field" required>
                  <option value="">اختر النوع</option>
                  {policyTypes.map((pt) => <option key={pt.id} value={pt.id}>{pt.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">تاريخ الإصدار *</label>
                  <input type="date" value={formData.issue_date} onChange={(e) => setFormData({ ...formData, issue_date: e.target.value })} className="input-field" required />
                </div>
                <div>
                  <label className="label">تاريخ بدء السريان *</label>
                  <input type="date" value={formData.start_date} onChange={(e) => setFormData({ ...formData, start_date: e.target.value })} className="input-field" required />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">المدة (سنوات) *</label>
                  <input type="number" min={1} max={30} value={formData.duration_years} onChange={(e) => setFormData({ ...formData, duration_years: Number(e.target.value) })} className="input-field" required />
                </div>
                <div>
                  <label className="label">طريقة السداد *</label>
                  <select value={formData.payment_method} onChange={(e) => setFormData({ ...formData, payment_method: e.target.value as typeof formData.payment_method })} className="input-field" required>
                    <option value="annual">سنوي</option>
                    <option value="semi_annual">نصف سنوي</option>
                    <option value="quarterly">ربع سنوي</option>
                    <option value="monthly">شهري</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">القسط السنوي *</label>
                  <input type="number" min={0} step="0.01" value={formData.annual_premium} onChange={(e) => setFormData({ ...formData, annual_premium: Number(e.target.value) })} className="input-field" required />
                </div>
                <div>
                  <label className="label">القسط الدوري</label>
                  <input type="number" value={calculatePeriodicPremium().toFixed(2)} className="input-field bg-slate-50 text-slate-500" readOnly />
                </div>
              </div>
              <div>
                <label className="label">مبلغ التأمين *</label>
                <input type="number" min={0} step="0.01" value={formData.sum_insured} onChange={(e) => setFormData({ ...formData, sum_insured: Number(e.target.value) })} className="input-field" required />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={closeForm} className="btn-secondary flex-1">إلغاء</button>
                <button type="submit" className="btn-primary flex-1"><Check className="w-5 h-5" /> {editingPolicy ? 'حفظ' : 'إنشاء'}</button>
              </div>
            </form>
          </div>
        </>
      )}

      {/* Details Drawer */}
      {showDetails && (
        <>
          <div className="bottom-sheet-overlay" onClick={() => setShowDetails(null)} />
          <div className="bottom-sheet p-5 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-lg font-extrabold text-slate-900">تفاصيل الوثيقة</h3>
              <button onClick={() => setShowDetails(null)} className="btn-icon"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-3 pb-8">
              <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-2xl">
                <div className="w-12 h-12 bg-emerald-100 rounded-2xl flex items-center justify-center">
                  <Shield className="w-6 h-6 text-emerald-600" />
                </div>
                <div>
                  <p className="font-extrabold text-slate-900">{showDetails.policy_number}</p>
                  <p className="text-xs text-slate-500">{(showDetails as unknown as { policy_types?: { name: string } }).policy_types?.name || '-'}</p>
                </div>
                <div className="mr-auto">{getStatusBadge(showDetails.status)}</div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-slate-50 rounded-xl">
                  <span className="text-xs text-slate-500 block mb-1">العميل</span>
                  <span className="text-sm font-bold text-slate-900">{(showDetails as unknown as { clients?: { full_name: string } }).clients?.full_name || '-'}</span>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl">
                  <span className="text-xs text-slate-500 block mb-1">الوكيل</span>
                  <span className="text-sm font-bold text-slate-900">{(showDetails as unknown as { agent?: { full_name: string } }).agent?.full_name || '-'}</span>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl">
                  <span className="text-xs text-slate-500 block mb-1">القسط السنوي</span>
                  <span className="text-sm font-bold text-emerald-700">{showDetails.annual_premium.toLocaleString()}</span>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl">
                  <span className="text-xs text-slate-500 block mb-1">مبلغ التأمين</span>
                  <span className="text-sm font-bold text-slate-900">{showDetails.sum_insured.toLocaleString()}</span>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl">
                  <span className="text-xs text-slate-500 block mb-1">تاريخ الإصدار</span>
                  <span className="text-sm font-bold text-slate-900">{showDetails.issue_date}</span>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl">
                  <span className="text-xs text-slate-500 block mb-1">تاريخ البدء</span>
                  <span className="text-sm font-bold text-slate-900">{showDetails.start_date}</span>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Policy Cards */}
      {loading ? (
        <div className="flex items-center justify-center py-20"><div className="animate-spin w-10 h-10 border-3 border-emerald-600 border-t-transparent rounded-full" /></div>
      ) : filteredPolicies.length === 0 ? (
        <div className="empty-state">
          <FileText className="empty-state-icon" />
          <p className="text-sm">لا توجد وثائق</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredPolicies.map((p) => {
            const isExpanded = expandedPolicy === p.id;
            const clientName = (p as unknown as { clients?: { full_name: string } }).clients?.full_name || '-';
            const typeName = (p as unknown as { policy_types?: { name: string } }).policy_types?.name || '-';
            const agentName = (p as unknown as { agent?: { full_name: string } }).agent?.full_name || '-';
            return (
              <div key={p.id} className="card-hover">
                <div className="flex items-start gap-3">
                  <div className="w-12 h-12 bg-emerald-100 rounded-2xl flex items-center justify-center shrink-0">
                    <FileText className="w-6 h-6 text-emerald-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-slate-900 text-base">{p.policy_number}</h3>
                      {getStatusBadge(p.status)}
                    </div>
                    <p className="text-sm text-slate-500 mt-1">{clientName} · {typeName}</p>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-slate-400">
                      <span className="flex items-center gap-1"><UserCircle className="w-3 h-3" />{agentName}</span>
                      <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{PAYMENT_METHOD_LABELS[p.payment_method]}</span>
                      <span className="flex items-center gap-1"><DollarSign className="w-3 h-3" />{p.annual_premium.toLocaleString()}</span>
                    </div>
                  </div>
                  <button onClick={() => setExpandedPolicy(isExpanded ? null : p.id)} className="btn-icon">
                    {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                  </button>
                </div>
                {isExpanded && (
                  <div className="mt-3 pt-3 border-t border-slate-50 space-y-2">
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="p-2 bg-slate-50 rounded-lg"><span className="text-slate-400 block">القسط الدوري</span><span className="font-bold text-slate-800">{p.periodic_premium.toLocaleString()}</span></div>
                      <div className="p-2 bg-slate-50 rounded-lg"><span className="text-slate-400 block">مبلغ التأمين</span><span className="font-bold text-slate-800">{p.sum_insured.toLocaleString()}</span></div>
                      <div className="p-2 bg-slate-50 rounded-lg"><span className="text-slate-400 block">تاريخ الإصدار</span><span className="font-bold text-slate-800">{p.issue_date}</span></div>
                      <div className="p-2 bg-slate-50 rounded-lg"><span className="text-slate-400 block">مدة الوثيقة</span><span className="font-bold text-slate-800">{p.duration_years} سنوات</span></div>
                    </div>
                    <div className="flex items-center gap-2 pt-2">
                      <button onClick={() => setShowDetails(p)} className="action-btn-view flex-1"><Eye className="w-4 h-4" /> عرض</button>
                      <button onClick={() => handleEdit(p)} className="action-btn-edit flex-1"><Pencil className="w-4 h-4" /> تعديل</button>
                      <button onClick={() => handleDelete(p.id)} className="action-btn-delete flex-1"><Trash2 className="w-4 h-4" /> حذف</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
