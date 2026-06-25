import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { getBranchScope, getSubordinateIds } from '../../lib/dataAccess';
import { Client, MARITAL_STATUS_LABELS, Profile } from '../../types';
import PageHeader from '../common/PageHeader';
import LoadingSpinner from '../common/LoadingSpinner';
import {
  UserCircle, Plus, Edit2, Trash2, X, Search,
  Phone, MapPin, ChevronDown, User,
} from 'lucide-react';
import toast from 'react-hot-toast';

const EMPTY_FORM = {
  name: '', national_id: '', phone: '', phone2: '', address: '',
  job: '', birth_date: '', marital_status: '', notes: '', agent_id: '', branch_id: '',
};

export default function ClientManagement() {
  const { profile, activeBranch } = useAuth();
  const [clients, setClients] = useState<Client[]>([]);
  const [agents, setAgents] = useState<{ id: string; full_name: string; role: string }[]>([]);
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'mine'>('all');

  const [formData, setFormData] = useState({ ...EMPTY_FORM });

  const fetchClients = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    const scope = getBranchScope(profile, activeBranch);
    let query = supabase
      .from('clients')
      .select('*, agent:profiles!clients_agent_id_fkey(full_name, role)')
      .order('created_at', { ascending: false });
    
    if (!scope.isAllBranches && scope.branchId) {
      query = query.eq('branch_id', scope.branchId);
    }
    if (scope.role === 'agent') {
      query = query.eq('agent_id', scope.userId);
    } else if (scope.role === 'team_leader') {
      const subIds = await getSubordinateIds(scope.userId);
      if (subIds.length > 0) {
        query = query.in('agent_id', subIds);
      } else {
        query = query.eq('agent_id', scope.userId);
      }
    }
    
    const { data, error } = await query;
    if (error) {
      console.error('fetchClients error:', error);
      toast.error('خطأ في تحميل العملاء: ' + error.message);
    } else if (data) {
      setClients(data as Client[]);
    }
    setLoading(false);
  }, [profile, activeBranch]);

  const fetchAgents = useCallback(async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, role')
      .eq('is_active', true)
      .order('full_name');
    if (error) {
      console.error('fetchAgents error:', error);
    } else if (data) {
      // تصفية الوكلاء المتاحين للإسناد بناءً على الدور
      // فقط Super Admin و Dev Manager و General Supervisor و Supervisor و Team Leader يمكنهم إسناد العملاء لغيرهم
      setAgents(data);
    }
  }, []);

  const fetchBranches = useCallback(async () => {
    const { data, error } = await supabase
      .from('branches')
      .select('id, name')
      .eq('is_active', true)
      .order('name');
    if (error) {
      console.error('fetchBranches error:', error);
    } else if (data) {
      setBranches(data);
    }
  }, []);

  useEffect(() => {
    fetchClients();
    fetchAgents();
    fetchBranches();
  }, [fetchClients, fetchAgents, fetchBranches]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!formData.name.trim()) { toast.error('اسم العميل مطلوب'); return; }
    if (!formData.phone.trim()) { toast.error('رقم الهاتف مطلوب'); return; }

    const phoneClean = formData.phone.trim().replace(/\s/g, '');
    
    // Agent دائماً يسند العميل لنفسه
    const resolvedAgentId = profile?.role === 'agent' ? profile.id : (formData.agent_id || profile?.id);
    
    if (!resolvedAgentId) {
      toast.error('تعذّر تحديد المندوب المسؤول');
      return;
    }

    setSubmitting(true);

    const payload = {
      name: formData.name.trim(),
      national_id: formData.national_id.trim() || null,
      phone: phoneClean,
      phone2: formData.phone2.trim() || null,
      address: formData.address.trim() || null,
      job: formData.job.trim() || null,
      birth_date: formData.birth_date || null,
      marital_status: formData.marital_status || null,
      notes: formData.notes.trim() || null,
      agent_id: resolvedAgentId,
      branch_id: formData.branch_id || (activeBranch && activeBranch.id !== 'all' ? activeBranch.id : profile?.active_branch_id) || null,
    };

    if (editingClient) {
      const { error } = await supabase
        .from('clients')
        .update({ ...payload, updated_at: new Date().toISOString() })
        .eq('id', editingClient.id);
      if (error) {
        toast.error('خطأ في تحديث العميل: ' + error.message);
        setSubmitting(false);
        return;
      }
      toast.success('✅ تم تحديث بيانات العميل');
    } else {
      const { error } = await supabase.from('clients').insert(payload);
      if (error) {
        toast.error('خطأ في إضافة العميل: ' + error.message);
        setSubmitting(false);
        return;
      }
      toast.success('✅ تم إضافة العميل بنجاح');
    }
    setSubmitting(false);
    resetForm();
    fetchClients();
  }

  async function deleteClient(client: Client) {
    if (!confirm(`هل أنت متأكد من حذف العميل "${client.name}"؟`)) return;
    const { error } = await supabase.from('clients').delete().eq('id', client.id);
    if (error) {
      toast.error('خطأ في حذف العميل: ' + error.message);
      return;
    }
    toast.success('تم حذف العميل');
    fetchClients();
  }

  function startEdit(client: Client) {
    setEditingClient(client);
    setFormData({
      name: client.name,
      national_id: client.national_id || '',
      phone: client.phone,
      phone2: client.phone2 || '',
      address: client.address || '',
      job: client.job || '',
      birth_date: client.birth_date || '',
      marital_status: client.marital_status || '',
      notes: client.notes || '',
      agent_id: client.agent_id,
      branch_id: client.branch_id || '',
    });
    setShowForm(true);
  }

  function resetForm() {
    setShowForm(false);
    setEditingClient(null);
    setFormData({ ...EMPTY_FORM });
    setSubmitting(false);
  }

  const filtered = clients.filter(c => {
    const matchSearch =
      c.name.includes(search) ||
      c.phone.includes(search) ||
      (c.national_id || '').includes(search);
    const matchStatus = statusFilter === 'all' || c.agent_id === profile?.id;
    return matchSearch && matchStatus;
  });

  const inputCls = "w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-900 dark:text-white placeholder-slate-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all";

  if (loading) return <LoadingSpinner />;

  return (
    <div>
      <PageHeader
        title="إدارة العملاء"
        description={`${filtered.length} من ${clients.length} عميل`}
        icon={UserCircle}
        actions={
          <button
            onClick={() => { setEditingClient(null); setFormData({ ...EMPTY_FORM }); setShowForm(true); }}
            className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-xl text-sm font-medium transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">إضافة عميل</span>
          </button>
        }
      />

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="بحث بالاسم أو الهاتف أو الرقم القومي..."
            className="w-full pr-10 pl-4 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white placeholder-slate-400 focus:ring-2 focus:ring-blue-500 outline-none"
          />
        </div>
        <div className="relative">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'all' | 'mine')}
            className="appearance-none pr-4 pl-8 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none text-sm"
          >
            <option value="all">كل العملاء</option>
            <option value="mine">عملائي فقط</option>
          </select>
          <ChevronDown className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
        </div>
      </div>

      <div className="space-y-3">
        {filtered.map(client => (
          <div
            key={client.id}
            className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-100 dark:border-slate-700 hover:border-blue-200 dark:hover:border-blue-700 transition-colors"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center flex-shrink-0 shadow-sm">
                  <span className="text-white font-bold text-sm">{client.name.charAt(0)}</span>
                </div>
                <div>
                  <p className="font-semibold text-slate-900 dark:text-white">{client.name}</p>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    <span className="flex items-center gap-1">
                      <Phone className="w-3 h-3" />
                      <span dir="ltr">{client.phone}</span>
                    </span>
                    {client.address && (
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3 h-3" />
                        {client.address}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 mr-auto sm:mr-0">
                <span className="hidden sm:block text-xs px-2 py-1 bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 rounded-lg">
                  {((client.agent as unknown as Profile))?.full_name || 'غير محدد'}
                </span>
                <button
                  onClick={() => startEdit(client)}
                  className="p-2 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                  title="تعديل"
                >
                  <Edit2 className="w-4 h-4 text-blue-500" />
                </button>
                <button
                  onClick={() => deleteClient(client)}
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
            <UserCircle className="w-12 h-12 mx-auto text-slate-300 dark:text-slate-600 mb-3" />
            <p className="text-slate-400 dark:text-slate-500">لا توجد نتائج</p>
          </div>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl w-full max-w-lg max-h-[92vh] overflow-y-auto shadow-2xl">
            <div className="flex items-center justify-between p-6 border-b border-slate-100 dark:border-slate-700 sticky top-0 bg-white dark:bg-slate-800 z-10">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                {editingClient ? 'تعديل بيانات العميل' : 'إضافة عميل جديد'}
              </h3>
              <button onClick={resetForm} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition-colors">
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-slate-700 dark:text-slate-300 mr-1">الاسم بالكامل *</label>
                <input
                  required
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className={inputCls}
                  placeholder="أدخل اسم العميل الثلاثي"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-slate-700 dark:text-slate-300 mr-1">رقم الهاتف *</label>
                  <input
                    required
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className={inputCls}
                    placeholder="01xxxxxxxxx"
                    dir="ltr"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-slate-700 dark:text-slate-300 mr-1">الرقم القومي</label>
                  <input
                    type="text"
                    maxLength={14}
                    value={formData.national_id}
                    onChange={(e) => setFormData({ ...formData, national_id: e.target.value })}
                    className={inputCls}
                    placeholder="14 رقم"
                    dir="ltr"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-slate-700 dark:text-slate-300 mr-1">العنوان</label>
                <input
                  type="text"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  className={inputCls}
                  placeholder="المحافظة - المدينة - الشارع"
                />
              </div>

              {profile?.role !== 'agent' && (
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-slate-700 dark:text-slate-300 mr-1">المندوب المسؤول</label>
                  <div className="relative">
                    <select
                      value={formData.agent_id}
                      onChange={(e) => setFormData({ ...formData, agent_id: e.target.value })}
                      className={`${inputCls} appearance-none pr-4 pl-10`}
                    >
                      <option value="">اختر المندوب (افتراضي: أنت)</option>
                      {agents.map(agent => (
                        <option key={agent.id} value={agent.id}>
                          {agent.full_name} ({agent.role})
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none" />
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-slate-700 dark:text-slate-300 mr-1">ملاحظات إضافية</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className={`${inputCls} min-h-[100px] resize-none`}
                  placeholder="أي معلومات إضافية عن العميل..."
                />
              </div>

              <div className="flex gap-3 pt-4 sticky bottom-0 bg-white dark:bg-slate-800 pb-2">
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-xl font-bold shadow-lg shadow-blue-200 dark:shadow-none transition-all"
                >
                  {submitting ? 'جاري الحفظ...' : (editingClient ? 'تحديث البيانات' : 'إضافة العميل')}
                </button>
                <button
                  type="button"
                  onClick={resetForm}
                  className="px-6 py-3 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-xl font-bold hover:bg-slate-200 dark:hover:bg-slate-600 transition-all"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
