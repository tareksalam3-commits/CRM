import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Profile, ROLE_LABELS, UserRole } from '../../types';
import { assignableRoles } from '../../lib/rbac';
import {
  createUser, deleteUser as deleteUserService,
  resetUserPassword, linkUserToBranches, toggleUserStatus
} from '../../services/usersService';
import PageHeader from '../common/PageHeader';
import LoadingSpinner from '../common/LoadingSpinner';
import {
  Users, Plus, Edit2, Trash2, Ban, CheckCircle, X,
  Key, Building2, UserPlus, ShieldCheck, Search
} from 'lucide-react';
import toast from 'react-hot-toast';

interface FormData {
  email: string;
  password: string;
  full_name: string;
  phone: string;
  role: UserRole;
  manager_id: string;
  branch_id: string;
}

const emptyForm: FormData = {
  email: '',
  password: '',
  full_name: '',
  phone: '',
  role: 'agent',
  manager_id: '',
  branch_id: '',
};

const roleBadge: Record<UserRole, string> = {
  super_admin: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
  dev_manager: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  general_supervisor: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300',
  supervisor: 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300',
  team_leader: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  agent: 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300',
};

export default function UserManagement() {
  const { profile } = useAuth();
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingUser, setEditingUser] = useState<Profile | null>(null);
  const [search, setSearch] = useState('');
  const [formData, setFormData] = useState<FormData>(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [resetPasswordId, setResetPasswordId] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [branches, setBranches] = useState<any[]>([]);
  const [managers, setManagers] = useState<Profile[]>([]);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('full_name');
    if (error) {
      toast.error('خطأ في جلب المستخدمين');
    } else if (data) {
      setUsers(data as Profile[]);
      // Filter potential managers (those with roles higher than agent)
      setManagers((data as Profile[]).filter(u => u.role !== 'agent'));
    }
    setLoading(false);
  }, []);

  const fetchBranches = useCallback(async () => {
    const { data } = await supabase
      .from('branches')
      .select('*')
      .eq('is_active', true)
      .order('name');
    if (data) setBranches(data);
  }, []);

  useEffect(() => {
    fetchUsers();
    fetchBranches();
  }, [fetchUsers, fetchBranches]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (editingUser) {
        // 1. Update Profile
        const { error } = await supabase
          .from('profiles')
          .update({
            full_name: formData.full_name,
            phone: formData.phone || null,
            role: formData.role,
            manager_id: formData.manager_id || null,
            branch_id: formData.branch_id || null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', editingUser.id);

        if (error) throw error;

        // 2. Sync Branch Access
        if (formData.branch_id) {
          await linkUserToBranches(editingUser.id, [formData.branch_id]);
        }

        toast.success('تم تحديث بيانات المستخدم بنجاح');
      } else {
        // Create new user via Edge Function
        const result = await createUser(formData);
        if (result.error) throw new Error(result.error);
        toast.success('تم إنشاء المستخدم بنجاح');
      }
      resetForm();
      fetchUsers();
    } catch (err: any) {
      toast.error(err.message || 'حدث خطأ ما');
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleActive(user: Profile) {
    const result = await toggleUserStatus(user.id, !user.is_active);
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success(user.is_active ? 'تم تعطيل المستخدم' : 'تم تفعيل المستخدم');
      fetchUsers();
    }
  }

  async function handleDelete(user: Profile) {
    if (!window.confirm(`هل أنت متأكد من حذف المستخدم ${user.full_name}؟ لا يمكن التراجع عن هذه الخطوة.`)) return;
    const result = await deleteUserService(user.id);
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success('تم حذف المستخدم بنجاح');
      fetchUsers();
    }
  }

  async function handleResetPassword() {
    if (!resetPasswordId || !newPassword) {
      toast.error('يرجى إدخال كلمة المرور الجديدة');
      return;
    }
    if (newPassword.length < 6) {
      toast.error('كلمة المرور يجب أن تكون 6 أحرف على الأقل');
      return;
    }
    const result = await resetUserPassword(resetPasswordId, newPassword);
    if (result.error) {
      toast.error(result.error);
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

  const filteredUsers = users.filter(u => 
    u.full_name.toLowerCase().includes(search.toLowerCase()) || 
    u.email.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) return <LoadingSpinner />;

  return (
    <div className="p-6 space-y-6">
      <PageHeader 
        title="إدارة المستخدمين" 
        icon={Users} 
        actions={
          <button 
            onClick={() => { resetForm(); setShowForm(true); }} 
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors"
          >
            <UserPlus size={18} /> إضافة مستخدم
          </button>
        }
      />

      {/* Search and Filters */}
      <div className="bg-white dark:bg-slate-800 p-4 rounded-xl shadow-sm flex gap-4 items-center">
        <div className="relative flex-1">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input 
            type="text"
            placeholder="بحث بالاسم أو البريد الإلكتروني..."
            className="w-full pr-10 pl-4 py-2 bg-slate-50 dark:bg-slate-900 border-none rounded-lg focus:ring-2 focus:ring-blue-500"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right border-collapse">
            <thead className="bg-slate-50 dark:bg-slate-700/50 border-b border-slate-100 dark:border-slate-700">
              <tr>
                <th className="px-6 py-4 text-sm font-semibold text-slate-600 dark:text-slate-300">المستخدم</th>
                <th className="px-6 py-4 text-sm font-semibold text-slate-600 dark:text-slate-300">الدور الوظيفي</th>
                <th className="px-6 py-4 text-sm font-semibold text-slate-600 dark:text-slate-300">الفرع</th>
                <th className="px-6 py-4 text-sm font-semibold text-slate-600 dark:text-slate-300">الحالة</th>
                <th className="px-6 py-4 text-sm font-semibold text-slate-600 dark:text-slate-300 text-center">الإجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {filteredUsers.map(user => (
                <tr key={user.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-700/30 transition-colors">
                  <td className="px-6 py-4">
                    <div className="font-medium text-slate-900 dark:text-white">{user.full_name}</div>
                    <div className="text-xs text-slate-500">{user.email}</div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${roleBadge[user.role as UserRole]}`}>
                      {ROLE_LABELS[user.role as UserRole]}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-400">
                    {branches.find(b => b.id === user.branch_id)?.name || 'غير محدد'}
                  </td>
                  <td className="px-6 py-4">
                    <button 
                      onClick={() => toggleActive(user)} 
                      className={`flex items-center gap-1.5 px-2 py-1 rounded-lg transition-colors ${
                        user.is_active 
                          ? 'text-green-600 bg-green-50 dark:bg-green-900/20' 
                          : 'text-slate-400 bg-slate-50 dark:bg-slate-900/20'
                      }`}
                    >
                      {user.is_active ? <CheckCircle size={16} /> : <Ban size={16} />}
                      <span className="text-xs font-medium">{user.is_active ? 'نشط' : 'معطل'}</span>
                    </button>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex justify-center gap-2">
                      <button 
                        onClick={() => { 
                          setEditingUser(user); 
                          setFormData({ 
                            ...emptyForm, 
                            ...user, 
                            phone: user.phone || '',
                            manager_id: user.manager_id || '',
                            branch_id: user.branch_id || '',
                            password: '' 
                          }); 
                          setShowForm(true); 
                        }} 
                        className="p-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg transition-colors"
                        title="تعديل"
                      >
                        <Edit2 size={18} />
                      </button>
                      <button 
                        onClick={() => setResetPasswordId(user.id)} 
                        className="p-2 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/30 rounded-lg transition-colors"
                        title="تغيير كلمة المرور"
                      >
                        <Key size={18} />
                      </button>
                      <button 
                        onClick={() => handleDelete(user)} 
                        className="p-2 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/30 rounded-lg transition-colors"
                        title="حذف"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add/Edit User Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl w-full max-w-lg shadow-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center bg-slate-50/50 dark:bg-slate-700/50">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                {editingUser ? 'تعديل بيانات المستخدم' : 'إضافة مستخدم جديد'}
              </h3>
              <button onClick={resetForm} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300">الاسم الكامل</label>
                  <input 
                    required
                    placeholder="أدخل الاسم" 
                    className="w-full p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 transition-all" 
                    value={formData.full_name} 
                    onChange={e => setFormData({...formData, full_name: e.target.value})} 
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300">البريد الإلكتروني</label>
                  <input 
                    required
                    type="email"
                    disabled={!!editingUser} 
                    placeholder="email@example.com" 
                    className="w-full p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 transition-all disabled:opacity-50" 
                    value={formData.email} 
                    onChange={e => setFormData({...formData, email: e.target.value})} 
                  />
                </div>
                {!editingUser && (
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300">كلمة المرور</label>
                    <input 
                      required
                      type="password" 
                      placeholder="6 أحرف على الأقل" 
                      className="w-full p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 transition-all" 
                      value={formData.password} 
                      onChange={e => setFormData({...formData, password: e.target.value})} 
                    />
                  </div>
                )}
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300">رقم الهاتف</label>
                  <input 
                    placeholder="01xxxxxxxxx" 
                    className="w-full p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 transition-all" 
                    value={formData.phone} 
                    onChange={e => setFormData({...formData, phone: e.target.value})} 
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300">الدور الوظيفي</label>
                  <select 
                    className="w-full p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 transition-all" 
                    value={formData.role} 
                    onChange={e => setFormData({...formData, role: e.target.value as UserRole})}
                  >
                    {Object.entries(ROLE_LABELS).map(([role, label]) => (
                      <option key={role} value={role}>{label}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300">الفرع</label>
                  <select 
                    required
                    className="w-full p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 transition-all" 
                    value={formData.branch_id} 
                    onChange={e => setFormData({...formData, branch_id: e.target.value})}
                  >
                    <option value="">اختر الفرع</option>
                    {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5 md:col-span-2">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300">المدير المباشر</label>
                  <select 
                    className="w-full p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 transition-all" 
                    value={formData.manager_id} 
                    onChange={e => setFormData({...formData, manager_id: e.target.value})}
                  >
                    <option value="">بدون مدير</option>
                    {managers
                      .filter(m => m.id !== editingUser?.id)
                      .map(m => <option key={m.id} value={m.id}>{m.full_name} ({ROLE_LABELS[m.role as UserRole]})</option>)
                    }
                  </select>
                </div>
              </div>
              <div className="pt-4 flex gap-3">
                <button 
                  type="submit"
                  disabled={submitting} 
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-lg font-bold transition-colors disabled:opacity-50"
                >
                  {submitting ? 'جاري الحفظ...' : (editingUser ? 'تحديث البيانات' : 'إنشاء الحساب')}
                </button>
                <button 
                  type="button"
                  onClick={resetForm}
                  className="flex-1 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 py-2.5 rounded-lg font-bold transition-colors"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reset Password Modal */}
      {resetPasswordId && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl w-full max-w-md shadow-xl p-6">
            <div className="flex items-center gap-3 mb-6 text-amber-600">
              <div className="p-2 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
                <ShieldCheck size={24} />
              </div>
              <h3 className="text-lg font-bold">تغيير كلمة المرور</h3>
            </div>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">كلمة المرور الجديدة</label>
                <input 
                  type="password" 
                  placeholder="6 أحرف على الأقل" 
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 transition-all" 
                  value={newPassword} 
                  onChange={e => setNewPassword(e.target.value)} 
                />
              </div>
              <div className="flex gap-3">
                <button 
                  onClick={handleResetPassword} 
                  className="flex-1 bg-amber-600 hover:bg-amber-700 text-white py-2.5 rounded-lg font-bold transition-colors"
                >
                  تحديث
                </button>
                <button 
                  onClick={() => { setResetPasswordId(null); setNewPassword(''); }} 
                  className="flex-1 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 py-2.5 rounded-lg font-bold transition-colors"
                >
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
