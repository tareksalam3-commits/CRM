import { useEffect, useState } from 'react';
import { supabase, type Client, type User, resolveHierarchy, ROLE_LABELS, type UserRole } from '../lib/supabase';
import { useAuthContext } from '../contexts/AuthContext';
import type { PageProps } from '../types';
import {
  Users, Plus, Pencil, Trash2, X, Check, Search, Phone, Mail,
  ArrowRightLeft, UserCircle, Calendar, MapPin, CreditCard,
} from 'lucide-react';

export default function ClientsPage({ showSuccess, showError }: PageProps) {
  const { user: currentUser } = useAuthContext();
  const isAgent = currentUser?.role === 'agent';
  const [clients, setClients] = useState<Client[]>([]);
  const [agents, setAgents] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);
  const [transferClient, setTransferClient] = useState<Client | null>(null);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [search, setSearch] = useState('');
  const [formData, setFormData] = useState({
    full_name: '', phone: '', email: '', id_number: '', address: '', date_of_birth: '', agent_id: isAgent ? currentUser!.id : '',
  });

  useEffect(() => { if (currentUser) { fetchClients(); fetchAgents(); } }, [currentUser]);

  const fetchClients = async () => {
    setLoading(true);
    if (!currentUser) return;
    
    const { getAccessibleUserIds } = await import('../lib/permissions');
    const accessibleIds = await getAccessibleUserIds(currentUser);
    
    let query = supabase.from('clients').select('*, users!clients_agent_id_fkey(full_name)').order('created_at', { ascending: false });
    if (accessibleIds.length > 0) {
      query = query.in('agent_id', accessibleIds);
    }
    
    const { data } = await query;
    setClients((data as unknown as Client[]) || []);
    setLoading(false);
  };

  const fetchAgents = async () => {
    if (!currentUser) return;

    const { getAccessibleUserIds } = await import('../lib/permissions');
    const accessibleIds = await getAccessibleUserIds(currentUser);
    
    if (accessibleIds.length === 0) {
      setAgents([]);
      return;
    }

    const { data } = await supabase
      .from('users')
      .select('*')
      .in('id', accessibleIds)
      .eq('is_active', true)
      .order('full_name');
    
    setAgents((data as User[]) || []);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const hierarchy = formData.agent_id ? await resolveHierarchy(formData.agent_id) : null;
      const payload = {
        ...formData, date_of_birth: formData.date_of_birth || null,
        group_leader_id: hierarchy?.group_leader_id || null,
        supervisor_id: hierarchy?.supervisor_id || null,
        general_supervisor_id: hierarchy?.general_supervisor_id || null,
        dev_manager_id: hierarchy?.dev_manager_id || null,
      };
      if (editingClient) {
        const { error } = await supabase.from('clients').update(payload).eq('id', editingClient.id);
        if (error) throw error;
        showSuccess('تم تحديث بيانات العميل بنجاح');
      } else {
        const { error } = await supabase.from('clients').insert(payload);
        if (error) throw error;
        showSuccess('تم إضافة العميل بنجاح');
      }
      closeForm();
      fetchClients();
    } catch (err: unknown) { showError(err instanceof Error ? err.message : 'حدث خطأ'); }
  };

  const closeForm = () => {
    setShowForm(false); setEditingClient(null);
    setFormData({ full_name: '', phone: '', email: '', id_number: '', address: '', date_of_birth: '', agent_id: isAgent ? currentUser!.id : '' });
  };

  const handleEdit = (c: Client) => {
    setEditingClient(c);
    setFormData({ full_name: c.full_name, phone: c.phone || '', email: c.email || '', id_number: c.id_number || '', address: c.address || '', date_of_birth: c.date_of_birth || '', agent_id: c.agent_id });
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('هل أنت متأكد من حذف هذا العميل؟')) return;
    const { error } = await supabase.from('clients').delete().eq('id', id);
    if (error) { showError(error.message); return; }
    showSuccess('تم حذف العميل بنجاح'); fetchClients();
  };

  const openTransfer = (c: Client) => { setTransferClient(c); setShowTransfer(true); };

  const handleTransfer = async (newAgentId: string) => {
    if (!transferClient) return;
    try {
      const hierarchy = await resolveHierarchy(newAgentId);
      const { error: clientError } = await supabase.from('clients').update({
        agent_id: newAgentId, group_leader_id: hierarchy.group_leader_id, supervisor_id: hierarchy.supervisor_id,
        general_supervisor_id: hierarchy.general_supervisor_id, dev_manager_id: hierarchy.dev_manager_id,
      }).eq('id', transferClient.id);
      if (clientError) throw clientError;
      const { error: policyError } = await supabase.from('policies').update({
        agent_id: newAgentId, group_leader_id: hierarchy.group_leader_id, supervisor_id: hierarchy.supervisor_id,
      }).eq('client_id', transferClient.id);
      if (policyError) throw policyError;
      showSuccess('تم نقل العميل وتحديث جميع الوثائق بنجاح');
      setShowTransfer(false); setTransferClient(null); fetchClients();
    } catch (err: unknown) { showError(err instanceof Error ? err.message : 'حدث خطأ'); }
  };

  const filteredClients = clients.filter((c) =>
    c.full_name.toLowerCase().includes(search.toLowerCase()) || (c.phone && c.phone.includes(search)) || (c.email && c.email.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="space-y-5">
      <div className="page-header flex items-center justify-between">
        <div>
          <h2 className="page-title">العملاء</h2>
          <p className="page-subtitle">إدارة بيانات العملاء</p>
        </div>
        <button onClick={() => { setShowForm(true); setEditingClient(null); setFormData({ full_name: '', phone: '', email: '', id_number: '', address: '', date_of_birth: '', agent_id: isAgent ? currentUser!.id : '' }); }} className="btn-primary">
          <Plus className="w-5 h-5" />
          <span className="hidden sm:inline">عميل جديد</span>
        </button>
      </div>

      <div className="search-bar">
        <Search className="search-bar-icon" />
        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث عن عميل..." className="input-field" />
      </div>

      {/* Form Drawer */}
      {showForm && (
        <>
          <div className="bottom-sheet-overlay" onClick={closeForm} />
          <div className="bottom-sheet p-5 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-lg font-extrabold text-slate-900">{editingClient ? 'تعديل عميل' : 'عميل جديد'}</h3>
              <button onClick={closeForm} className="btn-icon"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4 pb-8">
              <div>
                <label className="label">الاسم الكامل *</label>
                <input value={formData.full_name} onChange={(e) => setFormData({ ...formData, full_name: e.target.value })} className="input-field" required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">رقم الهاتف</label>
                  <input value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} className="input-field" dir="ltr" />
                </div>
                <div>
                  <label className="label">رقم البطاقة</label>
                  <input value={formData.id_number} onChange={(e) => setFormData({ ...formData, id_number: e.target.value })} className="input-field" />
                </div>
              </div>
              <div>
                <label className="label">البريد الإلكتروني</label>
                <input type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} className="input-field" dir="ltr" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">تاريخ الميلاد</label>
                  <input type="date" value={formData.date_of_birth} onChange={(e) => setFormData({ ...formData, date_of_birth: e.target.value })} className="input-field" />
                </div>
                <div>
                  <label className="label">الشخص المسؤول (الوكيل) *</label>
                  {isAgent ? (
                    <input value={currentUser?.full_name || ''} className="input-field bg-slate-50 text-slate-500" readOnly disabled />
                  ) : (
                    <select value={formData.agent_id} onChange={(e) => setFormData({ ...formData, agent_id: e.target.value })} className="input-field" required>
                      <option value="">اختر الشخص المسؤول</option>
                      {agents.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.full_name} ({ROLE_LABELS[a.role as UserRole] || a.role})
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>
              <div>
                <label className="label">العنوان</label>
                <input value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} className="input-field" />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={closeForm} className="btn-secondary flex-1">إلغاء</button>
                <button type="submit" className="btn-primary flex-1"><Check className="w-5 h-5" /> {editingClient ? 'حفظ' : 'إنشاء'}</button>
              </div>
            </form>
          </div>
        </>
      )}

      {/* Transfer Drawer */}
      {showTransfer && transferClient && (
        <>
          <div className="bottom-sheet-overlay" onClick={() => setShowTransfer(false)} />
          <div className="bottom-sheet p-5 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-lg font-extrabold text-slate-900">نقل العميل</h3>
              <button onClick={() => setShowTransfer(false)} className="btn-icon"><X className="w-5 h-5" /></button>
            </div>
            <p className="text-sm text-slate-500">سيتم تحديث الهيكل الإداري وجميع الوثائق المرتبطة بهذا العميل.</p>
            <div>
              <label className="label">الوكيل الجديد *</label>
              <select className="input-field" onChange={(e) => handleTransfer(e.target.value)} defaultValue="">
                <option value="" disabled>اختر الوكيل الجديد</option>
                {agents.filter((a) => a.id !== transferClient.agent_id).map((a) => <option key={a.id} value={a.id}>{a.full_name}</option>)}
              </select>
            </div>
          </div>
        </>
      )}

      {/* Client List */}
      {loading ? (
        <div className="flex items-center justify-center py-20"><div className="animate-spin w-10 h-10 border-3 border-emerald-600 border-t-transparent rounded-full" /></div>
      ) : filteredClients.length === 0 ? (
        <div className="empty-state">
          <Users className="empty-state-icon" />
          <p className="text-sm">لا يوجد عملاء</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredClients.map((c) => (
            <div key={c.id} className="card-hover">
              <div className="flex items-start gap-3">
                <div className="w-12 h-12 bg-emerald-100 rounded-2xl flex items-center justify-center shrink-0">
                  <UserCircle className="w-6 h-6 text-emerald-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-slate-900 text-base">{c.full_name}</h3>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5 text-xs text-slate-500">
                    {c.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{c.phone}</span>}
                    {c.email && <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{c.email}</span>}
                    {c.id_number && <span className="flex items-center gap-1"><CreditCard className="w-3 h-3" />{c.id_number}</span>}
                    {c.date_of_birth && <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{new Date(c.date_of_birth).toLocaleDateString('ar-EG')}</span>}
                    {c.address && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{c.address}</span>}
                  </div>
                  <div className="mt-2">
                    <span className="chip bg-emerald-50 text-emerald-700">{(c as unknown as { users?: { full_name: string } }).users?.full_name || '-'}</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 mt-4 pt-3 border-t border-slate-50">
                <button onClick={() => handleEdit(c)} className="action-btn-edit flex-1"><Pencil className="w-4 h-4" /> تعديل</button>
                <button onClick={() => openTransfer(c)} className="action-btn-transfer flex-1"><ArrowRightLeft className="w-4 h-4" /> نقل</button>
                <button onClick={() => handleDelete(c.id)} className="action-btn-delete flex-1"><Trash2 className="w-4 h-4" /> حذف</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
