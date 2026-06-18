import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { AuditLog, Profile } from '../../types';
import { formatDateTime } from '../../lib/utils';
import PageHeader from '../common/PageHeader';
import LoadingSpinner from '../common/LoadingSpinner';
import { ClipboardList, Search, ChevronDown } from 'lucide-react';

// FIX #AL1: Replaced limit(100) with pagination — 50/page with "تحميل المزيد"
const PAGE_SIZE = 50;

export default function AuditLogPage() {
  const [logs, setLogs]           = useState<AuditLog[]>([]);
  const [loading, setLoading]     = useState(true);
  const [loadingMore, setMore]    = useState(false);
  const [search, setSearch]       = useState('');
  const [filterAction, setAction] = useState('');
  const [page, setPage]           = useState(0);
  const [hasMore, setHasMore]     = useState(true);

  const loadLogs = useCallback(async (p = 0, append = false) => {
    if (p === 0) setLoading(true); else setMore(true);
    const { data } = await supabase
      .from('audit_logs')
      .select('*, user:profiles(full_name, role)')
      .order('created_at', { ascending: false })
      .range(p * PAGE_SIZE, (p + 1) * PAGE_SIZE - 1);
    if (data) {
      setLogs(prev => append ? [...prev, ...(data as unknown as AuditLog[])] : (data as unknown as AuditLog[]));
      setHasMore(data.length === PAGE_SIZE);
    }
    if (p === 0) setLoading(false); else setMore(false);
  }, []);

  useEffect(() => { loadLogs(0); }, [loadLogs]);

  async function loadMore() {
    const next = page + 1; setPage(next);
    await loadLogs(next, true);
  }

  const ACTION_LABELS: Record<string, string> = {
    create:'إنشاء', update:'تعديل', delete:'حذف',
    login:'تسجيل دخول', close_month:'تقفيل شهر', collect:'تحصيل',
  };
  const ACTION_COLORS: Record<string, string> = {
    create:      'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400',
    update:      'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400',
    delete:      'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400',
    login:       'bg-slate-50 dark:bg-slate-700 text-slate-600 dark:text-slate-400',
    close_month: 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400',
    collect:     'bg-teal-50 dark:bg-teal-900/20 text-teal-600 dark:text-teal-400',
  };
  const ENTITY_LABELS: Record<string, string> = {
    policy:'وثيقة', client:'عميل', user:'مستخدم',
    collection:'تحصيل', target:'تارجت', task:'مهمة',
  };

  const filtered = logs.filter(l =>
    (!search || (l.user as unknown as Profile)?.full_name?.includes(search) || l.entity_type.includes(search)) &&
    (!filterAction || l.action === filterAction)
  );

  if (loading) return <LoadingSpinner />;

  return (
    <div>
      <PageHeader title="سجل العمليات"
        description={`${filtered.length} عملية${hasMore && !search && !filterAction ? '+' : ''}`}
        icon={ClipboardList} />
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="بحث..." className="w-full pr-10 pl-4 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white placeholder-slate-400 focus:ring-2 focus:ring-blue-500" />
        </div>
        <select value={filterAction} onChange={e => setAction(e.target.value)}
          className="px-4 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500">
          <option value="">كل العمليات</option>
          {Object.entries(ACTION_LABELS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>
      <div className="space-y-2">
        {filtered.length === 0 && <p className="text-center text-slate-400 py-12">لا توجد عمليات</p>}
        {filtered.map(log => (
          <div key={log.id} className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-100 dark:border-slate-700">
            <div className="flex items-start gap-3">
              <span className={`px-2 py-1 rounded-lg text-xs font-medium shrink-0 ${ACTION_COLORS[log.action] || 'bg-slate-100 text-slate-600'}`}>
                {ACTION_LABELS[log.action] || log.action}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-slate-900 dark:text-white">
                  <span className="font-medium">{(log.user as unknown as Profile)?.full_name || 'محذوف'}</span>
                  {' — '}{ENTITY_LABELS[log.entity_type] || log.entity_type}
                </p>
                <p className="text-xs text-slate-400 mt-0.5">{formatDateTime(log.created_at)}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
      {hasMore && !search && !filterAction && (
        <div className="text-center mt-6">
          <button onClick={loadMore} disabled={loadingMore}
            className="flex items-center gap-2 mx-auto px-6 py-2.5 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 rounded-xl text-sm font-medium disabled:opacity-50 transition-colors">
            <ChevronDown className="w-4 h-4" />
            {loadingMore ? 'جاري التحميل...' : 'تحميل المزيد'}
          </button>
        </div>
      )}
    </div>
  );
}
