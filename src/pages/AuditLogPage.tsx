import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Card, CardHeader, Table, Badge, Select, Input } from '../components/ui';
import type { AuditLog } from '../types/database';
import { History, Search } from 'lucide-react';

export default function AuditLogPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [tableFilter, setTableFilter] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetchLogs();
  }, [tableFilter, actionFilter]);

  const fetchLogs = async () => {
    setLoading(true);
    let query = supabase
      .from('audit_log')
      .select('*, user:profiles(full_name)')
      .order('created_at', { ascending: false })
      .limit(100);

    if (tableFilter) {
      query = query.eq('table_name', tableFilter);
    }

    if (actionFilter) {
      query = query.eq('action', actionFilter);
    }

    const { data, error } = await query;
    if (!error && data) {
      setLogs(data);
    }
    setLoading(false);
  };

  const actionVariants: Record<string, 'success' | 'warning' | 'danger' | 'info'> = {
    insert: 'success',
    update: 'warning',
    delete: 'danger',
  };

  const actionLabels: Record<string, string> = {
    insert: 'إضافة',
    update: 'تعديل',
    delete: 'حذف',
  };

  const tableLabels: Record<string, string> = {
    profiles: 'المستخدمين',
    branches: 'الفروع',
    clients: 'العملاء',
    policies: 'الوثائق',
    collections: 'التحصيلات',
    targets: 'الأهداف',
  };

  const columns = [
    {
      key: 'created_at',
      header: 'التاريخ والوقت',
      render: (log: AuditLog) => new Date(log.created_at).toLocaleDateString('ar-SA', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }),
    },
    {
      key: 'action',
      header: 'العملية',
      render: (log: AuditLog) => (
        <Badge variant={actionVariants[log.action]}>{actionLabels[log.action]}</Badge>
      ),
    },
    {
      key: 'table_name',
      header: 'الجدول',
      render: (log: AuditLog) => (
        <div className="flex items-center gap-2">
          <History className="w-4 h-4 text-gray-400" />
          <span>{tableLabels[log.table_name] || log.table_name}</span>
        </div>
      ),
    },
    {
      key: 'user',
      header: 'المستخدم',
      render: (log: AuditLog) => log.user?.full_name || 'النظام',
    },
    {
      key: 'record_id',
      header: 'معرف السجل',
      render: (log: AuditLog) => (
        <code className="text-xs bg-gray-100 px-2 py-1 rounded">
          {log.record_id.slice(0, 8)}...
        </code>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">سجل العمليات</h1>
        <p className="text-gray-500 mt-1">تتبع جميع العمليات على النظام</p>
      </div>

      <div className="flex gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="البحث..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pr-10 pl-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <Select
          value={tableFilter}
          onChange={(e) => setTableFilter(e.target.value)}
          options={[
            { value: '', label: 'كل الجداول' },
            { value: 'profiles', label: 'المستخدمين' },
            { value: 'branches', label: 'الفروع' },
            { value: 'clients', label: 'العملاء' },
            { value: 'policies', label: 'الوثائق' },
            { value: 'collections', label: 'التحصيلات' },
          ]}
        />
        <Select
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          options={[
            { value: '', label: 'كل العمليات' },
            { value: 'insert', label: 'إضافة' },
            { value: 'update', label: 'تعديل' },
            { value: 'delete', label: 'حذف' },
          ]}
        />
      </div>

      <Card>
        <Table columns={columns} data={logs} loading={loading} />
      </Card>
    </div>
  );
}
