import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Profile, ROLE_LABELS, UserRole } from '../../types';
import { assignableRoles, canDeleteUsers } from '../../lib/rbac';
import {
  createUser, deleteUser as deleteUserService,
  resetUserPassword, linkUserToBranches, toggleUserStatus
} from '../../services/usersService';
import PageHeader from '../common/PageHeader';
import LoadingSpinner from '../common/LoadingSpinner';
import {
  Users, Plus, Edit2, Trash2, Ban, CheckCircle, X,
  Search, Key, Shield, Phone, Mail, Building2,
} from 'lucide-react';
import toast from 'react-hot-toast';

interface FormData {
  email: string; password: string; full_name: string;
  phone: string; role: UserRole; manager_id: string; branch_id: string;
}
const emptyForm: FormData = { email: '', password: '', full_name: '', phone: '', role: 'agent', manager_id: '', branch_id: '' };

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
  const [roleFilter, setRoleFilter] = useState<UserRole | ''>('');
  const [formData, setFormData] = useState<FormData>(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [resetPasswordId, setResetPasswordId] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [branches, setBranches] = useState<any[]>([]);
  const [userBranchAccess, setUserBranchAccess] = useState<any[]>([]);
  const [showBranchModal, setShowBranchModal] = useState(false);
  const [selectedUserForBranch, setSelectedUserForBranch] = useState<Profile | null>(null);
  const [selectedBranches, setSelectedBranches] = useState<string[]>([]);

  const myRole: UserRole = (profile?.role ?? 'agent') as UserRole;
  const hasFullAccess = ['super_admin', 'dev_manager'].includes(myRole);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from('profiles').select('*').order('full_name');
    if (error) toast.error('خطأ في جلب المستخدمين');
    else if (data) setUsers(data as Profile[]);
    setLoading(false);
  }, []);

  const fetchBranches = useCallback(async () => {
    const { data } = await supabase.from('branches').select('*').eq('is_active', true).order('name');
    if (data) setBranches(data);
  }, []);

  const fetchUserBranchAccess = useCallback(async () => {
    const { data } = await supabase.from('user_branch_access').select('*');
    if (data) setUserBranchAccess(data);
  }, []);

  useEffect(() => {
    fetchUsers();
    fetchBranches();
    fetchUserBranchAccess();
  }, [fetchUsers, fetchBranches, fetchUserBranchAccess]);

  async function handleSubmit() {
    setSubmitting(true);
    if (editingUser) {
      const { error } = await supabase.from('profiles').update({
        full_name: formData.full_name,
        phone: formData.phone || null,
        role: formData.role,
        manager_id: formData.manager_id || null,
        branch_id: formData.branch_id || null,
      }).eq('id', editingUser.id);
      if (error) toast.error(error.message);
      else {
        toast.success('تم التحديث');
        resetForm();
        fetchUsers();
      }
    } else {
      const result = await createUser(formData);
      if (result.error) toast.error(result.error);
      else {
        toast.success('تم الإنشاء');
        resetForm();
        fetchUsers();
      }
    }
    setSubmitting(false);
  }

  async function toggleActive(user: Profile) {
    const result = await toggleUserStatus(user.id, !user.is_active);
    if (result.error) toast.error(result.error);
    else {
      toast.success(user.is_active ? 'تم التعطيل' : 'تم التفعيل');
      fetchUsers();
    }
  }

  async function handleDelete(user: Profile) {
    if (!confirm(`هل أنت متأكد من حذف ${user.full_name}؟`)) return;
    const result = await deleteUserService(user.id);
    if (result.error) toast.error(result.error);
    else {
      toast.success('تم الحذف');
      fetchUsers();
    }
  }

  async function handleResetPassword() {
    if (!resetPasswordId || !newPassword) return;
    const result = await resetUserPassword(resetPasswordId, newPassword);
    if (result.error) toast.error(result.error);
    else {
      toast.success('تم تغيير كلمة المرور');
      setResetPasswordId(null);
      setNewPassword('');
    }
  }

  function resetForm() { setShowForm(false); setEditingUser(null); setFormData(emptyForm); }

  if (loading) return <LoadingSpinner />;

  return (
    <div className="p-6">
      <PageHeader 
        title="إدارة المستخدمين" 
        icon={Users} 
        actions={
          <button onClick={() => setShowForm(true)} className="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center gap-2">
            <Plus size={18} /> إضافة مستخدم
          </button>
        }
      />

      <div className="mt-6 bg-white dark:bg-slate-800 rounded-xl shadow-sm overflow-hidden">
        <table className="w-full text-right border-collapse">
          <thead className="bg-slate-50 dark:bg-slate-700/50">
            <tr>
              <th className="px-6 py-4 text-sm font-semibold">المستخدم</th>
              <th className="px-6 py-4 text-sm font-semibold">الدور</th>
              <th className="px-6 py-4 text-sm font-semibold">الحالة</th>
              <th className="px-6 py-4 text-sm font-semibold">الإجراءات</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
            {users.filter(u => u.full_name.includes(search)).map(user => (
              <tr key={user.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-700/30">
                <td className="px-6 py-4">
                  <div className="font-medium">{user.full_name}</div>
                  <div className="text-xs text-slate-500">{user.email}</div>
                </td>
                <td className="px-6 py-4">
                  <span className={`px-2 py-1 rounded-full text-xs ${roleBadge[user.role as UserRole]}`}>
                    {ROLE_LABELS[user.role as UserRole]}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <button onClick={() => toggleActive(user)} className={`p-1 rounded-lg ${user.is_active ? 'text-green-600' : 'text-slate-400'}`}>
                    {user.is_active ? <CheckCircle size={20} /> : <Ban size={20} />}
                  </button>
                </td>
                <td className="px-6 py-4 flex gap-2">
                  <button onClick={() => { setEditingUser(user); setFormData({ ...emptyForm, ...user, password: '' }); setShowForm(true); }} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg"><Edit2 size={18} /></button>
                  <button onClick={() => setResetPasswordId(user.id)} className="p-2 text-amber-600 hover:bg-amber-50 rounded-lg"><Key size={18} /></button>
                  <button onClick={() => handleDelete(user)} className="p-2 text-rose-600 hover:bg-rose-50 rounded-lg"><Trash2 size={18} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl w-full max-w-md p-6">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-bold">{editingUser ? 'تعديل مستخدم' : 'إضافة مستخدم جديد'}</h3>
              <button onClick={resetForm}><X size={20} /></button>
            </div>
            <div className="space-y-4">
              <input placeholder="الاسم الكامل" className="w-full p-2 border rounded-lg" value={formData.full_name} onChange={e => setFormData({...formData, full_name: e.target.value})} />
              <input placeholder="البريد الإلكتروني" disabled={!!editingUser} className="w-full p-2 border rounded-lg" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} />
              {!editingUser && <input type="password" placeholder="كلمة المرور" className="w-full p-2 border rounded-lg" value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} />}
              <select className="w-full p-2 border rounded-lg" value={formData.role} onChange={e => setFormData({...formData, role: e.target.value as UserRole})}>
                {Object.entries(ROLE_LABELS).map(([role, label]) => <option key={role} value={role}>{label}</option>)}
              </select>
              <select className="w-full p-2 border rounded-lg" value={formData.branch_id} onChange={e => setFormData({...formData, branch_id: e.target.value})}>
                <option value="">اختر الفرع الأساسي</option>
                {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
              <button onClick={handleSubmit} disabled={submitting} className="w-full bg-blue-600 text-white py-2 rounded-lg font-bold">
                {submitting ? 'جاري التنفيذ...' : (editingUser ? 'تحديث' : 'إنشاء')}
              </button>
            </div>
          </div>
        </div>
      )}

      {resetPasswordId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl w-full max-w-md p-6">
            <h3 className="text-lg font-bold mb-4">تغيير كلمة المرور</h3>
            <input type="password" placeholder="كلمة المرور الجديدة" className="w-full p-2 border rounded-lg mb-4" value={newPassword} onChange={e => setNewPassword(e.target.value)} />
            <div className="flex gap-2">
              <button onClick={handleResetPassword} className="flex-1 bg-amber-600 text-white py-2 rounded-lg font-bold">تحديث</button>
              <button onClick={() => setResetPasswordId(null)} className="flex-1 bg-slate-100 py-2 rounded-lg font-bold">إلغاء</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
