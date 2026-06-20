import { useState, useCallback, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Profile, Branch, UserBranchAccess } from '../../types';
import PageHeader from '../common/PageHeader';
import LoadingSpinner from '../common/LoadingSpinner';
import { Users, Plus, X, Search } from 'lucide-react';
import toast from 'react-hot-toast';

const MAIN_BRANCH_CODE = 'MAIN';

export default function BranchAccessManagement() {
  const { profile: _profile } = useAuth(); // eslint-disable-line @typescript-eslint/no-unused-vars
  const [users, setUsers] = useState<Profile[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [userBranchAccess, setUserBranchAccess] = useState<UserBranchAccess[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [selectedBranches, setSelectedBranches] = useState<string[]>([]);

  const fetchUsers = useCallback(async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('is_active', true)
      .neq('role', 'super_admin') // Don't show super_admin in regular user list
      .order('full_name');
    if (error) {
      console.error('fetchUsers error:', error);
    } else if (data) {
      setUsers(data as Profile[]);
    }
  }, []);

  const fetchBranches = useCallback(async () => {
    const { data, error } = await supabase
      .from('branches')
      .select('*')
      .eq('is_active', true)
      .neq('code', MAIN_BRANCH_CODE) // Exclude main branch from regular user access
      .order('name');
    if (error) {
      console.error('fetchBranches error:', error);
    } else if (data) {
      setBranches(data as Branch[]);
    }
  }, []);

  const fetchUserBranchAccess = useCallback(async () => {
    const { data, error } = await supabase
      .from('user_branch_access')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      console.error('fetchUserBranchAccess error:', error);
    } else if (data) {
      setUserBranchAccess(data as UserBranchAccess[]);
    }
  }, []);

  useEffect(() => {
    Promise.all([fetchUsers(), fetchBranches(), fetchUserBranchAccess()]).then(() => {
      setLoading(false);
    });
  }, [fetchUsers, fetchBranches, fetchUserBranchAccess]);

  async function handleAddAccess() {
    if (!selectedUser || selectedBranches.length === 0) {
      toast.error('اختر مستخدم وفرع واحد على الأقل');
      return;
    }

    setSubmitting(true);

    const newAccess = selectedBranches.map(branchId => ({
      user_id: selectedUser,
      branch_id: branchId,
    }));

    const { error } = await supabase
      .from('user_branch_access')
      .insert(newAccess);

    if (error) {
      console.error('add access error:', error);
      if (error.code === '23505') {
        toast.error('هذا المستخدم مرتبط بهذا الفرع بالفعل');
      } else {
        toast.error('خطأ في إضافة الوصول: ' + error.message);
      }
      setSubmitting(false);
      return;
    }

    toast.success('✅ تم إضافة الوصول بنجاح');
    setSelectedUser(null);
    setSelectedBranches([]);
    setSubmitting(false);
    fetchUserBranchAccess();
  }

  async function removeAccess(accessId: string) {
    if (!confirm('هل تريد إزالة هذا الوصول؟')) {
      return;
    }

    const { error } = await supabase
      .from('user_branch_access')
      .delete()
      .eq('id', accessId);

    if (error) {
      console.error('remove access error:', error);
      toast.error('خطأ في إزالة الوصول: ' + error.message);
      return;
    }

    toast.success('✅ تم إزالة الوصول بنجاح');
    fetchUserBranchAccess();
  }

  function getUserBranches(userId: string): Branch[] {
    const userAccess = userBranchAccess.filter(a => a.user_id === userId);
    return branches.filter(b => userAccess.some(a => a.branch_id === b.id));
  }

  const filteredUsers = users.filter(u =>
    u.full_name.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase())
  );

  const inputCls = 'w-full px-4 py-2.5 border border-slate-200 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all';

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Users}
        title="ربط المستخدمين بالفروع"
        description="أدر وصول المستخدمين للفروع المختلفة"
      />

      {/* Add Access Section */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 border border-slate-100 dark:border-slate-700 mb-6">
        <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4">إضافة وصول جديد</h3>
        <div className="space-y-4">
          {/* User Selection */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              المستخدم
            </label>
            <select
              value={selectedUser || ''}
              onChange={(e) => setSelectedUser(e.target.value || null)}
              className={inputCls}
            >
              <option value="">اختر مستخدم...</option>
              {users.map(u => (
                <option key={u.id} value={u.id}>
                  {u.full_name} ({u.role})
                </option>
              ))}
            </select>
          </div>
          {/* Branch Selection */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              الفروع
            </label>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {branches.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400">لا توجد فروع متاحة</p>
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
                      className="w-4 h-4 rounded"
                    />
                    <span className="text-slate-900 dark:text-white">{branch.name}</span>
                  </label>
                ))
              )}
            </div>
          </div>
          <button
            onClick={handleAddAccess}
            disabled={submitting || !selectedUser || selectedBranches.length === 0}
            className="w-full px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-400 text-white rounded-xl font-medium flex items-center justify-center gap-2 transition-all"
          >
            <Plus className="w-4 h-4" /> إضافة الوصول
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="mb-6">
        <div className="relative">
          <Search className="absolute left-4 top-3.5 w-5 h-5 text-slate-400" />
          <input
            type="text"
            placeholder="البحث عن مستخدم..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={`pl-12 ${inputCls}`}
          />
        </div>
      </div>

      {/* Users and Their Branches */}
      <div className="space-y-4">
        {filteredUsers.map(user => {
          const userBranches = getUserBranches(user.id);
          const userAccess = userBranchAccess.filter(a => a.user_id === user.id);
          return (
            <div key={user.id} className="bg-white dark:bg-slate-800 rounded-2xl p-6 border border-slate-100 dark:border-slate-700">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h4 className="text-lg font-bold text-slate-900 dark:text-white">{user.full_name}</h4>
                  <p className="text-sm text-slate-600 dark:text-slate-400">{user.email} • {user.role}</p>
                </div>
              </div>
              {userBranches.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400">لا يوجد وصول لأي فرع</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {userAccess.map(access => {
                    const branch = branches.find(b => b.id === access.branch_id);
                    return branch ? (
                      <div
                        key={access.id}
                        className="flex items-center gap-2 px-3 py-1.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded-lg text-sm"
                      >
                        <span>{branch.name}</span>
                        <button
                          onClick={() => removeAccess(access.id)}
                          className="text-blue-600 hover:text-red-600 dark:text-blue-300 dark:hover:text-red-400"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : null;
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
