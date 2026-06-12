import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { AuditLog } from '../../types';
import { formatDateTime } from '../../lib/utils';
import PageHeader from '../common/PageHeader';
import LoadingSpinner from '../common/LoadingSpinner';
import { ClipboardList, Search } from 'lucide-react';

export default function AuditLogPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterAction, setFilterAction] = useState('');

  useEffect(() => { loadLogs(); }, []);

  async function loadLogs() {
    const { data } = await supabase
      .from('audit_logs')
      .select('*, user:profiles(full_name, role)')
      .order('created_at', { ascending: false })
      .limit(100);
    if (data) setLogs(data as any);
    setLoading(false);
  }

  const actionLabels: Record<string, string> = {
    create: 'إنشاء',
    update: 'تعديل',
    delete: 'حذف',
    login: 'تسجيل دخول',
    close_month: 'تقفيل شهر',
    collect: 'تحصيل',
  };

  const actionColors: Record<string, string> = {
    create: 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400',
    update: 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400',
    delete: 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400',
    login: 'bg-slate-50 dark:bg-slate-700 text-slate-600 dark:text-slate-400',
    close_month: 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400',
    collect: 'bg-teal-50 dark:bg-teal-900/20 text-teal-600 dark:text-teal-400',
  };

  const entityLabels: Record<string, string> = {
    policy: 'وثيقة', client: 'عميل', user: 'مستخدم', collection: 'تحصيل', target: 'تارجت', task: 'مهمة',
  };

  const filtered = logs.filter(log => {
    const matchSearch = !search || (log.user as any)?.full_name?.includes(search) || log.entity_type.includes(search);
    const matchAction = !filterAction || log.action === filterAction;
    return matchSearch && matchAction;
  });

  if (loading) return <LoadingSpinner />;

  return (
    <div>
      <PageHeader title="سجل العمليات" description="متابعة جميع العمليات" icon={ClipboardList} />

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث..."
            className="w-full pr-10 pl-4 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white placeholder-slate-400 focus:ring-2 focus:ring-blue-500" />
        </div>
        <select value={filterAction} onChange={(e) => setFilterAction(e.target.value)}
          className="px-4 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500">
          <option value="">كل العمليات</option>
          {Object.entries(actionLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      <div className="space-y-2">
        {filtered.map(log => (
          <div key={log.id} className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-100 dark:border-slate-700">
            <div className="flex items-center gap-3">
              <span className={`px-2.5 py-1 rounded-lg text-xs font-medium ${actionColors[log.action] || actionColors.create}`}>
                {actionLabels[log.action] || log.action}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-slate-900 dark:text-white">
                  <span className="font-medium">{(log.user as any)?.full_name}</span>
                  {' - '}
                  <span className="text-slate-500">{entityLabels[log.entity_type] || log.entity_type}</span>
                </p>
              </div>
              <span className="text-xs text-slate-400">{formatDateTime(log.created_at)}</span>
            </div>
          </div>
        ))}
        {filtered.length === 0 && <div className="text-center py-12 text-slate-400">لا توجد عمليات مسجلة</div>}
      </div>
    </div>
  );
}
