import { useEffect, useState } from 'react';
import { supabase, type User, type UserRole, ROLE_LABELS, canManageRole } from '../lib/supabase';
import { useAuthContext } from '../contexts/AuthContext';
import type { PageProps } from '../types';
import { Users, Plus, Pencil, Trash2, X, Check, Search, UserCircle, Mail, Shield, Phone, UserCheck } from 'lucide-react';

export default function UsersPage({ showSuccess, showError }: PageProps) {
  const { user: currentUser } = useAuthContext();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [search, setSearch] = useState('');
  const [formData, setFormData] = useState({
    full_name: '',
    email: '',
    role: 'agent' as UserRole,
    manager_id: '',
    phone: '',
    password: '',
  });

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    setLoading(true);
    const { data } = await supabase.from('users').select('*').order('created_at', { ascending: false });
    setUsers((data as User[]) || []);
    setLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingUser) {
        const { error } = await supabase
          .from('users')
          .update({
            full_name: formData.full_name,
            role: formData.role,
            manager_id: formData.manager_id || null,
            phone: formData.phone,
          })
          .eq('id', editingUser.id);
        if (error) throw error;
        showSuccess('تم تحديث المستخدم بنجاح');
      } else {
        const { data: authData, error: authError } = await supabase.auth.signUp({
          email: formData.email,
          password: formData.password,
        });
        if (authError) throw authError;
        if (authData.user) {
          const { error } = await supabase.from('users').insert({
            auth_id: authData.user.id,
            email: formData.email,
            full_name: formData.full_name,
            role: formData.role,
            manager_id: formData.manager_id || null,
            phone: formData.phone,
          });
          if (error) throw error;
        }
        showSuccess('تم إنشاء المستخدم بنجاح');
      }
      setShowForm(false);
      setEditingUser(null);
      setFormData({ full_name: '', email: '', role: 'agent', manager_id: '', phone: '', password: '' });
      fetchUsers();
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : 'حدث خطأ');
    }
  };

  const handleEdit = (u: User) => {
    setEditingUser(u);
    setFormData({
      full_name: u.full_name,
      email: u.email,
      role: u.role,
      manager_id: u.manager_id || '',
      phone: u.phone || '',
      password: '',
    });
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('هل أنت متأكد من حذف هذا المستخدم؟')) return;
    try {
      const { error } = await supabase.from('users').delete().eq('id', id);
      if (error) throw error;
      showSuccess('تم حذف المستخدم بنجاح');
      fetchUsers();
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : 'حدث خطأ');
    }
  };

  const filteredUsers = users.filter((u) =>
    u.full_name.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase())
  );

  const availableManagers = users.filter((u) =>
    currentUser && canManageRole(currentUser.role as UserRole, u.role as UserRole) && u.id !== editingUser?.id
  );

  const getManagerName = (managerId: string | null) => {
    if (!managerId) return null;
    return users.find((m) => m.id === managerId)?.full_name || null;
  };

  return (
    <div className="space-y-5">
      {/* Page Header */}
      <div className="page-header flex items-center justify-between">
        <div>
          <h2 className="page-title">المستخدمين</h2>
          <p className="page-subtitle">إدارة المستخدمين والهيكل الإداري</p>
        </div>
        <button
          onClick={() => { setShowForm(true); setEditingUser(null); setFormData({ full_name: '', email: '', role: 'agent', manager_id: '', phone: '', password: '' }); }}
          className="btn-primary hidden sm:inline-flex"
        >
          <Plus className="w-5 h-5" />
          مستخدم جديد
        </button>
      </div>

      {/* Search */}
      <div className="search-bar">
        <Search className="search-bar-icon" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="بحث عن مستخدم..."
          className="input-field"
        />
      </div>

      {/* Mobile Cards */}
      <div className="sm:hidden space-y-3">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin w-8 h-8 border-2 border-emerald-600 border-t-transparent rounded-full" />
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="empty-state">
            <Users className="empty-state-icon" />
            <p>لا يوجد مستخدمين</p>
          </div>
        ) : (
          filteredUsers.map((u) => (
            <div key={u.id} className="card-hover">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center shrink-0">
                  <UserCircle className="w-5 h-5 text-emerald-700" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-slate-900 truncate">{u.full_name}</p>
                  <p className="text-xs text-slate-500 truncate" dir="ltr">{u.email}</p>
                </div>
                <span className={`badge ${u.is_active ? 'badge-success' : 'badge-secondary'}`}>
                  {u.is_active ? 'نشط' : 'معطل'}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm mb-3">
                <div className="flex items-center gap-1.5 text-slate-600">
                  <Shield className="w-3.5 h-3.5 text-slate-400" />
                  {ROLE_LABELS[u.role as UserRole]}
                </div>
                <div className="flex items-center gap-1.5 text-slate-600">
                  <UserCheck className="w-3.5 h-3.5 text-slate-400" />
                  {getManagerName(u.manager_id) || 'بدون'}
                </div>
                {u.phone && (
                  <div className="flex items-center gap-1.5 text-slate-600 col-span-2">
                    <Phone className="w-3.5 h-3.5 text-slate-400" />
                    {u.phone}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 pt-3 border-t border-slate-100">
                <button onClick={() => handleEdit(u)} className="action-btn-edit flex-1">
                  <Pencil className="w-4 h-4" />
                  تعديل
                </button>
                <button onClick={() => handleDelete(u.id)} className="action-btn-delete flex-1">
                  <Trash2 className="w-4 h-4" />
                  حذف
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Desktop Table */}
      <div className="hidden sm:block card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin w-8 h-8 border-2 border-emerald-600 border-t-transparent rounded-full" />
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="empty-state">
            <Users className="empty-state-icon" />
            <p>لا يوجد مستخدمين</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="table-header">الاسم</th>
                  <th className="table-header">البريد الإلكتروني</th>
                  <th className="table-header">الدور</th>
                  <th className="table-header">المدير</th>
                  <th className="table-header">الحالة</th>
                  <th className="table-header">الإجراءات</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50 transition-colors">
                    <td className="table-cell font-medium">{u.full_name}</td>
                    <td className="table-cell" dir="ltr">{u.email}</td>
                    <td className="table-cell">
                      <span className="badge badge-info">{ROLE_LABELS[u.role as UserRole]}</span>
                    </td>
                    <td className="table-cell">
                      {getManagerName(u.manager_id) || '-'}
                    </td>
                    <td className="table-cell">
                      <span className={`badge ${u.is_active ? 'badge-success' : 'badge-secondary'}`}>
                        {u.is_active ? 'نشط' : 'معطل'}
                      </span>
                    </td>
                    <td className="table-cell">
                      <div className="flex items-center gap-1">
                        <button onClick={() => handleEdit(u)} className="action-btn-edit">
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleDelete(u.id)} className="action-btn-delete">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Floating Action Button (Mobile) */}
      <button
        onClick={() => { setShowForm(true); setEditingUser(null); setFormData({ full_name: '', email: '', role: 'agent', manager_id: '', phone: '', password: '' }); }}
        className="fab"
      >
        <Plus className="w-6 h-6" />
      </button>

      {/* Bottom Sheet Form (Mobile) */}
      {showForm && (
        <>
          <div className="bottom-sheet-overlay" onClick={() => setShowForm(false)} />
          <div className="bottom-sheet sm:static sm:inset-auto sm:bottom-auto sm:bg-transparent sm:shadow-none sm:rounded-none sm:z-auto sm:max-h-none sm:overflow-visible">
            <div className="p-5 sm:p-0 space-y-4">
              {/* Mobile drag handle */}
              <div className="w-12 h-1.5 bg-slate-300 rounded-full mx-auto mb-4 sm:hidden" />

              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-slate-900">{editingUser ? 'تعديل مستخدم' : 'مستخدم جديد'}</h3>
                <button onClick={() => setShowForm(false)} className="btn-icon">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="label">الاسم الكامل</label>
                  <input
                    value={formData.full_name}
                    onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                    className="input-field"
                    required
                  />
                </div>
                {!editingUser && (
                  <>
                    <div>
                      <label className="label">البريد الإلكتروني</label>
                      <input
                        type="email"
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        className="input-field"
                        dir="ltr"
                        required
                      />
                    </div>
                    <div>
                      <label className="label">كلمة المرور</label>
                      <input
                        type="password"
                        value={formData.password}
                        onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                        className="input-field"
                        dir="ltr"
                        required={!editingUser}
                      />
                    </div>
                  </>
                )}
                <div>
                  <label className="label">الدور الوظيفي</label>
                  <select
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value as UserRole })}
                    className="input-field"
                  >
                    {Object.entries(ROLE_LABELS).map(([key, label]) => (
                      <option key={key} value={key}>{label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">المدير المباشر</label>
                  <select
                    value={formData.manager_id}
                    onChange={(e) => setFormData({ ...formData, manager_id: e.target.value })}
                    className="input-field"
                  >
                    <option value="">بدون مدير</option>
                    {availableManagers.map((m) => (
                      <option key={m.id} value={m.id}>{m.full_name} - {ROLE_LABELS[m.role as UserRole]}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">رقم الهاتف</label>
                  <input
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="input-field"
                  />
                </div>
                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={() => setShowForm(false)} className="btn-secondary flex-1">إلغاء</button>
                  <button type="submit" className="btn-primary flex-1">
                    <Check className="w-5 h-5" />
                    {editingUser ? 'حفظ التعديلات' : 'إنشاء مستخدم'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
