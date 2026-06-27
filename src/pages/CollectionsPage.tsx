import { useEffect, useState } from 'react';
import { supabase, type Collection, type Installment, type User, type Policy } from '../lib/supabase';
import { useAuthContext } from '../contexts/AuthContext';
import type { PageProps } from '../types';
import {
  Receipt, X, Check, Search, RotateCcw, DollarSign, Clock, Calendar,
  FileText, UserCircle, ChevronDown, ChevronUp, TrendingUp,
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
  const [collections, setCollections] = useState<Collection[]>([]);
  const [collectors, setCollectors] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [selectedInstallment, setSelectedInstallment] = useState<DueInstallment | null>(null);
  const [search, setSearch] = useState('');
  const [collectionDate, setCollectionDate] = useState(new Date().toISOString().split('T')[0]);
  const [collectorId, setCollectorId] = useState('');
  const [notes, setNotes] = useState('');
  const [activeTab, setActiveTab] = useState<'due' | 'collected'>('due');
  const [expandedItem, setExpandedItem] = useState<string | null>(null);
  const [stats, setStats] = useState({ totalDue: 0, totalCollected: 0, todayCollected: 0 });
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

  // Get current month range
  const getCurrentMonthRange = () => {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return {
      start: startOfMonth.toISOString().split('T')[0],
      end: endOfMonth.toISOString().split('T')[0]
    };
  };

  const fetchDueInstallments = async () => {
    setLoading(true);
    if (!currentUser) return;
    
    const { getAccessibleUserIds } = await import('../lib/permissions');
    const accessibleIds = await getAccessibleUserIds(currentUser);
    const monthRange = getCurrentMonthRange();
    
    // Get accessible policies
    let policiesQuery = supabase.from('policies').select('id').order('created_at', { ascending: false });
    if (accessibleIds.length > 0) {
      policiesQuery = policiesQuery.in('agent_id', accessibleIds);
    }
    const { data: accessiblePolicies } = await policiesQuery;
    const policyIds = accessiblePolicies?.map(p => p.id) || [];
    
    let query = supabase
      .from('installments')
      .select('*, policies(policy_number, client_id, agent_id, clients(full_name))')
      .eq('status', 'due')
      // Filter by current month or overdue (before current month)
      .lte('due_date', monthRange.end)
      .order('due_date', { ascending: true });
    
    if (policyIds.length > 0) {
      query = query.in('policy_id', policyIds);
    }
    
    const { data } = await query;
    
    // Transform data to match DueInstallment interface if needed
    const transformedData = (data as any[])?.map(inst => ({
      ...inst,
      clients: inst.policies?.clients // Map nested client data to top level for UI compatibility
    })) || [];

    setDueInstallments(transformedData as DueInstallment[]);
    setLoading(false);
  };

  const fetchCollections = async () => {
    if (!currentUser) return;
    
    const { getAccessibleUserIds } = await import('../lib/permissions');
    const accessibleIds = await getAccessibleUserIds(currentUser);
    
    // Get accessible policies
    let policiesQuery = supabase.from('policies').select('id');
    if (accessibleIds.length > 0) {
      policiesQuery = policiesQuery.in('agent_id', accessibleIds);
    }
    const { data: accessiblePolicies } = await policiesQuery;
    const policyIds = accessiblePolicies?.map(p => p.id) || [];
    
    let query = supabase
      .from('collections')
      .select('*, policies(policy_number, clients(full_name)), users(full_name)')
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

    // Calculate stats
    const totalDue = dueInstallments.reduce((s, i) => s + (i.amount || 0), 0);
    const totalColl = (data as unknown as Collection[])?.reduce((s, c) => s + (c.amount || 0), 0) || 0;
    const today = new Date().toISOString().split('T')[0];
    const todayColl = (data as unknown as Collection[])?.filter((c: unknown) => (c as Collection).collection_date === today).reduce((s, c) => s + (c.amount || 0), 0) || 0;
    setStats({ totalDue, totalCollected: totalColl, todayCollected: todayColl });
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
        .gte('due_date', new Date().toISOString().split('T')[0]) // Only future installments
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

  const filteredCollections = collections.filter((c) =>
    (c as unknown as { policies?: { policy_number: string } }).policies?.policy_number?.toLowerCase().includes(search.toLowerCase()) ||
    (c as unknown as { clients?: { full_name: string } }).clients?.full_name?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-5">
      <div className="page-header">
        <h2 className="page-title">التحصيل</h2>
        <p className="page-subtitle">إدارة تحصيل الأقساط</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="stat-card">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 bg-amber-100 rounded-xl flex items-center justify-center"><Clock className="w-4 h-4 text-amber-600" /></div>
            <span className="text-[10px] text-slate-500 font-medium">مستحق</span>
          </div>
          <p className="text-lg font-extrabold text-slate-900">{stats.totalDue.toLocaleString()}</p>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 bg-emerald-100 rounded-xl flex items-center justify-center"><TrendingUp className="w-4 h-4 text-emerald-600" /></div>
            <span className="text-[10px] text-slate-500 font-medium">إجمالي</span>
          </div>
          <p className="text-lg font-extrabold text-slate-900">{stats.totalCollected.toLocaleString()}</p>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 bg-blue-100 rounded-xl flex items-center justify-center"><DollarSign className="w-4 h-4 text-blue-600" /></div>
            <span className="text-[10px] text-slate-500 font-medium">اليوم</span>
          </div>
          <p className="text-lg font-extrabold text-slate-900">{stats.todayCollected.toLocaleString()}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        <button onClick={() => setActiveTab('due')} className={activeTab === 'due' ? 'tab-btn-active' : 'tab-btn-inactive'}>
          <Clock className="w-4 h-4 inline ml-1" /> الأقساط المستحقة
        </button>
        <button onClick={() => setActiveTab('collected')} className={activeTab === 'collected' ? 'tab-btn-active' : 'tab-btn-inactive'}>
          <Receipt className="w-4 h-4 inline ml-1" /> التحصيلات
        </button>
      </div>

      <div className="search-bar">
        <Search className="search-bar-icon" />
        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث..." className="input-field" />
      </div>

      {/* Collect Form Drawer */}
      {showForm && selectedInstallment && (
        <>
          <div className="bottom-sheet-overlay" onClick={() => setShowForm(false)} />
          <div className="bottom-sheet p-5 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-lg font-extrabold text-slate-900">تحصيل القسط</h3>
              <button onClick={() => setShowForm(false)} className="btn-icon"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-3 mb-2">
              <div className="p-3 bg-slate-50 rounded-xl">
                <span className="text-[10px] text-slate-500 block mb-1">الوثيقة</span>
                <span className="text-sm font-bold text-slate-900">{selectedInstallment.policies?.policy_number}</span>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl">
                <span className="text-[10px] text-slate-500 block mb-1">العميل</span>
                <span className="text-sm font-bold text-slate-900">{selectedInstallment.clients?.full_name}</span>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl">
                <span className="text-[10px] text-slate-500 block mb-1">المبلغ</span>
                <span className="text-sm font-bold text-emerald-700">{selectedInstallment.amount.toLocaleString()}</span>
              </div>
            </div>
            <form onSubmit={handleCollect} className="space-y-4 pb-8">
              <div>
                <label className="label">المحصل *</label>
                <select value={collectorId} onChange={(e) => setCollectorId(e.target.value)} className="input-field" required>
                  <option value="">اختر المحصل</option>
                  {collectors.map((c) => <option key={c.id} value={c.id}>{c.full_name}</option>)}
                </select>
              </div>
              <div>
                <label className="label">تاريخ التحصيل *</label>
                <input type="date" value={collectionDate} onChange={(e) => setCollectionDate(e.target.value)} className="input-field" required />
              </div>
              <div>
                <label className="label">ملاحظات</label>
                <input value={notes} onChange={(e) => setNotes(e.target.value)} className="input-field" />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="btn-secondary flex-1">إلغاء</button>
                <button type="submit" className="btn-primary flex-1"><Check className="w-5 h-5" /> تأكيد</button>
              </div>
            </form>
          </div>
        </>
      )}

      {/* Policy Details Modal */}
      {showPolicyModal && selectedPolicy && (
        <>
          <div className="bottom-sheet-overlay" onClick={() => setShowPolicyModal(false)} />
          <div className="bottom-sheet p-5 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-lg font-extrabold text-slate-900">الأقساط المستقبلية</h3>
              <button onClick={() => setShowPolicyModal(false)} className="btn-icon"><X className="w-5 h-5" /></button>
            </div>
            
            {/* Policy Info */}
            <div className="space-y-2 p-3 bg-slate-50 rounded-xl">
              <div className="flex justify-between items-start gap-2">
                <span className="text-xs text-slate-500 font-medium">رقم الوثيقة:</span>
                <span className="text-sm font-bold text-slate-900">{(selectedPolicy as any).policy_number}</span>
              </div>
              <div className="flex justify-between items-start gap-2">
                <span className="text-xs text-slate-500 font-medium">العميل:</span>
                <span className="text-sm font-bold text-slate-900">{selectedPolicy.clients?.full_name}</span>
              </div>
            </div>

            {/* Installments List */}
            <div className="space-y-3">
              <h4 className="text-sm font-bold text-slate-900">الأقساط المستقبلية:</h4>
              {policyInstallments.length === 0 ? (
                <div className="empty-state">
                  <Clock className="empty-state-icon" />
                  <p className="text-sm">لا توجد أقساط مستقبلية</p>
                </div>
              ) : (
                policyInstallments.map((inst) => (
                  <div key={inst.id} className="card-hover border-l-4 border-l-blue-400 p-3">
                    <div className="space-y-2">
                      <div className="flex justify-between items-start gap-2">
                        <span className="text-xs text-slate-500 font-medium">القسط:</span>
                        <span className="badge badge-info text-xs">قسط {inst.installment_number}</span>
                      </div>
                      <div className="flex justify-between items-start gap-2">
                        <span className="text-xs text-slate-500 font-medium">المبلغ:</span>
                        <span className="text-sm font-bold text-emerald-700">{inst.amount.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between items-start gap-2">
                        <span className="text-xs text-slate-500 font-medium">تاريخ الاستحقاق:</span>
                        <span className="text-sm font-bold text-slate-900">{new Date(inst.due_date).toLocaleDateString('ar-EG')}</span>
                      </div>
                      <div className="flex justify-between items-start gap-2">
                        <span className="text-xs text-slate-500 font-medium">الحالة:</span>
                        <span className={`badge ${inst.status === 'due' ? 'badge-warning' : 'badge-info'} text-xs`}>
                          {inst.status === 'due' ? 'مستحق' : 'مستقبلي'}
                        </span>
                      </div>
                      {inst.status === 'due' && (
                        <button 
                          onClick={() => {
                            handleCollectFromModal(inst);
                            setShowPolicyModal(false);
                          }}
                          className="btn-primary w-full mt-2 py-2 text-sm"
                        >
                          <DollarSign className="w-4 h-4" /> سداد
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}

      {/* Due Installments List */}
      {activeTab === 'due' && (
        loading ? (
          <div className="flex items-center justify-center py-20"><div className="animate-spin w-10 h-10 border-3 border-emerald-600 border-t-transparent rounded-full" /></div>
        ) : filteredDue.length === 0 ? (
          <div className="empty-state">
            <Clock className="empty-state-icon" />
            <p className="text-sm">لا توجد أقساط مستحقة</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredDue.map((inst) => (
              <div key={inst.id} className="card-hover border-l-4 border-l-amber-400 p-4">
                <div className="space-y-3">
                  {/* Header with icon */}
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center shrink-0">
                      <Receipt className="w-5 h-5 text-amber-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="badge badge-warning text-xs">قسط {inst.installment_number}</span>
                        <span className="text-xs text-slate-400">السنة {inst.insurance_year}</span>
                      </div>
                    </div>
                  </div>

                  {/* Data rows - vertical layout */}
                  <div className="space-y-2 pl-2 border-r-2 border-amber-200">
                    <div className="flex justify-between items-start gap-2">
                      <span className="text-xs text-slate-500 font-medium">اسم العميل:</span>
                      <span className="text-sm font-bold text-slate-900 text-right">{inst.clients?.full_name}</span>
                    </div>
                    <div className="flex justify-between items-start gap-2">
                      <span className="text-xs text-slate-500 font-medium">رقم الوثيقة:</span>
                      <span className="text-sm font-bold text-slate-900 text-right">{inst.policies?.policy_number}</span>
                    </div>
                    <div className="flex justify-between items-start gap-2">
                      <span className="text-xs text-slate-500 font-medium">قيمة القسط:</span>
                      <span className="text-sm font-bold text-emerald-700 text-right">{inst.amount.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between items-start gap-2">
                      <span className="text-xs text-slate-500 font-medium">تاريخ الاستحقاق:</span>
                      <span className="text-sm font-bold text-slate-900 text-right">{new Date(inst.due_date).toLocaleDateString('ar-EG')}</span>
                    </div>
                    <div className="flex justify-between items-start gap-2">
                      <span className="text-xs text-slate-500 font-medium">الحالة:</span>
                      <span className="badge badge-warning text-xs">مستحق</span>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-2 mt-3">
                    <button 
                      onClick={() => openPolicyModal(inst)} 
                      className="btn-secondary flex-1 py-2.5 text-sm"
                    >
                      <FileText className="w-4 h-4" /> تفاصيل الوثيقة
                    </button>
                    <button 
                      onClick={() => openCollectForm(inst)} 
                      className="btn-primary flex-1 py-2.5 text-sm"
                    >
                      <DollarSign className="w-4 h-4" /> تحصيل
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {/* Collections List */}
      {activeTab === 'collected' && (
        filteredCollections.length === 0 ? (
          <div className="empty-state">
            <Receipt className="empty-state-icon" />
            <p className="text-sm">لا توجد تحصيلات</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredCollections.map((coll) => {
              const policyNum = (coll as unknown as { policies?: { policy_number: string } }).policies?.policy_number || '-';
              const clientName = (coll as unknown as { clients?: { full_name: string } }).clients?.full_name || '-';
              const collectorName = (coll as unknown as { users?: { full_name: string } }).users?.full_name || '-';
              return (
                <div key={coll.id} className="card-hover border-l-4 border-l-emerald-400 p-4">
                  <div className="space-y-3">
                    {/* Header with icon */}
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center shrink-0">
                        <DollarSign className="w-5 h-5 text-emerald-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="badge badge-success text-xs">تم التحصيل</span>
                      </div>
                    </div>

                    {/* Data rows - vertical layout */}
                    <div className="space-y-2 pl-2 border-r-2 border-emerald-200">
                      <div className="flex justify-between items-start gap-2">
                        <span className="text-xs text-slate-500 font-medium">اسم العميل:</span>
                        <span className="text-sm font-bold text-slate-900 text-right">{clientName}</span>
                      </div>
                      <div className="flex justify-between items-start gap-2">
                        <span className="text-xs text-slate-500 font-medium">رقم الوثيقة:</span>
                        <span className="text-sm font-bold text-slate-900 text-right">{policyNum}</span>
                      </div>
                      <div className="flex justify-between items-start gap-2">
                        <span className="text-xs text-slate-500 font-medium">المبلغ:</span>
                        <span className="text-sm font-bold text-emerald-700 text-right">{coll.amount.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between items-start gap-2">
                        <span className="text-xs text-slate-500 font-medium">تاريخ التحصيل:</span>
                        <span className="text-sm font-bold text-slate-900 text-right">{new Date(coll.collection_date).toLocaleDateString('ar-EG')}</span>
                      </div>
                      <div className="flex justify-between items-start gap-2">
                        <span className="text-xs text-slate-500 font-medium">المحصل:</span>
                        <span className="text-sm font-bold text-slate-900 text-right">{collectorName}</span>
                      </div>
                    </div>

                    {/* Undo Button */}
                    <button 
                      onClick={() => handleUndoCollection(coll.id)} 
                      className="btn-secondary w-full mt-3 py-2.5 text-sm"
                    >
                      <RotateCcw className="w-4 h-4" /> تراجع
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}
    </div>
  );
}
