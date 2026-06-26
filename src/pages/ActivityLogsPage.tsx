import { useEffect, useState } from 'react';
import { supabase, type ActivityLog } from '../lib/supabase';
import type { PageProps } from '../types';
import { BookOpen, Search, Clock, User, FileText, ArrowDownLeft, ArrowUpRight, UserPlus, Edit3, Ban } from 'lucide-react';

export default function ActivityLogsPage({}: PageProps) {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetchLogs();
  }, []);

  const fetchLogs = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('activity_logs')
      .select('*, users(full_name)')
      .order('created_at', { ascending: false })
      .limit(200);
    setLogs((data as unknown as ActivityLog[]) || []);
    setLoading(false);
  };

  const filteredLogs = logs.filter((log) =>
    log.action.toLowerCase().includes(search.toLowerCase()) ||
    log.entity_type.toLowerCase().includes(search.toLowerCase()) ||
    (log as unknown as { users?: { full_name: string } }).users?.full_name?.toLowerCase().includes(search.toLowerCase())
  );

  const getActionLabel = (action: string) => {
    const labels: Record<string, string> = {
      collection_created: 'تحصيل جديد',
      collection_deleted: 'تراجع عن تحصيل',
      policy_created: 'وثيقة جديدة',
      policy_updated: 'تعديل وثيقة',
      client_created: 'عميل جديد',
      client_updated: 'تعديل عميل',
    };
    return labels[action] || action;
  };

  const getActionIcon = (action: string) => {
    if (action.includes('created')) return ArrowUpRight;
    if (action.includes('deleted')) return Ban;
    if (action.includes('updated')) return Edit3;
    return FileText;
  };

  const getActionBadgeClass = (action: string) => {
    if (action.includes('created')) return 'badge-success';
    if (action.includes('deleted')) return 'badge-danger';
    if (action.includes('updated')) return 'badge-warning';
    return 'badge-info';
  };

  return (
    <div className="space-y-5">
      {/* Page Header */}
      <div className="page-header">
        <h2 className="page-title">سجل العمليات</h2>
        <p className="page-subtitle">تتبع جميع العمليات في النظام</p>
      </div>

      {/* Search */}
      <div className="search-bar">
        <Search className="search-bar-icon" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="بحث في السجل..."
          className="input-field"
        />
      </div>

      {/* Mobile Cards */}
      <div className="sm:hidden space-y-3">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin w-8 h-8 border-2 border-emerald-600 border-t-transparent rounded-full" />
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="empty-state">
            <BookOpen className="empty-state-icon" />
            <p>لا توجد عمليات مسجلة</p>
          </div>
        ) : (
          filteredLogs.map((log) => {
            const ActionIcon = getActionIcon(log.action);
            return (
              <div key={log.id} className="card-hover">
                <div className="flex items-start gap-3">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                    log.action.includes('created') ? 'bg-emerald-100 text-emerald-700' :
                    log.action.includes('deleted') ? 'bg-red-100 text-red-700' :
                    log.action.includes('updated') ? 'bg-amber-100 text-amber-700' :
                    'bg-sky-100 text-sky-700'
                  }`}>
                    <ActionIcon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className={`badge ${getActionBadgeClass(log.action)}`}>
                        {getActionLabel(log.action)}
                      </span>
                      <span className="text-xs text-slate-400 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {new Date(log.created_at).toLocaleDateString('ar-EG')}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-slate-600 mb-1">
                      <User className="w-3.5 h-3.5 text-slate-400" />
                      {(log as unknown as { users?: { full_name: string } }).users?.full_name || 'نظام'}
                    </div>
                    <div className="flex items-center gap-2 text-sm text-slate-500">
                      <FileText className="w-3.5 h-3.5 text-slate-400" />
                      {log.entity_type}
                    </div>
                    {log.details && (
                      <p className="text-xs text-slate-400 mt-2 bg-slate-50 p-2 rounded-lg">
                        {JSON.stringify(log.details).slice(0, 120)}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Desktop Table */}
      <div className="hidden sm:block card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin w-8 h-8 border-2 border-emerald-600 border-t-transparent rounded-full" />
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="empty-state">
            <BookOpen className="empty-state-icon" />
            <p>لا توجد عمليات مسجلة</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="table-header">التاريخ</th>
                  <th className="table-header">المستخدم</th>
                  <th className="table-header">العملية</th>
                  <th className="table-header">النوع</th>
                  <th className="table-header">التفاصيل</th>
                </tr>
              </thead>
              <tbody>
                {filteredLogs.map((log) => {
                  const ActionIcon = getActionIcon(log.action);
                  return (
                    <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                      <td className="table-cell">
                        <div className="flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-slate-400" />
                          {new Date(log.created_at).toLocaleDateString('ar-EG')}
                        </div>
                      </td>
                      <td className="table-cell">
                        <div className="flex items-center gap-1.5">
                          <User className="w-3.5 h-3.5 text-slate-400" />
                          {(log as unknown as { users?: { full_name: string } }).users?.full_name || 'نظام'}
                        </div>
                      </td>
                      <td className="table-cell">
                        <span className={`badge ${getActionBadgeClass(log.action)}`}>
                          <ActionIcon className="w-3 h-3" />
                          {getActionLabel(log.action)}
                        </span>
                      </td>
                      <td className="table-cell">
                        <div className="flex items-center gap-1.5">
                          <FileText className="w-3.5 h-3.5 text-slate-400" />
                          {log.entity_type}
                        </div>
                      </td>
                      <td className="table-cell text-xs">
                        {log.details ? JSON.stringify(log.details).slice(0, 100) : '-'}
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
