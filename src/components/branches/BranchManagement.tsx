import { useState, useCallback, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Branch } from '../../types';
import PageHeader from '../common/PageHeader';
import LoadingSpinner from '../common/LoadingSpinner';
import { Building2, Plus, Edit2, Trash2, X, Search } from 'lucide-react';
import toast from 'react-hot-toast';

const EMPTY_FORM = { name: '', code: '' };
const MAIN_BRANCH_CODE = 'MAIN';

export default function BranchManagement() {
  const { profile: _profile } = useAuth(); // eslint-disable-line @typescript-eslint/no-unused-vars
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const [search, setSearch] = useState('');
  const [formData, setFormData] = useState({ ...EMPTY_FORM });

  const fetchBranches = useCallback(async () => {
    const { data, error } = await supabase
      .from('branches')
      .select('*')
      .order('name', { ascending: true });
    if (error) {
      console.error('fetchBranches error:', error);
      toast.error('خطأ في تحميل الفروع: ' + error.message);
    } else if (data) {
      setBranches(data as Branch[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchBranches();
  }, [fetchBranches]);

  // Check if a branch name is already used (excluding current branch if editing)
  const isNameDuplicate = (name: string): boolean => {
    return branches.some(b => 
      b.name.toLowerCase() === name.toLowerCase() && 
      (!editingBranch || b.id !== editingBranch.id)
    );
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!formData.name.trim()) {
      toast.error('اسم الفرع مطلوب');
      return;
    }

    // Check for duplicate names
    if (isNameDuplicate(formData.name.trim())) {
      toast.error('اسم الفرع موجود بالفعل');
      return;
    }

    setSubmitting(true);

    const payload = {
      name: formData.name.trim(),
      code: formData.code.trim() || null,
    };

    if (editingBranch) {
      // Prevent editing main branch
      if (editingBranch.code === MAIN_BRANCH_CODE) {
        toast.error('لا يمكن تعديل الفرع الرئيسي');
        setSubmitting(false);
        return;
      }

      const { error } = await supabase
        .from('branches')
        .update({ ...payload, updated_at: new Date().toISOString() })
        .eq('id', editingBranch.id);
      if (error) {
        console.error('update branch error:', error);
        toast.error('خطأ في تحديث الفرع: ' + error.message);
        setSubmitting(false);
        return;
      }
      toast.success('✅ تم تحديث بيانات الفرع');
    } else {
      const { error } = await supabase.from('branches').insert(payload);
      if (error) {
        console.error('insert branch error:', error);
        if (error.code === '23505') {
          toast.error('اسم الفرع موجود بالفعل');
        } else {
          toast.error('خطأ في إضافة الفرع: ' + error.message);
        }
        setSubmitting(false);
        return;
      }
      toast.success('✅ تم إضافة الفرع بنجاح');
    }
    setSubmitting(false);
    resetForm();
    fetchBranches();
  }

  async function toggleBranchStatus(branch: Branch) {
    // Prevent disabling main branch
    if (branch.code === MAIN_BRANCH_CODE) {
      toast.error('لا يمكن تعطيل الفرع الرئيسي');
      return;
    }

    const { error } = await supabase
      .from('branches')
      .update({ is_active: !branch.is_active, updated_at: new Date().toISOString() })
      .eq('id', branch.id);
    if (error) {
      console.error('toggle branch status error:', error);
      toast.error('خطأ في تحديث حالة الفرع');
      return;
    }
    toast.success(branch.is_active ? '✅ تم تعطيل الفرع' : '✅ تم تفعيل الفرع');
    fetchBranches();
  }

  async function deleteBranch(branch: Branch) {
    // Prevent deleting main branch
    if (branch.code === MAIN_BRANCH_CODE) {
      toast.error('لا يمكن حذف الفرع الرئيسي');
      return;
    }

    if (!confirm(`هل تريد حذف الفرع "${branch.name}"؟`)) {
      return;
    }

    const { error } = await supabase
      .from('branches')
      .delete()
      .eq('id', branch.id);
    if (error) {
      console.error('delete branch error:', error);
      toast.error('خطأ في حذف الفرع: ' + error.message);
      return;
    }
    toast.success('✅ تم حذف الفرع بنجاح');
    fetchBranches();
  }

  function resetForm() {
    setFormData({ ...EMPTY_FORM });
    setEditingBranch(null);
    setShowForm(false);
  }

  function startEdit(branch: Branch) {
    // Prevent editing main branch
    if (branch.code === MAIN_BRANCH_CODE) {
      toast.error('لا يمكن تعديل الفرع الرئيسي');
      return;
    }
    setEditingBranch(branch);
    setFormData({ name: branch.name, code: branch.code || '' });
    setShowForm(true);
  }

  const filtered = branches.filter(b =>
    b.name.toLowerCase().includes(search.toLowerCase()) ||
    (b.code && b.code.toLowerCase().includes(search.toLowerCase()))
  );

  const inputCls = 'w-full px-4 py-2.5 border border-slate-200 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all';

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Building2}
        title="إدارة الفروع"
        description="أضف وعدّل وأدر الفروع المختلفة"
      />

      {/* Search */}
      <div className="mb-6">
        <div className="relative">
          <Search className="absolute left-4 top-3.5 w-5 h-5 text-slate-400" />
          <input
            type="text"
            placeholder="البحث عن فرع..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={`pl-12 ${inputCls}`}
          />
        </div>
      </div>

      {/* Add Branch Button */}
      <button
        onClick={() => setShowForm(!showForm)}
        className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium flex items-center gap-2 transition-all"
      >
        <Plus className="w-4 h-4" /> إضافة فرع
      </button>

      {/* Form */}
      {showForm && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 border border-slate-100 dark:border-slate-700">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">
              {editingBranch ? 'تعديل الفرع' : 'إضافة فرع جديد'}
            </h3>
            <button
              onClick={resetForm}
              className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-slate-500" />
            </button>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                اسم الفرع
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className={inputCls}
                placeholder="مثال: الفرع الرئيسي"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                الكود
              </label>
              <input
                type="text"
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                className={inputCls}
                placeholder="مثال: HO"
              />
            </div>
            <div className="flex gap-3 pt-4">
              <button
                type="submit"
                disabled={submitting}
                className="flex-1 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-400 text-white rounded-xl font-medium transition-all"
              >
                {submitting ? 'جاري...' : editingBranch ? 'تحديث' : 'إضافة'}
              </button>
              <button
                type="button"
                onClick={resetForm}
                className="flex-1 px-4 py-2.5 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-900 dark:text-white rounded-xl font-medium transition-all"
              >
                إلغاء
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Branches Table */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-slate-500 dark:text-slate-400">
            لا توجد فروع
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 dark:bg-slate-700/50">
                <tr>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900 dark:text-white">اسم الفرع</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900 dark:text-white">الكود</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900 dark:text-white">الحالة</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900 dark:text-white">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {filtered.map(branch => {
                  const isMainBranch = branch.code === MAIN_BRANCH_CODE;
                  return (
                    <tr key={branch.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                      <td className="px-6 py-4 text-sm text-slate-900 dark:text-white font-medium">
                        {branch.name}
                        {isMainBranch && <span className="ml-2 text-xs bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-2 py-1 rounded">نظامي</span>}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-400">{branch.code || '-'}</td>
                      <td className="px-6 py-4 text-sm">
                        <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                          branch.is_active
                            ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
                            : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                        }`}>
                          {branch.is_active ? 'مفعل' : 'معطل'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm flex gap-2">
                        <button
                          onClick={() => startEdit(branch)}
                          disabled={isMainBranch}
                          className={`p-2 rounded-lg transition-colors ${
                            isMainBranch
                              ? 'text-slate-400 cursor-not-allowed'
                              : 'text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20'
                          }`}
                          title={isMainBranch ? 'لا يمكن تعديل الفرع الرئيسي' : 'تعديل'}
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => toggleBranchStatus(branch)}
                          disabled={isMainBranch}
                          className={`p-2 rounded-lg transition-colors ${
                            isMainBranch
                              ? 'text-slate-400 cursor-not-allowed'
                              : 'text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20'
                          }`}
                          title={isMainBranch ? 'لا يمكن تعطيل الفرع الرئيسي' : (branch.is_active ? 'تعطيل' : 'تفعيل')}
                        >
                          {branch.is_active ? '⊘' : '✓'}
                        </button>
                        <button
                          onClick={() => deleteBranch(branch)}
                          disabled={isMainBranch}
                          className={`p-2 rounded-lg transition-colors ${
                            isMainBranch
                              ? 'text-slate-400 cursor-not-allowed'
                              : 'text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20'
                          }`}
                          title={isMainBranch ? 'لا يمكن حذف الفرع الرئيسي' : 'حذف'}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
