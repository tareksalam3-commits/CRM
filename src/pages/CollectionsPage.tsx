import { useEffect, useState } from 'react';
import { supabase, type Collection, type Installment, type User, type Policy } from '../lib/supabase';
import { useAuthContext } from '../contexts/AuthContext';
import type { PageProps } from '../types';
import {
  Receipt, X, Check, Search, RotateCcw, DollarSign, Clock, Calendar,
  FileText, UserCircle, ChevronDown, ChevronUp, TrendingUp, AlertCircle,
} from 'lucide-react';

interface DueInstallment extends Installment {
  policies?: { policy_number: string; client_id: string; agent_id: string };
  clients?: { full_name: string };
}

interface PolicyDetail extends Policy {
  clients?: { full_name: string };
  all_installments?: Installment[];
}

export default function CollectionsPage({ showSuccess, showError }: PageProps) {
  const { user: currentUser } = useAuthContext();
  const [dueInstallments, setDueInstallments] = useState<DueInstallment[]>([]);
  const [overduInstallments, setOverdueInstallments] = useState<DueInstallment[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [collectors, setCollectors] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [selectedInstallment, setSelectedInstallment] = useState<DueInstallment | null>(null);
  const [search, setSearch] = useState('');
  const [collectionDate, setCollectionDate] = useState(new Date().toISOString().split('T')[0]);
  const [collectorId, setCollectorId] = useState('');
  const [notes, setNotes] = useState('');
  const [activeTab, setActiveTab] = useState<'current' | 'overdue' | 'collected'>('current');
  const [expandedItem, setExpandedItem] = useState<string | null>(null);
  const [stats, setStats] = useState({ totalDue: 0, totalCollected: 0, todayCollected: 0, overdueDue: 0 });
  const [showPolicyModal, setShowPolicyModal] = useState(false);
  const [selectedPolicy, setSelectedPolicy] = useState<PolicyDetail | null>(null);
  const [policyInstallments, setPolicyInstallments] = useState<Installment[]>([]);

  useEffect(() => {
    if (currentUser) {
      fetchDueInstallments();
      fetchCollections();
      fetchCollectors();
    }
  }, [currentUser]);

  // الحصول على نطاق الشهر الحالي
  const getCurrentMonthRange = () => {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return {
      start: startOfMonth.toISOString().split('T')[0],
      end: endOfMonth.toISOString().split('T')[0],
      currentDate: now.toISOString().split('T')[0]
    };
  };

  // الحصول على نطاق الشهر السابق
  const getPreviousMonthRange = () => {
    const now = new Date();
    const startOfPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfPrevMonth = new Date(now.getFullYear(), now.getMonth(), 0);
    return {
      start: startOfPrevMonth.toISOString().split('T')[0],
      end: endOfPrevMonth.toISOString().split('T')[0]
    };
  };

  const fetchDueInstallments = async () => {
    setLoading(true);
    if (!currentUser) return;
    
    const { getAccessibleUserIds } = await import('../lib/permissions');
    const accessibleIds = await getAccessibleUserIds(currentUser);
    const monthRange = getCurrentMonthRange();
    const prevMonthRange = getPreviousMonthRange();
    
    // الحصول على الوثائق المتاحة
    let policiesQuery = supabase.from('policies').select('id').order('created_at', { ascending: false });
    if (accessibleIds.length > 0) {
      policiesQuery = policiesQuery.in('agent_id', accessibleIds);
    }
    const { data: accessiblePolicies } = await policiesQuery;
    const policyIds = accessiblePolicies?.map(p => p.id) || [];
    
    // الأقساط المستحقة في الشهر الحالي
    let currentMonthQuery = supabase
      .from('installments')
      .select('*, policies(policy_number, client_id, agent_id, clients(full_name))')
      .eq('status', 'due')
      .eq('insurance_year', 1)
      .gte('due_date', monthRange.start)
      .lte('due_date', monthRange.end)
      .order('due_date', { ascending: true });
    
    if (policyIds.length > 0) {
      currentMonthQuery = currentMonthQuery.in('policy_id', policyIds);
    }
    
    const { data: currentData } = await currentMonthQuery;
    
    // الأقساط المتأخرة من الشهر السابق فقط
    let overdueQuery = supabase
      .from('installments')
      .select('*, policies(policy_number, client_id, agent_id, clients(full_name))')
      .eq('status', 'due')
      .eq('insurance_year', 1)
      .gte('due_date', prevMonthRange.start)
      .lte('due_date', prevMonthRange.end)
      .order('due_date', { ascending: true });
    
    if (policyIds.length > 0) {
      overdueQuery = overdueQuery.in('policy_id', policyIds);
    }
    
    const { data: overdueData } = await overdueQuery;
    
    // تحويل البيانات
    const transformCurrent = (currentData as any[])?.map(inst => ({
      ...inst,
      clients: inst.policies?.clients
    })) || [];
    
    const transformOverdue = (overdueData as any[])?.map(inst => ({
      ...inst,
      clients: inst.policies?.clients
    })) || [];

    setDueInstallments(transformCurrent as DueInstallment[]);
    setOverdueInstallments(transformOverdue as DueInstallment[]);
    setLoading(false);
  };

  const fetchCollections = async () => {
    if (!currentUser) return;
    
    const { getAccessibleUserIds } = await import('../lib/permissions');
    const accessibleIds = await getAccessibleUserIds(currentUser);
    const monthRange = getCurrentMonthRange();
    
    // الحصول على الوثائق المتاحة
    let policiesQuery = supabase.from('policies').select('id');
    if (accessibleIds.length > 0) {
      policiesQuery = policiesQuery.in('agent_id', accessibleIds);
    }
    const { data: accessiblePolicies } = await policiesQuery;
    const policyIds = accessiblePolicies?.map(p => p.id) || [];
    
    // التحصيلات في الشهر الحالي فقط
    let query = supabase
      .from('collections')
      .select('*, policies(policy_number, clients(full_name)), users(full_name)')
      .gte('collection_date', monthRange.start)
      .lte('collection_date', monthRange.end)
      .order('created_at', { ascending: false });
    
    if (policyIds.length > 0) {
      query = query.in('policy_id', policyIds);
    }
    
    const { data } = await query;
    
    const transformedData = (data as any[])?.map(coll => ({
      ...coll,
      clients: coll.policies?.clients
    })) || [];

    setCollections(transformedData as Collection[]);

    // حساب الإحصائيات
    const totalDue = dueInstallments.reduce((s, i) => s + (i.amount || 0), 0);
    const totalOverdue = overduInstallments.reduce((s, i) => s + (i.amount || 0), 0);
    const totalColl = (data as unknown as Collection[])?.reduce((s, c) => s + (c.amount || 0), 0) || 0;
    const today = new Date().toISOString().split('T')[0];
    const todayColl = (data as unknown as Collection[])?.filter((c: unknown) => (c as Collection).collection_date === today).reduce((s, c) => s + (c.amount || 0), 0) || 0;
    setStats({ totalDue, totalCollected: totalColl, todayCollected: todayColl, overdueDue: totalOverdue });
  };

  const fetchCollectors = async () => {
    if (!currentUser) return;
    
    const { getAccessibleUserIds } = await import('../lib/permissions');
    const accessibleIds = await getAccessibleUserIds(currentUser);
    
    let query = supabase.from('users').select('*').eq('is_active', true);
    if (accessibleIds.length > 0) {
      query = query.in('id', accessibleIds);
    }
    
    const { data } = await query;
    setCollectors((data as User[]) || []);
  };

  const fetchPolicyInstallments = async (policyId: string) => {
    try {
      const { data } = await supabase
        .from('installments')
        .select('*')
        .eq('policy_id', policyId)
        .eq('insurance_year', 1)
        .order('due_date', { ascending: true });
      
      setPolicyInstallments((data as Installment[]) || []);
    } catch (err) {
      showError('خطأ في جلب الأقساط');
    }
  };

  const openPolicyModal = async (inst: DueInstallment) => {
    try {
      const { data: policy } = await supabase
        .from('policies')
        .select('*, clients(full_name)')
        .eq('id', inst.policy_id)
        .single();
      
      if (policy) {
        setSelectedPolicy(policy as PolicyDetail);
        await fetchPolicyInstallments(inst.policy_id);
        setShowPolicyModal(true);
      }
    } catch (err) {
      showError('خطأ في جلب بيانات الوثيقة');
    }
  };

  const handleCollect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInstallment || !collectorId) return;
    try {
      const { error } = await supabase.from('collections').insert({
        installment_id: selectedInstallment.id,
        policy_id: selectedInstallment.policy_id,
        client_id: selectedInstallment.policies?.client_id || '',
        collector_id: collectorId,
        collection_date: collectionDate,
        amount: selectedInstallment.amount,
        notes: notes || null,
      });
      if (error) throw error;
      setShowForm(false); setSelectedInstallment(null); setCollectorId(''); setNotes('');
      fetchDueInstallments(); fetchCollections();
      showSuccess('تم التحصيل بنجاح');
    } catch (err: unknown) { showError(err instanceof Error ? err.message : 'حدث خطأ'); }
  };

  const handleCollectFromModal = async (installment: Installment) => {
    setSelectedInstallment({
      ...installment,
      policies: selectedPolicy ? { 
        policy_number: (selectedPolicy as any).policy_number, 
        client_id: (selectedPolicy as any).client_id, 
        agent_id: (selectedPolicy as any).agent_id 
      } : undefined,
      clients: selectedPolicy?.clients
    } as DueInstallment);
    setCollectorId(currentUser?.id || '');
    setCollectionDate(new Date().toISOString().split('T')[0]);
    setNotes('');
    setShowForm(true);
  };

  const handleUndoCollection = async (collectionId: string) => {
    if (!confirm('هل أنت متأكد من التراجع عن هذا التحصيل؟')) return;
    try {
      const { error } = await supabase.from('collections').delete().eq('id', collectionId);
      if (error) throw error;
      fetchDueInstallments(); fetchCollections();
      showSuccess('تم التراجع عن التحصيل');
    } catch (err: unknown) { showError(err instanceof Error ? err.message : 'حدث خطأ'); }
  };

  const openCollectForm = (inst: DueInstallment) => {
    setSelectedInstallment(inst);
    setCollectorId(currentUser?.id || '');
    setCollectionDate(new Date().toISOString().split('T')[0]);
    setNotes('');
    setShowForm(true);
  };

  const filteredDue = dueInstallments.filter((i) =>
    i.policies?.policy_number?.toLowerCase().includes(search.toLowerCase()) ||
    i.clients?.full_name?.toLowerCase().includes(search.toLowerCase())
  );

  const filteredOverdue = overduInstallments.filter((i) =>
    i.policies?.policy_number?.toLowerCase().includes(search.toLowerCase()) ||
    i.clients?.full_name?.toLowerCase().includes(search.toLowerCase())
  );

  const filteredCollections = collections.filter((c) =>
    (c as unknown as { policies?: { policy_number: string } }).policies?.policy_number?.toLowerCase().includes(search.toLowerCase()) ||
    (c as unknown as { clients?: { full_name: string } }).clients?.full_name?.toLowerCase().includes(search.toLowerCase())
  );

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('ar-EG', {
      style: 'currency',
      currency: 'EGP'
    }).format(amount);
  };

  return (
    <div className="space-y-5">
      <div className="page-header flex items-center justify-between">
        <div>
          <h2 className="page-title">التحصيل</h2>
          <p className="page-subtitle">إدارة تحصيل الأقساط</p>
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="card p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-600">الأقساط المستحقة</span>
            <DollarSign className="w-5 h-5 text-blue-600" />
          </div>
          <p className="text-2xl font-bold text-slate-900">{formatCurrency(stats.totalDue)}</p>
          <p className="text-xs text-slate-500">{dueInstallments.length} قسط</p>
        </div>

        <div className="card p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-600">الأقساط المتأخرة</span>
            <AlertCircle className="w-5 h-5 text-red-600" />
          </div>
          <p className="text-2xl font-bold text-slate-900">{formatCurrency(stats.overdueDue)}</p>
          <p className="text-xs text-slate-500">{overduInstallments.length} قسط</p>
        </div>

        <div className="card p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-600">المحصل اليوم</span>
            <TrendingUp className="w-5 h-5 text-green-600" />
          </div>
          <p className="text-2xl font-bold text-slate-900">{formatCurrency(stats.todayCollected)}</p>
          <p className="text-xs text-slate-500">من إجمالي {formatCurrency(stats.totalCollected)}</p>
        </div>

        <div className="card p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-600">نسبة التحصيل</span>
            <Receipt className="w-5 h-5 text-purple-600" />
          </div>
          <p className="text-2xl font-bold text-slate-900">
            {stats.totalDue + stats.totalCollected > 0 
              ? ((stats.totalCollected / (stats.totalDue + stats.totalCollected)) * 100).toFixed(1)
              : '0'}%
          </p>
        </div>
      </div>

      {/* Search Bar */}
      <div className="search-bar">
        <Search className="search-bar-icon" />
        <input 
          type="text" 
          value={search} 
          onChange={(e) => setSearch(e.target.value)} 
          placeholder="بحث برقم الوثيقة أو اسم العميل..." 
          className="input-field" 
        />
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-slate-200">
        <button
          onClick={() => setActiveTab('current')}
          className={`px-4 py-3 font-medium text-sm border-b-2 transition ${
            activeTab === 'current'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          الأقساط المستحقة ({dueInstallments.length})
        </button>
        <button
          onClick={() => setActiveTab('overdue')}
          className={`px-4 py-3 font-medium text-sm border-b-2 transition ${
            activeTab === 'overdue'
              ? 'border-red-600 text-red-600'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          الأقساط المتأخرة ({overduInstallments.length})
        </button>
        <button
          onClick={() => setActiveTab('collected')}
          className={`px-4 py-3 font-medium text-sm border-b-2 transition ${
            activeTab === 'collected'
              ? 'border-green-600 text-green-600'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          المحصل ({collections.length})
        </button>
      </div>

      {/* Content */}
      {loading ? (
        <div className="text-center py-8">جاري التحميل...</div>
      ) : (
        <>
          {/* Current Month Installments */}
          {activeTab === 'current' && (
            <div className="space-y-3">
              {filteredDue.length === 0 ? (
                <div className="card p-8 text-center text-slate-500">
                  لا توجد أقساط مستحقة في الشهر الحالي
                </div>
              ) : (
                filteredDue.map((inst) => (
                  <div key={inst.id} className="card p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                          <Receipt className="w-5 h-5 text-blue-600" />
                        </div>
                        <div>
                          <p className="font-bold text-slate-900">{inst.policies?.policy_number}</p>
                          <p className="text-sm text-slate-600">{inst.clients?.full_name}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-slate-900">{formatCurrency(inst.amount || 0)}</p>
                        <p className="text-xs text-slate-500">
                          {new Date(inst.due_date).toLocaleDateString('ar-EG')}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => openCollectForm(inst)}
                        className="btn-primary flex-1 text-sm"
                      >
                        <Check className="w-4 h-4" /> تحصيل
                      </button>
                      <button
                        onClick={() => openPolicyModal(inst)}
                        className="btn-secondary flex-1 text-sm"
                      >
                        <Eye className="w-4 h-4" /> عرض الوثيقة
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Overdue Installments */}
          {activeTab === 'overdue' && (
            <div className="space-y-3">
              {filteredOverdue.length === 0 ? (
                <div className="card p-8 text-center text-slate-500">
                  لا توجد أقساط متأخرة
                </div>
              ) : (
                filteredOverdue.map((inst) => (
                  <div key={inst.id} className="card p-4 space-y-3 border-l-4 border-red-600">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                          <AlertCircle className="w-5 h-5 text-red-600" />
                        </div>
                        <div>
                          <p className="font-bold text-slate-900">{inst.policies?.policy_number}</p>
                          <p className="text-sm text-slate-600">{inst.clients?.full_name}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-slate-900">{formatCurrency(inst.amount || 0)}</p>
                        <p className="text-xs text-red-600">
                          متأخر منذ {new Date(inst.due_date).toLocaleDateString('ar-EG')}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => openCollectForm(inst)}
                        className="btn-primary flex-1 text-sm"
                      >
                        <Check className="w-4 h-4" /> تحصيل
                      </button>
                      <button
                        onClick={() => openPolicyModal(inst)}
                        className="btn-secondary flex-1 text-sm"
                      >
                        <Eye className="w-4 h-4" /> عرض الوثيقة
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Collections */}
          {activeTab === 'collected' && (
            <div className="space-y-3">
              {filteredCollections.length === 0 ? (
                <div className="card p-8 text-center text-slate-500">
                  لا توجد تحصيلات في الشهر الحالي
                </div>
              ) : (
                filteredCollections.map((coll) => (
                  <div key={coll.id} className="card p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                          <Check className="w-5 h-5 text-green-600" />
                        </div>
                        <div>
                          <p className="font-bold text-slate-900">
                            {(coll as unknown as { policies?: { policy_number: string } }).policies?.policy_number}
                          </p>
                          <p className="text-sm text-slate-600">
                            {(coll as unknown as { clients?: { full_name: string } }).clients?.full_name}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-slate-900">{formatCurrency(coll.amount || 0)}</p>
                        <p className="text-xs text-slate-500">
                          {new Date(coll.collection_date).toLocaleDateString('ar-EG')}
                        </p>
                      </div>
                    </div>
                    {coll.notes && (
                      <p className="text-sm text-slate-600 bg-slate-50 p-2 rounded">
                        ملاحظات: {coll.notes}
                      </p>
                    )}
                    <button
                      onClick={() => handleUndoCollection(coll.id)}
                      className="btn-secondary w-full text-sm"
                    >
                      <RotateCcw className="w-4 h-4" /> التراجع
                    </button>
                  </div>
                ))
              )}
            </div>
          )}
        </>
      )}

      {/* Collection Form Modal */}
      {showForm && (
        <>
          <div className="bottom-sheet-overlay" onClick={() => setShowForm(false)} />
          <div className="bottom-sheet p-5 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-lg font-extrabold text-slate-900">تحصيل قسط</h3>
              <button onClick={() => setShowForm(false)} className="btn-icon">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCollect} className="space-y-4 pb-8">
              <div className="p-3 bg-slate-50 rounded-xl">
                <p className="text-xs text-slate-600">الوثيقة</p>
                <p className="font-bold text-slate-900">{selectedInstallment?.policies?.policy_number}</p>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl">
                <p className="text-xs text-slate-600">المبلغ</p>
                <p className="font-bold text-slate-900">{formatCurrency(selectedInstallment?.amount || 0)}</p>
              </div>
              <div>
                <label className="label">المحصل *</label>
                <select 
                  value={collectorId} 
                  onChange={(e) => setCollectorId(e.target.value)} 
                  className="input-field" 
                  required
                >
                  <option value="">اختر المحصل</option>
                  {collectors.map((c) => (
                    <option key={c.id} value={c.id}>{c.full_name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">تاريخ التحصيل *</label>
                <input 
                  type="date" 
                  value={collectionDate} 
                  onChange={(e) => setCollectionDate(e.target.value)} 
                  className="input-field" 
                  required 
                />
              </div>
              <div>
                <label className="label">ملاحظات</label>
                <textarea 
                  value={notes} 
                  onChange={(e) => setNotes(e.target.value)} 
                  className="input-field" 
                  rows={3}
                  placeholder="أضف أي ملاحظات..."
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="btn-secondary flex-1">
                  إلغاء
                </button>
                <button type="submit" className="btn-primary flex-1">
                  <Check className="w-5 h-5" /> تحصيل
                </button>
              </div>
            </form>
          </div>
        </>
      )}

      {/* Policy Modal */}
      {showPolicyModal && selectedPolicy && (
        <>
          <div className="bottom-sheet-overlay" onClick={() => setShowPolicyModal(false)} />
          <div className="bottom-sheet p-5 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-lg font-extrabold text-slate-900">جميع أقساط الوثيقة</h3>
              <button onClick={() => setShowPolicyModal(false)} className="btn-icon">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-3">
              {policyInstallments.map((inst) => (
                <div key={inst.id} className="card p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-bold text-slate-900">
                        القسط #{inst.installment_number}
                      </p>
                      <p className="text-xs text-slate-600">
                        {new Date(inst.due_date).toLocaleDateString('ar-EG')}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-slate-900">{formatCurrency(inst.amount || 0)}</p>
                      <span className={`text-xs font-semibold ${
                        inst.status === 'collected' 
                          ? 'text-green-600' 
                          : 'text-slate-600'
                      }`}>
                        {inst.status === 'collected' ? 'محصل' : 'مستحق'}
                      </span>
                    </div>
                  </div>
                  {inst.status === 'due' && (
                    <button
                      onClick={() => {
                        handleCollectFromModal(inst);
                        setShowPolicyModal(false);
                      }}
                      className="btn-primary w-full text-sm"
                    >
                      <Check className="w-4 h-4" /> تحصيل هذا القسط
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
