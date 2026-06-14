import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Profile, ROLE_LABELS, UserRole } from '../../types';
import { assignableRoles, canManageRole, isManager } from '../../lib/rbac';
import PageHeader from '../common/PageHeader';
import LoadingSpinner from '../common/LoadingSpinner';
import {
  Users, Plus, Edit2, Trash2, Ban, CheckCircle, X,
  Search, Key, ChevronDown, Shield, Phone, Mail,
} from 'lucide-react';
import toast from 'react-hot-toast';

interface FormData {
  email: string;
  password: string;
  full_name: string;
  phone: string;
  role: UserRole;
  manager_id: string;
}

const emptyForm: FormData = {
  email: '', password: '', full_name: '', phone: '',
  role: 'agent', manager_id: '',
};

export default function UserManagement() {
  const { profile } = useAuth();
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingUser, setEditingUser] = useState<Profile | null>(null);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<UserRole | ''>('');
  const [formData, setFormData] = useState<FormData>(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [resetPasswordId, setResetPasswordId] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');

  const fetchUsers = useCallback(async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('role')
      .order('full_name');
    if (!error && data) setUsers(data as Profile[]);
    setLoading(false);
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const myRole = profile?.role ?? 'agent';

  const potentialManagers = users.filter(u =>
    u.is_active && u.role !== 'agent' && u.id !== editingUser?.id
  );

  const filteredUsers = users.filter(u => {
    const matchSearch =
      u.full_name.includes(search) ||
      u.email.includes(search) ||
      (u.phone ?? '').includes(search);
    const matchRole = roleFilter === '' || u.role === roleFilter;
    return matchSearch && matchRole;
  });

  async function handleSubmit() {
    if (!formData.full_name.trim()) { toast.error('الاسم مطلوب'); return; }
    setSubmitting(true);

    if (editingUser) {
      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: formData.full_name.trim(),
          phone: formData.phone || null,
          role: formData.role,
          manager_id: formData.manager_id || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', editingUser.id);

      if (error) { toast.error('خطأ في التحديث: ' + error.message); }
      else { toast.success('تم تحديث المستخدم بنجاح'); resetForm(); fetchUsers(); }

    } else {
      if (!formData.email.trim() || !formData.password) {
        toast.error('البريد الإلكتروني وكلمة المرور مطلوبان');
        setSubmitting(false);
        return;
      }
      if (formData.password.length < 6) {
        toast.error('كلمة المرور يجب أن تكون 6 أحرف على الأقل');
        setSubmitting(false);
        return;
      }

      const { data, error } = await supabase.rpc('create_user_by_manager', {
        p_email: formData.email.trim(),
        p_password: formData.password,
        p_full_name: formData.full_name.trim(),
        p_phone: formData.phone || '',
        p_role: formData.role,
        p_manager_id: formData.manager_id || null,
      });

      if (error || data?.error) {
        toast.error(data?.error || error?.message || 'خطأ في إنشاء الحساب');
      } else {
        toast.success('تم إنشاء المستخدم بنجاح');
        resetForm();
        fetchUsers();
      }
    }

    setSubmitting(false);
  }

  async function toggleActive(user: Profile) {
    if (user.id === profile?.id) { toast.error('لا يمكنك تعطيل حسابك'); return; }
    const { error } = await supabase
      .from('profiles')
      .update({ is_active: !user.is_active, updated_at: new Date().toISOString() })
      .eq('id', user.id);
    if (!error) {
      toast.success(user.is_active ? 'تم إيقاف المستخدم' : 'تم تفعيل المستخدم');
      fetchUsers();
    } else {
      toast.error('خطأ: ' + error.message);
    }
  }

  async function deleteUser(user: Profile) {
    if (user.id === profile?.id) { toast.error('لا يمكنك حذف حسابك'); return; }
    if (!confirm(`هل أنت متأكد من حذف "${user.full_name}"؟`)) return;

    const { data, error } = await supabase.rpc('delete_user_by_manager', {
      p_user_id: user.id,
    });

    if (error || data?.error) {
      toast.error(data?.error || error?.message || 'خطأ في الحذف');
    } else {
      toast.success('تم حذف المستخدم');
      fetchUsers();
    }
  }

  async function handleResetPassword() {
    if (!newPassword || newPassword.length < 6) {
      toast.error('كلمة المرور يجب أن تكون 6 أحرف على الأقل');
      return;
    }

    const { data, error } = await supabase.rpc('reset_user_password_by_manager', {
      p_user_id: resetPasswordId,
      p_new_password: newPassword,
    });

    if (error || data?.error) {
      toast.error(data?.error || error?.message || 'خطأ في تغيير كلمة المرور');
    } else {
      toast.success('تم تغيير كلمة المرور بنجاح');
      setResetPasswordId(null);
      setNewPassword('');
    }
  }

  function resetForm() {
    setShowForm(false);
    setEditingUser(null);
    setFormData(emptyForm);
  }

  function startEdit(user: Profile) {
    setEditingUser(user);
    setFormData({
      email: user.email,
      password: '',
      full_name: user.full_name,
      phone: user.phone || '',
      role: user.role,
      manager_id: user.manager_id || '',
    });
    setShowForm(true);
  }

  if (!profile || !isManager(profile.role)) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-400">
        <Shield className="w-12 h-12 mb-3 opacity-30" />
        <p className="text-lg font-medium">غير مصرح بالوصول</p>
        <p className="text-sm mt-1">هذه الصفحة للمديرين فقط</p>
      </div>
    );
  }

  if (loading) return <LoadingSpinner />;

  const allowedRoles = assignableRoles(myRole);

  const roleBadge: Record<UserRole, string> = {
    super_admin: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
    dev_manager: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300',
    general_supervisor: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
    supervisor: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300',
    team_leader: 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300',
    agent: 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300',
  };

  return (
    <div>
      <PageHeader
        title="إدارة المستخدمين"
        description={`${users.length} مستخدم`}
        icon={Users}
        actions={
          <button
            onClick={() => { setEditingUser(null); setFormData(emptyForm); setShowForm(true); }}
            className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-medium transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">إضافة مستخدم</span>
          </button>
        }
      />

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="بحث بالاسم أو الإيميل أو الهاتف..."
            className="w-full pr-9 pl-4 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white placeholder-slate-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
          />
        </div>
        <div className="relative">
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value as UserRole | '')}
            className="appearance-none pr-4 pl-8 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 text-sm"
          >
            <option value="">كل الأدوار</option>
            {(Object.keys(ROLE_LABELS) as UserRole[]).map(r => (
              <option key={r} value={r}>{ROLE_LABELS[r]}</option>
            ))}
          </select>
          <ChevronDown className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
        </div>
      </div>

      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mb-4">
        {(Object.keys(ROLE_LABELS) as UserRole[]).map(r => {
          const count = users.filter(u => u.role === r).length;
          return (
            <div key={r} className="bg-white dark:bg-slate-800 rounded-xl p-3 border border-slate-100 dark:border-slate-700 text-center">
              <p className="text-lg font-bold text-slate-900 dark:text-white">{count}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{ROLE_LABELS[r]}</p>
            </div>
          );
        })}
      </div>

      <div className="space-y-2">
        {filteredUsers.map(user => {
          const managerProfile = user.manager_id ? users.find(u => u.id === user.manager_id) : null;
          const canEdit = myRole === 'super_admin' || canManageRole(myRole, user.role);
          const subordinateCount = users.filter(u => u.manager_id === user.id).length;
          const badgeClass = roleBadge[user.role] ?? 'bg-slate-100 text-slate-700';

          return (
            <div key={user.id} className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-100 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${user.is_active ? 'bg-blue-100 dark:bg-blue-900/40' : 'bg-slate-100 dark:bg-slate-700'}`}>
                  <span className={`font-bold text-sm ${user.is_active ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400'}`}>
                    {user.full_name.charAt(0)}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-slate-900 dark:text-white truncate">{user.full_name}</p>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${badgeClass}`}>
                      {ROLE_LABELS[user.role] ?? user.role}
                    </span>
                    {!user.is_active && (
                      <span className="px-2 py-0.5 bg-red-100 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-full text-xs">معطل</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 text-xs text-slate-500 dark:text-slate-400 flex-wrap">
                    <span className="flex items-center gap-1" dir="ltr"><Mail className="w-3 h-3" />{user.email}</span>
                    {user.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{user.phone}</span>}
                    {managerProfile && <span>المدير: {managerProfile.full_name}</span>}
                    {subordinateCount > 0 && <span>{subordinateCount} مرؤوس</span>}
                  </div>
                </div>
              </div>

              {canEdit && (
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button onClick={() => startEdit(user)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors" title="تعديل">
                    <Edit2 className="w-4 h-4 text-slate-500" />
                  </button>
                  <button onClick={() => { setResetPasswordId(user.id); setNewPassword(''); }} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors" title="إعادة تعيين كلمة المرور">
                    <Key className="w-4 h-4 text-amber-500" />
                  </button>
                  <button onClick={() => toggleActive(user)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors" title={user.is_active ? 'إيقاف' : 'تفعيل'}>
                    {user.is_active ? <Ban className="w-4 h-4 text-orange-500" /> : <CheckCircle className="w-4 h-4 text-emerald-500" />}
                  </button>
                  {myRole === 'super_admin' && (
                    <button onClick={() => deleteUser(user)} className="p-2 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors" title="حذف">
                      <Trash2 className="w-4 h-4 text-red-500" />
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {filteredUsers.length === 0 && (
          <div className="text-center py-16 text-slate-400">
            <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>لا توجد نتائج</p>
          </div>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl w-full max-w-md max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-slate-100 dark:border-slate-700">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                {editingUser ? 'تعديل مستخدم' : 'إضافة مستخدم جديد'}
              </h3>
              <button onClick={resetForm} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg">
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">الاسم الكامل *</label>
                <input type="text" value={formData.full_name} onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                  className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>

              {!editingUser && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">البريد الإلكتروني *</label>
                    <input type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} dir="ltr"
                      className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">كلمة المرور *</label>
                    <input type="password" value={formData.password} onChange={(e) => setFormData({ ...formData, password: e.target.value })} dir="ltr"
                      placeholder="6 أحرف على الأقل"
                      className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none" />
                  </div>
                </>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">الهاتف</label>
                <input type="tel" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} dir="ltr"
                  className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">الوظيفة</label>
                <select value={formData.role} onChange={(e) => setFormData({ ...formData, role: e.target.value as UserRole, manager_id: '' })}
                  className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none">
                  {allowedRoles.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">المدير المباشر</label>
                <select value={formData.manager_id} onChange={(e) => setFormData({ ...formData, manager_id: e.target.value })}
                  className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none">
                  <option value="">بدون مدير مباشر</option>
                  {potentialManagers.map(m => <option key={m.id} value={m.id}>{m.full_name} — {ROLE_LABELS[m.role]}</option>)}
                </select>
              </div>

              <div className="flex gap-3 pt-2">
                <button onClick={handleSubmit} disabled={submitting}
                  className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl font-medium transition-colors">
                  {submitting ? 'جاري الحفظ...' : editingUser ? 'تحديث' : 'إنشاء'}
                </button>
                <button onClick={resetForm}
                  className="flex-1 py-2.5 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 rounded-xl font-medium transition-colors">
                  إلغاء
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {resetPasswordId && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl w-full max-w-sm">
            <div className="flex items-center justify-between p-6 border-b border-slate-100 dark:border-slate-700">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">تغيير كلمة المرور</h3>
              <button onClick={() => setResetPasswordId(null)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg">
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
                placeholder="كلمة المرور الجديدة (6 أحرف على الأقل)" dir="ltr"
                className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none" />
              <div className="flex gap-3">
                <button onClick={handleResetPassword}
                  className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium transition-colors">
                  تغيير
                </button>
                <button onClick={() => setResetPasswordId(null)}
                  className="flex-1 py-2.5 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-medium transition-colors">
                  إلغاء
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}