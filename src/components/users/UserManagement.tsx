import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Profile, ROLE_LABELS, UserRole } from '../../types';
import { assignableRoles, canDeleteUsers } from '../../lib/rbac';
import {
  createUser, deleteUser as deleteUserService,
  resetUserPassword, linkUserToBranches,
} from '../../services/usersService';
import PageHeader from '../common/PageHeader';
import LoadingSpinner from '../common/LoadingSpinner';
import {
  Users, Plus, Edit2, Trash2, Ban, CheckCircle, X,
  Search, Key, ChevronDown, Shield, Phone, Mail, Building2,
} from 'lucide-react';
import toast from 'react-hot-toast';

const MAIN_BRANCH_CODE = 'MAIN';

interface FormData {
  email: string; password: string; full_name: string;
  phone: string; role: UserRole; manager_id: string;
}
const emptyForm: FormData = { email: '', password: '', full_name: '', phone: '', role: 'agent', manager_id: '' };

const roleBadge: Record<UserRole, string> = {
  super_admin: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
  dev_manager: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  general_supervisor: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300',
  supervisor: 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300',
  team_leader: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  agent: 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300',
};

const roleAvatar: Record<UserRole, string> = {
  super_admin: 'bg-rose-100 text-rose-600 dark:bg-rose-900/40 dark:text-rose-300',
  dev_manager: 'bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-300',
  general_supervisor: 'bg-cyan-100 text-cyan-600 dark:bg-cyan-900/40 dark:text-cyan-300',
  supervisor: 'bg-teal-100 text-teal-600 dark:bg-teal-900/40 dark:text-teal-300',
  team_leader: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-300',
  agent: 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-300',
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
  const [resetPasswordName, setResetPasswordName] = useState<string>('');
  const [newPassword, setNewPassword] = useState('');
  const [branches, setBranches] = useState<any[]>([]);
  const [userBranchAccess, setUserBranchAccess] = useState<any[]>([]);
  const [showBranchModal, setShowBranchModal] = useState(false);
  const [selectedUserForBranch, setSelectedUserForBranch] = useState<Profile | null>(null);
  const [selectedBranches, setSelectedBranches] = useState<string[]>([]);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);

  const myRole: UserRole = (profile?.role ?? 'agent') as UserRole;
  const isSuperAdmin = myRole === 'super_admin';
  const isDevManager = myRole === 'dev_manager';
  const hasFullAccess = isSuperAdmin || isDevManager;

  const isSubordinate = useCallback((managerId: string, subordinateId: string): boolean => {
    const visited = new Set<string>();
    let current = subordinateId;
    while (current && !visited.has(current)) {
      visited.add(current);
      const user = users.find(u => u.id === current);
      if (!user) return false;
      if (user.manager_id === managerId) return true;
      current = user.manager_id || '';
    }
    return false;
  }, [users]);

  const canViewUser = useCallback((targetUser: Profile): boolean => {
    if (!profile) return false;
    if (isSuperAdmin || isDevManager) return true;
    if (profile.id === targetUser.id) return true;
    return isSubordinate(profile.id, targetUser.id);
  }, [profile, isSuperAdmin, isDevManager, isSubordinate]);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('full_name');

      if (error) {
        toast.error('خطأ في جلب المستخدمين: ' + error.message);
      } else if (data) {
        const visibleUsers = data.filter((user: Profile) => canViewUser(user));
        setUsers(visibleUsers as Profile[]);
      }
    } catch (err) {
      toast.error('خطأ غير متوقع: ' + String(err));
    }
    setLoading(false);
  }, [canViewUser]);

  const fetchBranches = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('branches')
        .select('*')
        .eq('is_active', true)
        .neq('code', MAIN_BRANCH_CODE)
        .order('name');
      if (!error && data) setBranches(data);
    } catch (err) {
      console.error('Error fetching branches:', err);
    }
  }, []);

  const fetchUserBranchAccess = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('user_branch_access')
        .select('*');
      if (!error && data) setUserBranchAccess(data);
    } catch (err) {
      console.error('Error fetching user branch access:', err);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
    fetchBranches();
    fetchUserBranchAccess();
  }, [fetchUsers, fetchBranches, fetchUserBranchAccess]);

  const potentialManagers = users.filter(u => {
    if (u.is_active === false) return false;
    if (u.id === editingUser?.id) return false;
    if (isSuperAdmin) return true;
    if (isDevManager) return u.role !== 'super_admin';
    return isSubordinate(profile?.id || '', u.id);
  });

  const filteredUsers = users.filter(u => {
    const matchSearch =
      u.full_name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase()) ||
      (u.phone ?? '').includes(search);
    const matchRole = !roleFilter || u.role === roleFilter;
    return matchSearch && matchRole;
  });

  async function handleSubmit() {
    if (!formData.full_name.trim()) { toast.error('الاسم الكامل مطلوب'); return; }

    if (!editingUser) {
      if (!formData.email.trim()) { toast.error('البريد الإلكتروني مطلوب'); return; }
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(formData.email.trim())) { toast.error('صيغة البريد الإلكتروني غير صالحة'); return; }
      if (!formData.password || formData.password.length < 6) { toast.error('كلمة المرور يجب أن تكون 6 أحرف على الأقل'); return; }
    }

    setSubmitting(true);

    if (editingUser) {
      const { error } = await supabase.from('profiles').update({
        full_name: formData.full_name.trim(),
        phone: formData.phone.trim() || null,
        role: formData.role,
        manager_id: formData.manager_id || null,
        updated_at: new Date().toISOString(),
      }).eq('id', editingUser.id);

      if (error) {
        if (error.code === '42501') {
          toast.error('غير مصرح بتعديل هذا المستخدم — تأكد من صلاحياتك');
        } else {
          toast.error('خطأ في التحديث: ' + error.message);
        }
      } else {
        toast.success('تم تحديث بيانات المستخدم');
        resetForm();
        fetchUsers();
      }
    } else {
      const result = await createUser({
        email: formData.email.trim().toLowerCase(),
        password: formData.password,
        full_name: formData.full_name.trim(),
        phone: formData.phone.trim() || undefined,
        role: formData.role,
        manager_id: formData.manager_id || undefined,
      });
      if ((result as { error?: string }).error) {
        toast.error((result as { error?: string }).error ?? 'خطأ غير معروف');
      } else {
        toast.success('تم إنشاء المستخدم بنجاح');
        resetForm();
        fetchUsers();
      }
    }
    setSubmitting(false);
  }

  async function toggleActive(user: Profile) {
    if (user.id === profile?.id) { toast.error('لا يمكنك تعطيل حسابك الخاص'); return; }

    if (!isSuperAdmin && !isDevManager && !isSubordinate(profile?.id || '', user.id)) {
      toast.error('غير مصرح بتعديل حالة هذا المستخدم');
      return;
    }

    const { error } = await supabase
      .from('profiles')
      .update({ is_active: !user.is_active, updated_at: new Date().toISOString() })
      .eq('id', user.id);
    if (!error) {
      toast.success(user.is_active ? 'تم تعطيل الحساب' : 'تم تفعيل الحساب');
      fetchUsers();
    } else if (error.code === '42501') {
      toast.error('غير مصرح بتعديل حالة هذا المستخدم');
    } else {
      toast.error('خطأ: ' + error.message);
    }
  }

  async function deleteUserHandler(user: Profile) {
    if (user.id === profile?.id) { toast.error('لا يمكنك حذف حسابك الخاص'); return; }
    if (!canDeleteUsers(myRole)) { toast.error('حذف المستخدمين متاح لـ Super Admin ومدير التطوير فقط'); return; }
    if (isDevManager && user.role === 'super_admin') { toast.error('لا يمكن لمدير التطوير حذف حساب Super Admin'); return; }

    setDeletingUserId(user.id);
    try {
      const [clientsRes, policiesRes, collectionsRes] = await Promise.all([
        supabase.from('clients').select('id', { count: 'exact', head: true }).eq('agent_id', user.id),
        supabase.from('policies').select('id', { count: 'exact', head: true }).eq('agent_id', user.id),
        supabase.from('collections').select('id', { count: 'exact', head: true }).eq('collected_by', user.id),
      ]);

      const clientsCount = clientsRes.count ?? 0;
      const policiesCount = policiesRes.count ?? 0;
      const collectionsCount = collectionsRes.count ?? 0;
      const hasLinkedData = clientsCount > 0 || policiesCount > 0 || collectionsCount > 0;

      if (hasLinkedData) {
        const details: string[] = [];
        if (clientsCount > 0) details.push(`${clientsCount} عميل`);
        if (policiesCount > 0) details.push(`${policiesCount} وثيقة`);
        if (collectionsCount > 0) details.push(`${collectionsCount} تحصيل`);

        const confirmed = confirm(
          `تحذير: لا يمكن حذف "${user.full_name}" نهائياً.\n\n` +
          `يرتبط بـ: ${details.join('، ')}\n\n` +
          `هل تريد تعطيل الحساب فقط بدلاً من الحذف؟`
        );
        if (confirmed) {
          const { error } = await supabase
            .from('profiles')
            .update({ is_active: false, updated_at: new Date().toISOString() })
            .eq('id', user.id);
          if (!error) {
            toast.success('تم تعطيل الحساب (لا يمكن الحذف النهائي لوجود بيانات مرتبطة)');
            fetchUsers();
          } else {
            toast.error('خطأ في تعطيل الحساب: ' + error.message);
          }
        }
        return;
      }

      if (!confirm(`هل أنت متأكد من حذف "${user.full_name}" نهائياً؟ لا يمكن التراجع عن هذا الإجراء.`)) return;

      const result = await deleteUserService(user.id);
      if (result.error) {
        if ((result as any).soft_deleted) {
          toast.success('تم تعطيل الحساب لوجود بيانات مرتبطة');
        } else {
          toast.error(result.error);
        }
      } else {
        toast.success('تم حذف المستخدم بنجاح');
        fetchUsers();
      }
    } finally {
      setDeletingUserId(null);
    }
  }

  async function handleResetPassword() {
    if (!newPassword || newPassword.length < 6) { toast.error('كلمة المرور يجب أن تكون 6 أحرف على الأقل'); return; }
    if (!resetPasswordId) { toast.error('خطأ: لم يتم تحديد المستخدم'); return; }
    const result = await resetUserPassword(resetPasswordId, newPassword);
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success(`تم تغيير كلمة مرور "${resetPasswordName}" بنجاح`);
      setResetPasswordId(null);
      setResetPasswordName('');
      setNewPassword('');
    }
  }

  function resetForm() { setShowForm(false); setEditingUser(null); setFormData(emptyForm); }
  function startEdit(user: Profile) {
    setEditingUser(user);
    setFormData({ email: user.email, password: '', full_name: user.full_name, phone: user.phone || '', role: user.role, manager_id: user.manager_id || '' });
    setShowForm(true);
  }

  function openBranchModal(user: Profile) {
    setSelectedUserForBranch(user);
    const userAccess = userBranchAccess.filter(a => a.user_id === user.id);
    setSelectedBranches(userAccess.map(a => a.branch_id));
    setShowBranchModal(true);
  }

  async function saveBranchAccess() {
    if (!selectedUserForBranch) return;
    const result = await linkUserToBranches(selectedUserForBranch.id, selectedBranches);
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success('تم تحديث الفروع');
      setShowBranchModal(false);
      fetchUserBranchAccess();
    }
  }

  if (!profile || !hasFullAccess) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-400">
        <Shield className="w-12 h-12 mb-3 opacity-30" />
        <p className="text-lg font-medium">غير مصرح بالوصول</p>
      </div>
    );
  }
  if (loading) return <LoadingSpinner />;

  const allowedRoles = assignableRoles(myRole);

  return (
    <div>
      <PageHeader
        title="إدارة المستخدمين"
        description={`${filteredUsers.length} من ${users.length} مستخدم`}
        icon={Users}
        actions={
          <button
            onClick={() => { setEditingUser(null); setFormData(emptyForm); setShowForm(true); }}
            className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-medium transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" /><span className="hidden sm:inline">إضافة مستخدم</span>
          </button>
        }
      />

      {/* Search & filter bar */}
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
            className="appearance-none pr-4 pl-8 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
          >
            <option value="">كل الأدوار</option>
            {(Object.keys(ROLE_LABELS) as UserRole[]).map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
          </select>
          <ChevronDown className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
        </div>
      </div>

      {/* Role stats cards */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mb-4">
        {(Object.keys(ROLE_LABELS) as UserRole[]).map(r => (
          <button
            key={r}
            onClick={() => setRoleFilter(roleFilter === r ? '' : r)}
            className={`rounded-xl p-3 border text-center transition-all ${roleFilter === r
              ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-300 dark:border-blue-600 ring-2 ring-blue-400'
              : 'bg-white dark:bg-slate-800 border-slate-100 dark:border-slate-700 hover:border-slate-300'}`}
          >
            <p className="text-lg font-bold text-slate-900 dark:text-white">{users.filter(u => u.role === r).length}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-tight">{ROLE_LABELS[r]}</p>
          </button>
        ))}
      </div>

      {/* Users list */}
      <div className="space-y-2">
        {filteredUsers.map(user => {
          const managerProfile = user.manager_id ? users.find(u => u.id === user.manager_id) : null;
          const canEdit = isSuperAdmin || (isDevManager && user.role !== 'super_admin');
          const badgeClass = roleBadge[user.role] ?? 'bg-slate-100 text-slate-700';
          const avatarClass = roleAvatar[user.role] ?? 'bg-slate-100 text-slate-500';
          const isDeleting = deletingUserId === user.id;

          return (
            <div
              key={user.id}
              className={`bg-white dark:bg-slate-800 rounded-xl p-4 border transition-all ${!user.is_active ? 'border-red-100 dark:border-red-900/20 opacity-70' : 'border-slate-100 dark:border-slate-700'} flex flex-col sm:flex-row sm:items-center justify-between gap-3`}
            >
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${avatarClass}`}>
                  <span className="font-bold text-sm">
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
                      <span className="px-2 py-0.5 bg-red-100 dark:bg-red-900/20 text-red-600 rounded-full text-xs font-medium">
                        معطّل
                      </span>
                    )}
                    {user.id === profile?.id && (
                      <span className="px-2 py-0.5 bg-green-100 dark:bg-green-900/20 text-green-600 rounded-full text-xs font-medium">
                        أنت
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 text-xs text-slate-500 dark:text-slate-400 flex-wrap">
                    <span className="flex items-center gap-1" dir="ltr"><Mail className="w-3 h-3" />{user.email}</span>
                    {user.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{user.phone}</span>}
                    {managerProfile && <span>المدير: {managerProfile.full_name}</span>}
                  </div>
                </div>
              </div>

              {canEdit && (
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => startEdit(user)}
                    title="تعديل البيانات والصلاحيات"
                    className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                  >
                    <Edit2 className="w-4 h-4 text-slate-500" />
                  </button>

                  <button
                    onClick={() => { setResetPasswordId(user.id); setResetPasswordName(user.full_name); setNewPassword(''); }}
                    title="تغيير كلمة المرور"
                    className="p-2 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded-lg transition-colors"
                  >
                    <Key className="w-4 h-4 text-amber-500" />
                  </button>

                  <button
                    onClick={() => openBranchModal(user)}
                    title="إدارة الفروع"
                    className="p-2 hover:bg-teal-50 dark:hover:bg-teal-900/20 rounded-lg transition-colors"
                  >
                    <Building2 className="w-4 h-4 text-teal-500" />
                  </button>

                  <button
                    onClick={() => toggleActive(user)}
                    title={user.is_active ? 'تعطيل الحساب' : 'تفعيل الحساب'}
                    disabled={user.id === profile?.id}
                    className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    {user.is_active
                      ? <Ban className="w-4 h-4 text-orange-500" />
                      : <CheckCircle className="w-4 h-4 text-emerald-500" />
                    }
                  </button>

                  {canDeleteUsers(myRole) && user.id !== profile?.id && !(isDevManager && user.role === 'super_admin') && (
                    <button
                      onClick={() => deleteUserHandler(user)}
                      title="حذف أو تعطيل المستخدم"
                      disabled={isDeleting}
                      className="p-2 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors disabled:opacity-50"
                    >
                      {isDeleting
                        ? <div className="w-4 h-4 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
                        : <Trash2 className="w-4 h-4 text-red-500" />
                      }
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
            <p className="font-medium">لا توجد نتائج</p>
            {roleFilter && (
              <button onClick={() => setRoleFilter('')} className="mt-2 text-sm text-blue-500 hover:underline">
                إزالة فلتر الدور
              </button>
            )}
          </div>
        )}
      </div>

      {/* Add/Edit user modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl w-full max-w-md max-h-[92vh] overflow-y-auto shadow-2xl">
            <div className="flex items-center justify-between p-6 border-b border-slate-100 dark:border-slate-700">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                {editingUser ? `تعديل: ${editingUser.full_name}` : 'إضافة مستخدم جديد'}
              </h3>
              <button onClick={resetForm} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg">
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">الاسم الكامل *</label>
                <input
                  type="text"
                  value={formData.full_name}
                  onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                  className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                />
              </div>
              {!editingUser && (<>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">البريد الإلكتروني *</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    dir="ltr"
                    className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">كلمة المرور *</label>
                  <input
                    type="password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    dir="ltr"
                    placeholder="6 أحرف على الأقل"
                    className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                  />
                </div>
              </>)}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">الهاتف</label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  dir="ltr"
                  className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">الوظيفة / الصلاحية</label>
                <select
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value as UserRole, manager_id: '' })}
                  className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                >
                  {allowedRoles.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">المدير المباشر</label>
                <select
                  value={formData.manager_id}
                  onChange={(e) => setFormData({ ...formData, manager_id: e.target.value })}
                  className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                >
                  <option value="">بدون مدير مباشر</option>
                  {potentialManagers.map(m => (
                    <option key={m.id} value={m.id}>{m.full_name} — {ROLE_LABELS[m.role]}</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl font-medium transition-colors"
                >
                  {submitting ? 'جاري الحفظ...' : editingUser ? 'تحديث البيانات' : 'إنشاء المستخدم'}
                </button>
                <button
                  onClick={resetForm}
                  className="flex-1 py-2.5 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-medium transition-colors"
                >
                  إلغاء
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Branch management modal */}
      {showBranchModal && selectedUserForBranch && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                إدارة فروع: {selectedUserForBranch.full_name}
              </h3>
              <button onClick={() => setShowBranchModal(false)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg">
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>
            <div className="space-y-2 max-h-48 overflow-y-auto mb-4">
              {branches.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400 py-4 text-center">لا توجد فروع متاحة</p>
              ) : (
                branches.map(branch => (
                  <label key={branch.id} className="flex items-center gap-3 p-2 hover:bg-slate-50 dark:hover:bg-slate-700/50 rounded-lg cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedBranches.includes(branch.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedBranches([...selectedBranches, branch.id]);
                        } else {
                          setSelectedBranches(selectedBranches.filter(id => id !== branch.id));
                        }
                      }}
                      className="w-4 h-4 rounded accent-blue-600"
                    />
                    <span className="text-slate-900 dark:text-white">{branch.name}</span>
                    {branch.code && <span className="text-xs text-slate-400">{branch.code}</span>}
                  </label>
                ))
              )}
            </div>
            <div className="flex gap-3">
              <button onClick={saveBranchAccess} className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium transition-colors">حفظ</button>
              <button onClick={() => setShowBranchModal(false)} className="flex-1 py-2.5 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-medium transition-colors">إلغاء</button>
            </div>
          </div>
        </div>
      )}

      {/* Reset password modal */}
      {resetPasswordId && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl w-full max-w-sm p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">تغيير كلمة المرور</h3>
              <button onClick={() => { setResetPasswordId(null); setResetPasswordName(''); }} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg">
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">المستخدم: <span className="font-medium text-slate-700 dark:text-slate-300">{resetPasswordName}</span></p>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleResetPassword()}
              placeholder="كلمة المرور الجديدة (6 أحرف+)"
              dir="ltr"
              className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none mb-4"
            />
            <div className="flex gap-3">
              <button onClick={handleResetPassword} className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium transition-colors">
                تغيير كلمة المرور
              </button>
              <button onClick={() => { setResetPasswordId(null); setResetPasswordName(''); }} className="flex-1 py-2.5 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-medium transition-colors">
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
