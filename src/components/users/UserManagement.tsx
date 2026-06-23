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
  Key, Building2, UserPlus, Search, ChevronRight, MoreVertical
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
        if (formData.branch_id) {
          await linkUserToBranches(editingUser.id, [formData.branch_id]);
        }
        toast.success('تم تحديث بيانات المستخدم بنجاح');
      } else {
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
    <div className="space-y-8 pb-12 animate-in fade-in duration-500">
      <PageHeader 
        title="إدارة المستخدمين" 
        subtitle="إدارة حسابات الموظفين والصلاحيات والهيكل الإداري"
        icon={Users} 
        actions={
          <button 
            onClick={() => { resetForm(); setShowForm(true); }} 
            className="flex items-center gap-2 px-6 py-3 bg-primary text-white rounded-[1rem] hover:bg-primary-dark transition-all shadow-crm font-bold text-sm"
          >
            <UserPlus size={20} /> إضافة مستخدم جديد
          </button>
        }
      />

      {/* Search Bar */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-[1.5rem] border border-slate-100 dark:border-slate-800 shadow-crm">
        <div className="relative group">
          <Search className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-primary transition-colors" size={20} />
          <input 
            type="text"
            placeholder="بحث بالاسم أو البريد الإلكتروني..."
            className="w-full pr-12 pl-4 py-3.5 bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all text-sm font-bold"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-white dark:bg-slate-900 rounded-[2rem] border border-slate-100 dark:border-slate-800 shadow-crm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right border-collapse">
            <thead>
              <tr className="bg-slate-50/50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800">
                <th className="px-8 py-5 text-[11px] font-black text-slate-400 uppercase tracking-widest">المستخدم</th>
                <th className="px-6 py-5 text-[11px] font-black text-slate-400 uppercase tracking-widest">الدور الوظيفي</th>
                <th className="px-6 py-5 text-[11px] font-black text-slate-400 uppercase tracking-widest">الفرع</th>
                <th className="px-6 py-5 text-[11px] font-black text-slate-400 uppercase tracking-widest">الحالة</th>
                <th className="px-8 py-5 text-[11px] font-black text-slate-400 uppercase tracking-widest text-center">الإجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
              {filteredUsers.map(user => (
                <tr key={user.id} className="hover:bg-slate-50/30 dark:hover:bg-slate-800/20 transition-colors group">
                  <td className="px-8 py-5">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/10">
                        <span className="text-primary font-bold text-sm">{user.full_name.charAt(0)}</span>
                      </div>
                      <div>
                        <div className="font-black text-slate-900 dark:text-white text-sm">{user.full_name}</div>
                        <div className="text-xs font-bold text-slate-400">{user.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-5">
                    <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${roleBadge[user.role as UserRole]}`}>
                      {ROLE_LABELS[user.role as UserRole]}
                    </span>
                  </td>
                  <td className="px-6 py-5">
                    <div className="flex items-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-400">
                      <Building2 size={14} className="text-primary/60" />
                      {branches.find(b => b.id === user.branch_id)?.name || 'غير محدد'}
                    </div>
                  </td>
                  <td className="px-6 py-5">
                    <button 
                      onClick={() => toggleActive(user)} 
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all border ${
                        user.is_active 
                          ? 'text-success bg-success/10 border-success/20 hover:bg-success/20' 
                          : 'text-slate-400 bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      {user.is_active ? <CheckCircle size={14} /> : <Ban size={14} />}
                      <span className="text-[10px] font-black">{user.is_active ? 'نشط' : 'معطل'}</span>
                    </button>
                  </td>
                  <td className="px-8 py-5">
                    <div className="flex justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
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
                        className="p-2 text-primary hover:bg-primary/10 rounded-lg transition-colors border border-transparent hover:border-primary/20"
                        title="تعديل"
                      >
                        <Edit2 size={18} />
                      </button>
                      <button 
                        onClick={() => setResetPasswordId(user.id)} 
                        className="p-2 text-warning hover:bg-warning/10 rounded-lg transition-colors border border-transparent hover:border-warning/20"
                        title="تغيير كلمة المرور"
                      >
                        <Key size={18} />
                      </button>
                      <button 
                        onClick={() => handleDelete(user)} 
                        className="p-2 text-danger hover:bg-danger/10 rounded-lg transition-colors border border-transparent hover:border-danger/20"
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

      {/* Modal - Add/Edit User */}
      {showForm && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-[100] p-4 animate-in fade-in duration-300">
          <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] w-full max-w-2xl shadow-2xl overflow-hidden border border-slate-100 dark:border-slate-800 animate-in zoom-in-95 duration-300">
            <div className="px-8 py-6 border-b border-slate-50 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/50">
              <div>
                <h3 className="text-lg font-black text-slate-900 dark:text-white">
                  {editingUser ? 'تعديل بيانات المستخدم' : 'إضافة مستخدم جديد'}
                </h3>
                <p className="text-xs font-bold text-slate-400 mt-1">أدخل تفاصيل الحساب والصلاحيات</p>
              </div>
              <button onClick={resetForm} className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 transition-colors">
                <X size={24} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-8 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-xs font-black text-slate-500 uppercase tracking-wider">الاسم الكامل</label>
                  <input 
                    required
                    placeholder="أدخل الاسم الرباعي" 
                    className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all text-sm font-bold" 
                    value={formData.full_name} 
                    onChange={e => setFormData({...formData, full_name: e.target.value})} 
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-black text-slate-500 uppercase tracking-wider">البريد الإلكتروني</label>
                  <input 
                    required
                    type="email"
                    disabled={!!editingUser} 
                    placeholder="example@company.com" 
                    className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all text-sm font-bold disabled:opacity-50" 
                    value={formData.email} 
                    onChange={e => setFormData({...formData, email: e.target.value})} 
                  />
                </div>
                {!editingUser && (
                  <div className="space-y-2">
                    <label className="text-xs font-black text-slate-500 uppercase tracking-wider">كلمة المرور</label>
                    <input 
                      required
                      type="password" 
                      placeholder="6 أحرف على الأقل" 
                      className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all text-sm font-bold" 
                      value={formData.password} 
                      onChange={e => setFormData({...formData, password: e.target.value})} 
                    />
                  </div>
                )}
                <div className="space-y-2">
                  <label className="text-xs font-black text-slate-500 uppercase tracking-wider">رقم الهاتف</label>
                  <input 
                    placeholder="01xxxxxxxxx" 
                    className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all text-sm font-bold" 
                    value={formData.phone} 
                    onChange={e => setFormData({...formData, phone: e.target.value})} 
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-black text-slate-500 uppercase tracking-wider">الدور الوظيفي</label>
                  <select 
                    className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all text-sm font-bold appearance-none"
                    value={formData.role}
                    onChange={e => setFormData({...formData, role: e.target.value as UserRole})}
                  >
                    {assignableRoles(profile?.role as UserRole).map(role => (
                      <option key={role} value={role}>{ROLE_LABELS[role]}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-black text-slate-500 uppercase tracking-wider">الفرع</label>
                  <select 
                    className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all text-sm font-bold appearance-none"
                    value={formData.branch_id}
                    onChange={e => setFormData({...formData, branch_id: e.target.value})}
                  >
                    <option value="">اختر الفرع</option>
                    {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
                <div className="space-y-2 md:col-span-2">
                  <label className="text-xs font-black text-slate-500 uppercase tracking-wider">المدير المباشر</label>
                  <select 
                    className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all text-sm font-bold appearance-none"
                    value={formData.manager_id}
                    onChange={e => setFormData({...formData, manager_id: e.target.value})}
                  >
                    <option value="">بدون مدير (إدارة عليا)</option>
                    {managers.map(m => <option key={m.id} value={m.id}>{m.full_name} ({ROLE_LABELS[m.role as UserRole]})</option>)}
                  </select>
                </div>
              </div>
              <div className="flex gap-4 pt-4">
                <button 
                  type="submit" 
                  disabled={submitting}
                  className="flex-1 bg-primary text-white py-4 rounded-2xl font-black text-sm shadow-crm hover:bg-primary-dark transition-all disabled:opacity-50"
                >
                  {submitting ? 'جاري الحفظ...' : (editingUser ? 'تحديث البيانات' : 'إنشاء الحساب')}
                </button>
                <button 
                  type="button" 
                  onClick={resetForm}
                  className="flex-1 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 py-4 rounded-2xl font-black text-sm hover:bg-slate-200 transition-all"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal - Reset Password */}
      {resetPasswordId && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-[100] p-4">
          <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] w-full max-w-md shadow-2xl overflow-hidden border border-slate-100 dark:border-slate-800">
            <div className="p-8">
              <div className="w-16 h-16 bg-warning/10 rounded-2xl flex items-center justify-center mb-6 mx-auto">
                <Key className="w-8 h-8 text-warning" />
              </div>
              <h3 className="text-xl font-black text-slate-900 dark:text-white text-center mb-2">تغيير كلمة المرور</h3>
              <p className="text-sm font-bold text-slate-400 text-center mb-8">أدخل كلمة المرور الجديدة للمستخدم</p>
              <div className="space-y-4">
                <input 
                  type="password" 
                  placeholder="كلمة المرور الجديدة" 
                  className="w-full px-4 py-4 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all text-center text-lg font-black" 
                  value={newPassword} 
                  onChange={e => setNewPassword(e.target.value)} 
                />
                <div className="flex gap-3">
                  <button 
                    onClick={handleResetPassword}
                    className="flex-1 bg-primary text-white py-4 rounded-2xl font-black text-sm shadow-crm hover:bg-primary-dark transition-all"
                  >
                    حفظ التغيير
                  </button>
                  <button 
                    onClick={() => { setResetPasswordId(null); setNewPassword(''); }}
                    className="flex-1 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 py-4 rounded-2xl font-black text-sm hover:bg-slate-200 transition-all"
                  >
                    إلغاء
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
