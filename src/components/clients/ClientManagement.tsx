import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
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
  const { profile } = useAuth();
  const [clients, setClients] = useState<Client[]>([]);
  const [agents, setAgents] = useState<{ id: string; full_name: string; role: string }[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_branches, _setBranches] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'mine'>('all');

  const [formData, setFormData] = useState({ ...EMPTY_FORM });

  const fetchClients = useCallback(async () => {
    const query = supabase
      .from('clients')
      .select('*, agent:profiles!clients_agent_id_fkey(full_name, role)')
      .order('created_at', { ascending: false });
    
    const { data, error } = await query;
    if (error) {
      console.error('fetchClients error:', error);
      toast.error('خطأ في تحميل العملاء: ' + error.message);
    } else if (data) {
      setClients(data as Client[]);
    }
    setLoading(false);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchAgents = useCallback(async () => {
    // ✅ للمسؤولين: جلب جميع المندوبين بدون قائدة
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, role')
      .eq('is_active', true)
      .order('full_name');
    if (error) {
      console.error('fetchAgents error:', error);
    } else if (data) {
      setAgents(data);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchBranches = useCallback(async () => {
    const { data, error } = await supabase
      .from('branches')
      .select('id, name')
      .eq('is_active', true)
      .order('name');
    if (error) {
      console.error('fetchBranches error:', error);
    } else if (data) {
      _setBranches(data);
    }
  }, []);

  useEffect(() => {
    fetchClients();
    fetchAgents();
    fetchBranches();
  }, [fetchClients, fetchAgents, fetchBranches]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    // Client-side validation
    if (!formData.name.trim()) { toast.error('اسم العميل مطلوب'); return; }
    if (!formData.phone.trim()) { toast.error('رقم الهاتف مطلوب'); return; }

    // Phone format check (Egyptian numbers)
    const phoneClean = formData.phone.trim().replace(/\s/g, '');
    if (!/^(01[0-9]{9}|0[2-9][0-9]{7,8}|\+20[0-9]{9,10})$/.test(phoneClean)) {
      // Non-blocking warning only — don't prevent save
      console.warn('Phone format may be invalid:', phoneClean);
    }

    // Resolve agent_id: use selected or fallback to current user
    const resolvedAgentId = formData.agent_id || profile?.id;
    if (!resolvedAgentId) {
      toast.error('تعذّر تحديد المندوب المسؤول — يرجى تسجيل الدخول مرة أخرى');
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
      branch_id: formData.branch_id || null,
    };

    if (editingClient) {
      const { error } = await supabase
        .from('clients')
        .update({ ...payload, updated_at: new Date().toISOString() })
        .eq('id', editingClient.id);
      if (error) {
        console.error('update client error:', error);
        if (error.code === '42501') {
          toast.error('غير مصرح بتعديل هذا العميل');
        } else {
          toast.error('خطأ في تحديث العميل: ' + error.message);
        }
        setSubmitting(false);
        return;
      }
      toast.success('✅ تم تحديث بيانات العميل');
    } else {
      const { error } = await supabase.from('clients').insert(payload);
      if (error) {
        console.error('insert client error:', error);
        if (error.code === '42501') {
          toast.error('غير مصرح بإضافة عميل — تحقق من إعدادات الصلاحيات');
        } else if (error.code === '23505') {
          toast.error('رقم قومي مسجّل مسبقاً لعميل آخر');
        } else {
          toast.error('خطأ في إضافة العميل: ' + error.message);
        }
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
    if (!confirm(`هل أنت متأكد من حذف العميل "${client.name}"؟\nلا يمكن التراجع عن هذا الإجراء.`)) return;
    const { error } = await supabase.from('clients').delete().eq('id', client.id);
    if (error) {
      console.error('delete client error:', error);
      if (error.code === '23503') {
        toast.error('لا يمكن حذف عميل مرتبط بوثائق — ألغِ الوثائق أولاً');
      } else {
        toast.error('خطأ في حذف العميل: ' + error.message);
      }
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

  // Filter clients
  const filtered = clients.filter(c => {
    const matchSearch =
      c.name.includes(search) ||
      c.phone.includes(search) ||
      (c.national_id || '').includes(search) ||
      (c.address || '').includes(search) ||
      (c.job || '').includes(search);
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

      {/* Search & Filter Row */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="بحث بالاسم أو الهاتف أو الرقم القومي أو العنوان..."
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

      {/* Clients List */}
      <div className="space-y-3">
        {filtered.map(client => (
          <div
            key={client.id}
            className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-100 dark:border-slate-700 hover:border-blue-200 dark:hover:border-blue-700 transition-colors"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                {/* Avatar */}
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
                    {client.phone2 && (
                      <span className="flex items-center gap-1">
                        <Phone className="w-3 h-3 text-slate-300" />
                        <span dir="ltr">{client.phone2}</span>
                      </span>
                    )}
                    {client.address && (
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3 h-3" />
                        {client.address}
                      </span>
                    )}
                    {client.job && (
                      <span className="flex items-center gap-1">
                        <User className="w-3 h-3" />
                        {client.job}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 mr-auto sm:mr-0">
                {/* Agent badge */}
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

            {/* Notes preview */}
            {client.notes && (
              <p className="mt-2 text-xs text-slate-400 dark:text-slate-500 italic border-t border-slate-50 dark:border-slate-700 pt-2 line-clamp-2">
                {client.notes}
              </p>
            )}
          </div>
        ))}

        {filtered.length === 0 && (
          <div className="text-center py-16">
            <UserCircle className="w-12 h-12 mx-auto text-slate-300 dark:text-slate-600 mb-3" />
            <p className="text-slate-400 dark:text-slate-500">
              {search ? `لا توجد نتائج لـ "${search}"` : 'لا يوجد عملاء حتى الآن'}
            </p>
            {!search && (
              <button
                onClick={() => { setFormData({ ...EMPTY_FORM }); setShowForm(true); }}
                className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700"
              >
                إضافة أول عميل
              </button>
            )}
          </div>
        )}
      </div>

      {/* Add/Edit Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl w-full max-w-lg max-h-[92vh] overflow-y-auto shadow-2xl">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-6 border-b border-slate-100 dark:border-slate-700 sticky top-0 bg-white dark:bg-slate-800 z-10">
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                  {editingClient ? 'تعديل بيانات العميل' : 'إضافة عميل جديد'}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {editingClient ? 'عدّل البيانات ثم اضغط تحديث' : 'أدخل بيانات العميل الجديد'}
                </p>
              </div>
              <button
                onClick={resetForm}
                className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Name */}
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    الاسم <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                    placeholder="الاسم الكامل"
                    className={inputCls}
                  />
                </div>

                {/* National ID */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">الرقم القومي</label>
                  <input
                    type="text"
                    value={formData.national_id}
                    onChange={(e) => setFormData({ ...formData, national_id: e.target.value })}
                    dir="ltr"
                    maxLength={14}
                    placeholder="14 رقم"
                    className={inputCls}
                  />
                </div>

                {/* Phone */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    الهاتف <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    required
                    dir="ltr"
                    placeholder="01XXXXXXXXX"
                    className={inputCls}
                  />
                </div>

                {/* Phone 2 */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">هاتف إضافي</label>
                  <input
                    type="tel"
                    value={formData.phone2}
                    onChange={(e) => setFormData({ ...formData, phone2: e.target.value })}
                    dir="ltr"
                    placeholder="اختياري"
                    className={inputCls}
                  />
                </div>

                {/* Job */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">الوظيفة</label>
                  <input
                    type="text"
                    value={formData.job}
                    onChange={(e) => setFormData({ ...formData, job: e.target.value })}
                    placeholder="مثل: موظف حكومي"
                    className={inputCls}
                  />
                </div>

                {/* Birth Date */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">تاريخ الميلاد</label>
                  <input
                    type="date"
                    value={formData.birth_date}
                    onChange={(e) => setFormData({ ...formData, birth_date: e.target.value })}
                    max={new Date().toISOString().split('T')[0]}
                    className={inputCls}
                  />
                </div>

                {/* Address */}
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">العنوان</label>
                  <input
                    type="text"
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    placeholder="المحافظة / المدينة / الشارع"
                    className={inputCls}
                  />
                </div>

                {/* Marital Status */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">الحالة الاجتماعية</label>
                  <select
                    value={formData.marital_status}
                    onChange={(e) => setFormData({ ...formData, marital_status: e.target.value })}
                    className={inputCls}
                  >
                    <option value="">غير محدد</option>
                    {Object.entries(MARITAL_STATUS_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>

                {/* Agent */}
                {profile?.role !== 'agent' && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">المندوب المسؤول</label>
                    <select
                      value={formData.agent_id}
                      onChange={(e) => setFormData({ ...formData, agent_id: e.target.value })}
                      className={inputCls}
                    >
                      <option value="">{profile?.full_name ?? 'أنا'} (أنا)</option>
                      {agents
                        .filter(a => a.id !== profile?.id)
                        .map(a => (
                          <option key={a.id} value={a.id}>{a.full_name}</option>
                        ))
                      }
                    </select>
                  </div>
                )}

                {/* Notes */}
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">ملاحظات</label>
                  <textarea
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    rows={3}
                    placeholder="أي ملاحظات إضافية عن العميل..."
                    className={`${inputCls} resize-none`}
                  />
                </div>
              </div>

              {/* Action Buttons */}
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
                    editingClient ? '✏️ تحديث' : '✅ إضافة'
                  )}
                </button>
                <button
                  type="button"
                  onClick={resetForm}
                  disabled={submitting}
                  className="flex-1 py-2.5 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 rounded-xl font-medium transition-colors disabled:opacity-50"
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
