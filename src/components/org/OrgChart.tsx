import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Profile, ROLE_LABELS, UserRole } from '../../types';
import { canRearrangeOrg } from '../../lib/rbac';
import PageHeader from '../common/PageHeader';
import LoadingSpinner from '../common/LoadingSpinner';
import { GitBranch, ChevronDown, ChevronRight, Users, User, MoveRight } from 'lucide-react';
import toast from 'react-hot-toast';

interface OrgNode extends Profile {
  children: OrgNode[];
  subordinateCount: number;
}

const ROLE_COLORS: Record<UserRole, string> = {
  super_admin: 'border-purple-400 bg-purple-50 dark:bg-purple-900/20',
  dev_manager: 'border-indigo-400 bg-indigo-50 dark:bg-indigo-900/20',
  general_supervisor: 'border-blue-400 bg-blue-50 dark:bg-blue-900/20',
  supervisor: 'border-cyan-400 bg-cyan-50 dark:bg-cyan-900/20',
  team_leader: 'border-teal-400 bg-teal-50 dark:bg-teal-900/20',
  branch_manager: 'border-orange-400 bg-orange-50 dark:bg-orange-900/20',
  agent: 'border-slate-300 bg-white dark:bg-slate-800',
};

const ROLE_DOT: Record<UserRole, string> = {
  super_admin: 'bg-purple-500',
  dev_manager: 'bg-indigo-500',
  general_supervisor: 'bg-blue-500',
  supervisor: 'bg-cyan-500',
  team_leader: 'bg-teal-500',
  branch_manager: 'bg-orange-500',
  agent: 'bg-slate-400',
};

function buildTree(allUsers: Profile[], parentId: string | null): OrgNode[] {
  return allUsers
    .filter(u => u.manager_id === parentId)
    .map(u => {
      const node: OrgNode = { ...u, children: buildTree(allUsers, u.id), subordinateCount: 0 };
      node.subordinateCount = node.children.reduce((acc, c) => acc + 1 + c.subordinateCount, 0);
      return node;
    });
}

function NodeCard({ node, allUsers, canRearrange, onMove }: {
  node: OrgNode;
  allUsers: Profile[];
  canRearrange: boolean;
  onMove: (userId: string, newManagerId: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const [showMoveMenu, setShowMoveMenu] = useState(false);

    const potentialManagers = allUsers.filter(u => u.id !== node.id);

  return (
    <div className="relative">
      <div className={`border-2 rounded-xl p-3 ${ROLE_COLORS[node.role]} mb-1 select-none`}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${ROLE_DOT[node.role]}`} />
            <div className="min-w-0">
              <p className="font-semibold text-slate-900 dark:text-white text-sm truncate">{node.full_name}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">{ROLE_LABELS[node.role]}</p>
            </div>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            {node.subordinateCount > 0 && (
              <span className="text-xs bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded-full flex items-center gap-1">
                <Users className="w-3 h-3" />{node.subordinateCount}
              </span>
            )}
            {canRearrange && (
              <div className="relative">
                <button onClick={() => setShowMoveMenu(v => !v)} className="p-1 rounded-lg hover:bg-white/50 dark:hover:bg-slate-700 transition-colors" title="نقل">
                  <MoveRight className="w-4 h-4 text-slate-500" />
                </button>
                {showMoveMenu && (
                  <div className="absolute left-0 top-full mt-1 z-30 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl w-56 max-h-48 overflow-y-auto">
                    <p className="px-3 py-2 text-xs font-semibold text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-700">نقل إلى مدير:</p>
                    <button onClick={() => { onMove(node.id, ''); setShowMoveMenu(false); }} className="w-full text-right px-3 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors text-slate-600 dark:text-slate-400">
                      — بدون مدير
                    </button>
                    {potentialManagers.map(m => (
                      <button key={m.id} onClick={() => { onMove(node.id, m.id); setShowMoveMenu(false); }} className="w-full text-right px-3 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
                        <span className="text-slate-900 dark:text-white">{m.full_name}</span>
                        <span className="block text-xs text-slate-400">{ROLE_LABELS[m.role]}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {node.children.length > 0 && (
              <button onClick={() => setExpanded(v => !v)} className="p-1 rounded-lg hover:bg-white/50 dark:hover:bg-slate-700 transition-colors">
                {expanded ? <ChevronDown className="w-4 h-4 text-slate-500" /> : <ChevronRight className="w-4 h-4 text-slate-500" />}
              </button>
            )}
          </div>
        </div>
      </div>
      {expanded && node.children.length > 0 && (
        <div className="mr-4 border-r-2 border-dashed border-slate-200 dark:border-slate-700 pr-4 space-y-1 mb-1">
          {node.children.map(child => (
            <NodeCard key={child.id} node={child} allUsers={allUsers} canRearrange={canRearrange} onMove={onMove} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function OrgChart() {
  const { profile } = useAuth();
  const [allUsers, setAllUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [tree, setTree] = useState<OrgNode[]>([]);
  const [viewMode, setViewMode] = useState<'tree' | 'table'>('tree');
  const canRearrange = profile ? canRearrangeOrg(profile.role) : false;

  const fetchUsers = useCallback(async () => {
    const query = supabase.from('profiles').select('*').order('full_name');
    
    // Data Isolation handled by RLS automatically

    const { data, error } = await query;
    if (!error && data) {
      const users = data as Profile[];
      setAllUsers(users);
      
      // Build tree starting from the highest accessible level
      const rootId = (profile && !['super_admin', 'dev_manager'].includes(profile.role)) 
        ? (users.find(u => u.id === profile.id)?.manager_id || null) 
        : null;
        
      setTree(buildTree(users, rootId));
    }
    setLoading(false);
  }, [profile]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  async function handleMove(userId: string, newManagerId: string) {
    const { error } = await supabase.from('profiles').update({ manager_id: newManagerId || null, updated_at: new Date().toISOString() }).eq('id', userId);
    if (error) toast.error('خطأ في النقل: ' + error.message);
    else { toast.success('تم نقل المستخدم بنجاح'); fetchUsers(); }
  }

  if (loading) return <LoadingSpinner />;

  const ROLE_DOT: Record<UserRole, string> = {
    super_admin: 'bg-purple-500', dev_manager: 'bg-indigo-500', general_supervisor: 'bg-blue-500',
    supervisor: 'bg-cyan-500', team_leader: 'bg-teal-500', branch_manager: 'bg-orange-500', agent: 'bg-slate-400',
  };

  return (
    <div>
      <PageHeader
        title="الهيكل الوظيفي"
        description={`${allUsers.length} موظف`}
        icon={GitBranch}
        actions={
          <div className="flex gap-2">
            {(['tree', 'table'] as const).map(m => (
              <button key={m} onClick={() => setViewMode(m)} className={`px-3 py-2 rounded-xl text-sm font-medium transition-colors ${viewMode === m ? 'bg-blue-600 text-white' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'}`}>
                {m === 'tree' ? 'شجرة' : 'جدول'}
              </button>
            ))}
          </div>
        }
      />

      {/* Level summary */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mb-6">
        {(Object.keys(ROLE_LABELS) as UserRole[]).map(r => {
          const count = allUsers.filter(u => u.role === r).length;
          const active = allUsers.filter(u => u.role === r && u.is_active).length;
          return (
            <div key={r} className={`rounded-xl p-3 border-2 ${ROLE_COLORS[r]} text-center`}>
              <div className={`w-3 h-3 rounded-full ${ROLE_DOT[r]} mx-auto mb-1`} />
              <p className="text-lg font-bold text-slate-900 dark:text-white">{count}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">{ROLE_LABELS[r]}</p>
              {count > 0 && active < count && <p className="text-xs text-red-500 mt-0.5">{count - active} معطل</p>}
            </div>
          );
        })}
      </div>

      {viewMode === 'tree' ? (
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 border border-slate-100 dark:border-slate-700 overflow-x-auto">
          {tree.length === 0 ? (
            <div className="text-center py-12 text-slate-400"><GitBranch className="w-12 h-12 mx-auto mb-3 opacity-30" /><p>لا يوجد هيكل بعد — حدد المدير المباشر لكل موظف</p></div>
          ) : (
            <div className="space-y-2 min-w-[300px]">
              {tree.map(node => <NodeCard key={node.id} node={node} allUsers={allUsers} canRearrange={canRearrange} onMove={handleMove} />)}
            </div>
          )}
          {canRearrange && <p className="text-xs text-slate-400 mt-4 text-center">اضغط ← لنقل الموظف إلى مدير آخر</p>}
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-700/50">
                <tr>
                  {['الاسم', 'الوظيفة', 'المدير المباشر', 'المرؤوسون', 'الحالة'].map(h => (
                    <th key={h} className="px-4 py-3 text-right text-xs font-medium text-slate-500 dark:text-slate-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {allUsers.map(u => {
                  const mgr = u.manager_id ? allUsers.find(m => m.id === u.manager_id) : null;
                  const subCount = allUsers.filter(s => s.manager_id === u.id).length;
                  return (
                    <tr key={u.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${ROLE_DOT[u.role]}`} />
                          <span className="font-medium text-slate-900 dark:text-white">{u.full_name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{ROLE_LABELS[u.role]}</td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{mgr?.full_name || '—'}</td>
                      <td className="px-4 py-3">
                        {subCount > 0 ? <span className="flex items-center gap-1 text-slate-600 dark:text-slate-400"><User className="w-3.5 h-3.5" />{subCount}</span> : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${u.is_active ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400' : 'bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400'}`}>
                          {u.is_active ? 'نشط' : 'معطل'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
