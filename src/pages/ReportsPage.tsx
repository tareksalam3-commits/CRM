import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Card, CardHeader, Button, Select } from '../components/ui';
import { BarChart3, FileText, Users, DollarSign, Download } from 'lucide-react';

export default function ReportsPage() {
  const [reportType, setReportType] = useState('summary');
  const [dateRange, setDateRange] = useState('month');
  const [branchFilter, setBranchFilter] = useState('');
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [reportData, setReportData] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    fetchBranches();
  }, []);

  const fetchBranches = async () => {
    const { data } = await supabase.from('branches').select('id, name').eq('is_active', true);
    if (data) setBranches(data);
  };

  const generateReport = async () => {
    setLoading(true);
    const now = new Date();
    let startDate: Date;
    let endDate = now;

    switch (dateRange) {
      case 'week':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case 'quarter':
        startDate = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
        break;
      case 'year':
        startDate = new Date(now.getFullYear(), 0, 1);
        break;
      default:
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    }

    let query = supabase.from('policies').select('*', { count: 'exact' }).gte('issue_date', startDate.toISOString().split('T')[0]).lte('issue_date', endDate.toISOString().split('T')[0]);

    if (branchFilter) {
      query = query.eq('branch_id', branchFilter);
    }

    const { count: policyCount, data: policies } = await query;
    const totalPremium = policies?.reduce((sum, p) => sum + Number(p.premium_amount), 0) || 0;

    const collectionQuery = supabase.from('collections').select('*', { count: 'exact' }).eq('status', 'paid').gte('payment_date', startDate.toISOString().split('T')[0]).lte('payment_date', endDate.toISOString().split('T')[0]);

    const { count: collectionCount, data: collections } = branchFilter ? await collectionQuery.eq('branch_id', branchFilter) : await collectionQuery;
    const totalCollected = collections?.reduce((sum, c) => sum + Number(c.amount), 0) || 0;

    const clientsQuery = supabase.from('clients').select('*', { count: 'exact' }).gte('created_at', startDate.toISOString()).lte('created_at', endDate.toISOString());

    const { count: clientCount } = branchFilter ? await clientsQuery.eq('branch_id', branchFilter) : await clientsQuery;

    setReportData({
      period: `${startDate.toLocaleDateString('ar-SA')} - ${endDate.toLocaleDateString('ar-SA')}`,
      policies: policyCount || 0,
      totalPremium,
      collections: collectionCount || 0,
      totalCollected,
      newClients: clientCount || 0,
      policiesList: policies?.slice(0, 10) || [],
    });

    setLoading(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">التقارير</h1>
          <p className="text-gray-500 mt-1">تقارير الأداء والإحصائيات</p>
        </div>
      </div>

      <Card>
        <CardHeader title="إعدادات التقرير" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-4">
          <Select
            label="نوع التقرير"
            value={reportType}
            onChange={(e) => setReportType(e.target.value)}
            options={[
              { value: 'summary', label: 'ملخص الأداء' },
              { value: 'policies', label: 'الوثائق' },
              { value: 'collections', label: 'التحصيل' },
              { value: 'agents', label: 'الوكلاء' },
            ]}
          />
          <Select
            label="الفترة الزمنية"
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            options={[
              { value: 'week', label: 'أسبوع' },
              { value: 'month', label: 'شهر' },
              { value: 'quarter', label: 'ربع سنة' },
              { value: 'year', label: 'سنة' },
            ]}
          />
          <Select
            label="الفرع"
            value={branchFilter}
            onChange={(e) => setBranchFilter(e.target.value)}
            options={[
              { value: '', label: 'كل الفروع' },
              ...branches.map((b) => ({ value: b.id, label: b.name })),
            ]}
          />
          <div className="flex items-end">
            <Button onClick={generateReport} loading={loading}>
              <BarChart3 className="w-4 h-4" />
              إنشاء التقرير
            </Button>
          </div>
        </div>
      </Card>

      {reportData && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-blue-500 text-white rounded-xl">
                  <FileText className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-sm text-blue-600">الوثائق الجديدة</p>
                  <p className="text-2xl font-bold text-blue-900">{reportData.policies as number}</p>
                </div>
              </div>
            </Card>

            <Card className="bg-gradient-to-br from-green-50 to-green-100 border-green-200">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-green-500 text-white rounded-xl">
                  <DollarSign className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-sm text-green-600">إجمالي الأقساط</p>
                  <p className="text-2xl font-bold text-green-900">{(reportData.totalPremium as number).toLocaleString()} ر.س</p>
                </div>
              </div>
            </Card>

            <Card className="bg-gradient-to-br from-yellow-50 to-yellow-100 border-yellow-200">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-yellow-500 text-white rounded-xl">
                  <DollarSign className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-sm text-yellow-600">المحصل</p>
                  <p className="text-2xl font-bold text-yellow-900">{(reportData.totalCollected as number).toLocaleString()} ر.س</p>
                </div>
              </div>
            </Card>

            <Card className="bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-purple-500 text-white rounded-xl">
                  <Users className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-sm text-purple-600">عملاء جدد</p>
                  <p className="text-2xl font-bold text-purple-900">{reportData.newClients as number}</p>
                </div>
              </div>
            </Card>
          </div>

          <Card>
            <CardHeader title="تفاصيل التقرير" subtitle={reportData.period as string} action={
              <Button variant="secondary" size="sm">
                <Download className="w-4 h-4" />
                تصدير
              </Button>
            } />
            <div className="mt-4 text-gray-500">
              <p>الفترة: {reportData.period}</p>
              <p>عدد التحصيلات: {reportData.collections}</p>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
