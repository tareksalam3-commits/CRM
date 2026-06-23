import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { formatCurrency } from '../../lib/utils';
import PageHeader from '../common/PageHeader';
import LoadingSpinner from '../common/LoadingSpinner';
import { History, Filter, Search, Download, Calendar } from 'lucide-react';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx';

interface AuditLog {
  id: string;
  user_id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  old_data: Record<string, unknown>;
  new_data: Record<string, unknown>;
  details: string;
  created_at: string;
  user?: {
    full_name: string;
  };
}

const ACTION_LABELS: Record<string, string> = {
  'CREATE_CLIENT': 'إنشاء عميل',
  'UPDATE_CLIENT': 'تعديل عميل',
  'DELETE_CLIENT': 'حذف عميل',
  'CREATE_POLICY': 'إنشاء وثيقة',
  'UPDATE_POLICY': 'تعديل وثيقة',
  'DELETE_POLICY': 'حذف وثيقة',
  'CREATE_COLLECTION': 'تسجيل تحصيل',
  'UPDATE_COLLECTION': 'تعديل تحصيل',
  'DELETE_COLLECTION': 'حذف تحصيل',
  'CREATE_USER': 'إنشاء مستخدم',
  'UPDATE_USER': 'تعديل مستخدم',
  'DELETE_USER': 'حذف مستخدم',
  'UPDATE_PASSWORD': 'تغيير كلمة المرور',
  'ACTIVATE_USER': 'تفعيل مستخدم',
  'DEACTIVATE_USER': 'تعطيل مستخدم',
};

const ENTITY_LABELS: Record<string, string> = {
  'client': 'عميل',
  'policy': 'وثيقة',
  'collection': 'تحصيل',
  'user': 'مستخدم',
};

export default function AuditLogViewer() {
  const { profile } = useAuth();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [entityFilter, setEntityFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('audit_logs')
        .select('*, user:profiles!user_id(full_name)')
        .order('created_at', { ascending: false })
        .limit(500);

      if (actionFilter) {
        query = query.eq('action', actionFilter);
      }

      if (entityFilter) {
        query = query.eq('entity_type', entityFilter);
      }

      if (dateFrom) {
        query = query.gte('created_at', `${dateFrom}T00:00:00`);
      }

      if (dateTo) {
        query = query.lte('created_at', `${dateTo}T23:59:59`);
      }

      const { data, error } = await query;

      if (error) {
        toast.error('خطأ في تحميل السجلات');
        console.error('Error:', error);
      } else if (data) {
        setLogs(data as AuditLog[]);
      }
    } catch (err) {
      console.error('Error fetching logs:', err);
      toast.error('حدث خطأ أثناء تحميل السجلات');
    } finally {
      setLoading(false);
    }
  }, [actionFilter, entityFilter, dateFrom, dateTo]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const filteredLogs = logs.filter(log => {
    const searchLower = search.toLowerCase();
    return (
      log.action.toLowerCase().includes(searchLower) ||
      log.entity_type.toLowerCase().includes(searchLower) ||
      log.details?.toLowerCase().includes(searchLower) ||
      log.user?.full_name.toLowerCase().includes(searchLower)
    );
  });

  const exportToExcel = () => {
    const data = filteredLogs.map(log => ({
      'التاريخ والوقت': new Date(log.created_at).toLocaleString('ar-EG'),
      'المستخدم': log.user?.full_name || 'Unknown',
      'العملية': ACTION_LABELS[log.action] || log.action,
      'نوع الكيان': ENTITY_LABELS[log.entity_type] || log.entity_type,
      'معرف الكيان': log.entity_id,
      'التفاصيل': log.details || '-',
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'سجل العمليات');
    XLSX.writeFile(wb, `audit_log_${new Date().toISOString().split('T')[0]}.xlsx`);
    toast.success('تم تصدير السجلات بنجاح');
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-6 pb-10">
      <PageHeader
        title="سجل العمليات"
        icon={History}
        description="تتبع جميع العمليات والتغييرات في النظام"
        actions={
          <button
            onClick={exportToExcel}
            disabled={filteredLogs.length === 0}
            className="px-4 py-2 bg-emerald-600 text-white rounded-xl flex items-center gap-2 hover:bg-emerald-700 disabled:opacity-50"
          >
            <Download className="w-4 h-4" /> تصدير Excel
          </button>
        }
      />

      {/* Filters */}
      <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          {/* Search */}
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">البحث</label>
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="ابحث..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pr-10 pl-4 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
          </div>

          {/* Action Filter */}
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">نوع العملية</label>
            <select
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              className="w-full p-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            >
              <option value="">الكل</option>
              {Object.entries(ACTION_LABELS).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </div>

          {/* Entity Filter */}
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">نوع الكيان</label>
            <select
              value={entityFilter}
              onChange={(e) => setEntityFilter(e.target.value)}
              className="w-full p-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            >
              <option value="">الكل</option>
              {Object.entries(ENTITY_LABELS).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </div>

          {/* Date From */}
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">من التاريخ</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full p-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>

          {/* Date To */}
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">إلى التاريخ</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full p-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={fetchLogs}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            تحديث
          </button>
          <button
            onClick={() => {
              setSearch('');
              setActionFilter('');
              setEntityFilter('');
              setDateFrom('');
              setDateTo('');
            }}
            className="px-4 py-2 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg text-sm font-medium hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors"
          >
            إعادة تعيين
          </button>
        </div>
      </div>

      {/* Logs Table */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          {filteredLogs.length > 0 ? (
            <table className="w-full text-right">
              <thead className="bg-slate-50 dark:bg-slate-900/50">
                <tr>
                  <th className="px-6 py-4 text-sm font-bold text-slate-600 dark:text-slate-300">التاريخ والوقت</th>
                  <th className="px-6 py-4 text-sm font-bold text-slate-600 dark:text-slate-300">المستخدم</th>
                  <th className="px-6 py-4 text-sm font-bold text-slate-600 dark:text-slate-300">العملية</th>
                  <th className="px-6 py-4 text-sm font-bold text-slate-600 dark:text-slate-300">نوع الكيان</th>
                  <th className="px-6 py-4 text-sm font-bold text-slate-600 dark:text-slate-300">التفاصيل</th>
                  <th className="px-6 py-4 text-sm font-bold text-slate-600 dark:text-slate-300 text-center">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {filteredLogs.map(log => (
                  <tr key={log.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-700/30 transition-colors">
                    <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-400">
                      {new Date(log.created_at).toLocaleString('ar-EG')}
                    </td>
                    <td className="px-6 py-4 text-sm font-medium text-slate-900 dark:text-white">
                      {log.user?.full_name || 'Unknown'}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <span className="px-2.5 py-1 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-full text-xs font-medium">
                        {ACTION_LABELS[log.action] || log.action}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <span className="px-2.5 py-1 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-full text-xs font-medium">
                        {ENTITY_LABELS[log.entity_type] || log.entity_type}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-400">
                      {log.details || '-'}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <button
                        onClick={() => setSelectedLog(log)}
                        className="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 text-sm font-medium"
                      >
                        عرض
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="flex flex-col items-center justify-center py-12">
              <History className="w-12 h-12 text-slate-300 mb-4" />
              <p className="text-slate-500 text-sm">لا توجد سجلات عمليات</p>
            </div>
          )}
        </div>
      </div>

      {/* Details Modal */}
      {selectedLog && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl w-full max-w-2xl shadow-xl overflow-hidden max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center bg-slate-50/50 dark:bg-slate-700/50">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">تفاصيل العملية</h3>
              <button
                onClick={() => setSelectedLog(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
              >
                ✕
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">التاريخ والوقت</p>
                  <p className="text-sm font-medium text-slate-900 dark:text-white">
                    {new Date(selectedLog.created_at).toLocaleString('ar-EG')}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">المستخدم</p>
                  <p className="text-sm font-medium text-slate-900 dark:text-white">
                    {selectedLog.user?.full_name || 'Unknown'}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">نوع العملية</p>
                  <p className="text-sm font-medium text-slate-900 dark:text-white">
                    {ACTION_LABELS[selectedLog.action] || selectedLog.action}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">نوع الكيان</p>
                  <p className="text-sm font-medium text-slate-900 dark:text-white">
                    {ENTITY_LABELS[selectedLog.entity_type] || selectedLog.entity_type}
                  </p>
                </div>
              </div>

              {selectedLog.details && (
                <div>
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">التفاصيل</p>
                  <p className="text-sm text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-900 p-3 rounded-lg">
                    {selectedLog.details}
                  </p>
                </div>
              )}

              {selectedLog.old_data && Object.keys(selectedLog.old_data).length > 0 && (
                <div>
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">البيانات القديمة</p>
                  <pre className="text-xs text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-900 p-3 rounded-lg overflow-auto max-h-40">
                    {JSON.stringify(selectedLog.old_data, null, 2)}
                  </pre>
                </div>
              )}

              {selectedLog.new_data && Object.keys(selectedLog.new_data).length > 0 && (
                <div>
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">البيانات الجديدة</p>
                  <pre className="text-xs text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-900 p-3 rounded-lg overflow-auto max-h-40">
                    {JSON.stringify(selectedLog.new_data, null, 2)}
                  </pre>
                </div>
              )}

              <button
                onClick={() => setSelectedLog(null)}
                className="w-full mt-4 px-4 py-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-lg font-medium transition-colors"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
