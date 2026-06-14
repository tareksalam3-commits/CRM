import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Client, MARITAL_STATUS_LABELS } from '../../types';
import PageHeader from '../common/PageHeader';
import LoadingSpinner from '../common/LoadingSpinner';
import { UserCircle, Plus, Edit2, Trash2, X, Search, Phone, MapPin } from 'lucide-react';
import toast from 'react-hot-toast';

export default function ClientManagement() {
  const { profile } = useAuth();
  const [clients, setClients] = useState<Client[]>([]);
  const [agents, setAgents] = useState<{ id: string; full_name: string; role: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [search, setSearch] = useState('');

  const [formData, setFormData] = useState({
    name: '', national_id: '', phone: '', phone2: '', address: '',
    job: '', birth_date: '', marital_status: '', notes: '', agent_id: '',
  });

  useEffect(() => {
    fetchClients();
    fetchAgents();
  }, []);

  async function fetchClients() {
    const { data, error } = await supabase
      .from('clients')
      .select('*, agent:profiles!clients_agent_id_fkey(full_name)')
      .order('created_at', { ascending: false });
    if (error) {
      console.error('fetchClients error:', error);
      toast.error('خطأ في تحميل العملاء: ' + error.message);
    } else if (data) {
      setClients(data);
    }
    setLoading(false);
  }

  async function fetchAgents() {
    // FIX: فلتر على الأدوار الصحيحة — كل الأدوار مسموح لها إضافة عملاء
    // (الـ RLS تسمح بأي مستخدم مصادق عليه يضيف عميل بـ agent_id يملكه أو تابع له)
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
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    // FIX: التحقق من الحقول المطلوبة قبل الإرسال
    if (!formData.name.trim()) {
      toast.error('اسم العميل مطلوب');
      return;
    }
    if (!formData.phone.trim()) {
      toast.error('رقم الهاتف مطلوب');
      return;
    }

    // FIX: agent_id يجب أن يكون دائماً معيّناً — fallback لـ profile?.id
    const resolvedAgentId = formData.agent_id || profile?.id;
    if (!resolvedAgentId) {
      toast.error('تعذّر تحديد المندوب المسؤول');
      return;
    }

    const payload = {
      name: formData.name.trim(),
      national_id: formData.national_id.trim() || null,
      phone: formData.phone.trim(),
      phone2: formData.phone2.trim() || null,
      address: formData.address.trim() || null,
      job: formData.job.trim() || null,
      birth_date: formData.birth_date || null,
      marital_status: formData.marital_status || null,
      notes: formData.notes.trim() || null,
      agent_id: resolvedAgentId,
    };

    if (editingClient) {
      const { error } = await supabase
        .from('clients')
        .update({ ...payload, updated_at: new Date().toISOString() })
        .eq('id', editingClient.id);
      if (error) {
        console.error('update client error:', error);
        toast.error('خطأ في تحديث العميل: ' + error.message);
        return;
      }
      toast.success('تم تحديث العميل');
    } else {
      const { error } = await supabase.from('clients').insert(payload);
      if (error) {
        console.error('insert client error:', error);
        toast.error('خطأ في إضافة العميل: ' + error.message);
        return;
      }
      toast.success('تم إضافة العميل');
    }
    resetForm();
    fetchClients();
  }

  async function deleteClient(client: Client) {
    if (!confirm('هل أنت متأكد من حذف هذا العميل؟')) return;
    const { error } = await supabase.from('clients').delete().eq('id', client.id);
    if (error) {
      console.error('delete client error:', error);
      toast.error('لا يمكن حذف عميل مرتبط بوثائق');
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
    });
    setShowForm(true);
  }

  function resetForm() {
    setShowForm(false);
    setEditingClient(null);
    setFormData({
      name: '', national_id: '', phone: '', phone2: '', address: '',
      job: '', birth_date: '', marital_status: '', notes: '', agent_id: '',
    });
  }

  const filtered = clients.filter(c =>
    c.name.includes(search) ||
    c.phone.includes(search) ||
    (c.national_id || '').includes(search)
  );

  if (loading) return <LoadingSpinner />;

  return (
    <div>
      <PageHeader
        title="إدارة العملاء"
        description={`${clients.length} عميل`}
        icon={UserCircle}
        actions={
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">إضافة عميل</span>
          </button>
        }
      />

      <div className="relative mb-4">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="بحث بالاسم أو الهاتف أو الرقم القومي..."
          className="w-full pr-10 pl-4 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white placeholder-slate-400 focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div className="space-y-3">
        {filtered.map(client => (
          <div key={client.id} className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-100 dark:border-slate-700">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center">
                  <span className="text-blue-600 dark:text-blue-400 font-bold text-sm">{client.name.charAt(0)}</span>
                </div>
                <div>
                  <p className="font-medium text-slate-900 dark:text-white">{client.name}</p>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{client.phone}</span>
                    {client.address && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{client.address}</span>}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 mr-auto sm:mr-0">
                <span className="text-xs text-slate-500 dark:text-slate-400">{(client.agent as any)?.full_name}</span>
                <button onClick={() => startEdit(client)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg">
                  <Edit2 className="w-4 h-4 text-slate-500" />
                </button>
                <button onClick={() => deleteClient(client)} className="p-2 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg">
                  <Trash2 className="w-4 h-4 text-red-500" />
                </button>
              </div>
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="text-center py-12 text-slate-400">لا يوجد عملاء</div>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                {editingClient ? 'تعديل عميل' : 'إضافة عميل'}
              </h3>
              <button onClick={resetForm} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg">
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    الاسم <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                    className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">الرقم القومي</label>
                  <input
                    type="text"
                    value={formData.national_id}
                    onChange={(e) => setFormData({ ...formData, national_id: e.target.value })}
                    dir="ltr"
                    className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                  />
                </div>
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
                    className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">هاتف إضافي</label>
                  <input
                    type="tel"
                    value={formData.phone2}
                    onChange={(e) => setFormData({ ...formData, phone2: e.target.value })}
                    dir="ltr"
                    className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">الوظيفة</label>
                  <input
                    type="text"
                    value={formData.job}
                    onChange={(e) => setFormData({ ...formData, job: e.target.value })}
                    className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">العنوان</label>
                  <input
                    type="text"
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">تاريخ الميلاد</label>
                  <input
                    type="date"
                    value={formData.birth_date}
                    onChange={(e) => setFormData({ ...formData, birth_date: e.target.value })}
                    className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">الحالة الاجتماعية</label>
                  <select
                    value={formData.marital_status}
                    onChange={(e) => setFormData({ ...formData, marital_status: e.target.value })}
                    className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">غير محدد</option>
                    {Object.entries(MARITAL_STATUS_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">المندوب المسؤول</label>
                  <select
                    value={formData.agent_id}
                    onChange={(e) => setFormData({ ...formData, agent_id: e.target.value })}
                    className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                  >
                    {/* FIX: الخيار الافتراضي يُظهر اسم المستخدم الحالي وليس "أنا" المبهمة */}
                    <option value="">{profile?.full_name ?? 'أنا'}</option>
                    {agents
                      .filter(a => a.id !== profile?.id) // لا تُكرر المستخدم الحالي
                      .map(a => (
                        <option key={a.id} value={a.id}>{a.full_name}</option>
                      ))
                    }
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">ملاحظات</label>
                  <textarea
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    rows={3}
                    className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 resize-none"
                  />
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium transition-colors"
                >
                  {editingClient ? 'تحديث' : 'إضافة'}
                </button>
                <button
                  type="button"
                  onClick={resetForm}
                  className="flex-1 py-2.5 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 rounded-xl font-medium transition-colors"
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
