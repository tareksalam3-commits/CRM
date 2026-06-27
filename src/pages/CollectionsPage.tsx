import { useEffect, useState } from 'react';
import { supabase, type Collection, type Installment, type User } from '../lib/supabase';
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

  useEffect(() => {
    fetchDueInstallments();
    fetchCollections();
    fetchCollectors();
  }, []);

  const fetchDueInstallments = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('installments')
      .select('*, policies(policy_number, client_id, agent_id, clients(full_name))')
      .eq('status', 'due')
      .order('due_date', { ascending: true });
    
    // Transform data to match DueInstallment interface if needed
    const transformedData = (data as any[])?.map(inst => ({
      ...inst,
      clients: inst.policies?.clients // Map nested client data to top level for UI compatibility
    })) || [];

    setDueInstallments(transformedData as DueInstallment[]);
    setLoading(false);
  };

  const fetchCollections = async () => {
    const { data } = await supabase
      .from('collections')
      .select('*, policies(policy_number, clients(full_name)), users(full_name)')
      .order('created_at', { ascending: false });
    
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
    const { data } = await supabase.from('users').select('*').eq('is_active', true);
    setCollectors((data as User[]) || []);
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
            <div className="grid grid-cols-3 gap-2 mb-2">
              <div className="p-3 bg-slate-50 rounded-xl text-center">
                <span className="text-[10px] text-slate-500 block">الوثيقة</span>
                <span className="text-sm font-bold text-slate-900">{selectedInstallment.policies?.policy_number}</span>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl text-center">
                <span className="text-[10px] text-slate-500 block">العميل</span>
                <span className="text-sm font-bold text-slate-900">{selectedInstallment.clients?.full_name}</span>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl text-center">
                <span className="text-[10px] text-slate-500 block">المبلغ</span>
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
              <div key={inst.id} className="card-hover border-l-4 border-l-amber-400">
                <div className="flex items-start gap-3">
                  <div className="w-12 h-12 bg-amber-100 rounded-2xl flex items-center justify-center shrink-0">
                    <Receipt className="w-6 h-6 text-amber-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="badge badge-warning">قسط {inst.installment_number}</span>
                      <span className="text-xs text-slate-400">السنة {inst.insurance_year}</span>
                    </div>
                    <p className="font-bold text-slate-900 text-base mt-1">{inst.policies?.policy_number}</p>
                    <p className="text-sm text-slate-500">{inst.clients?.full_name}</p>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-slate-400">
                      <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{new Date(inst.due_date).toLocaleDateString('ar-EG')}</span>
                      <span className="flex items-center gap-1"><DollarSign className="w-3 h-3" />{inst.amount.toLocaleString()}</span>
                    </div>
                  </div>
                  <button onClick={() => openCollectForm(inst)} className="btn-primary text-xs py-2 px-3 shrink-0">
                    <DollarSign className="w-4 h-4" /> تحصيل
                  </button>
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
              const isExpanded = expandedItem === coll.id;
              const policyNum = (coll as unknown as { policies?: { policy_number: string } }).policies?.policy_number || '-';
              const clientName = (coll as unknown as { clients?: { full_name: string } }).clients?.full_name || '-';
              const collectorName = (coll as unknown as { users?: { full_name: string } }).users?.full_name || '-';
              return (
                <div key={coll.id} className="card-hover border-l-4 border-l-emerald-400">
                  <div className="flex items-start gap-3">
                    <div className="w-12 h-12 bg-emerald-100 rounded-2xl flex items-center justify-center shrink-0">
                      <DollarSign className="w-6 h-6 text-emerald-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="badge badge-success">تم التحصيل</span>
                      </div>
                      <p className="font-bold text-slate-900 text-base mt-1">{policyNum}</p>
                      <p className="text-sm text-slate-500">{clientName}</p>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-slate-400">
                        <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{new Date(coll.collection_date).toLocaleDateString('ar-EG')}</span>
                        <span className="flex items-center gap-1"><DollarSign className="w-3 h-3" />{coll.amount.toLocaleString()}</span>
                        <span className="flex items-center gap-1"><UserCircle className="w-3 h-3" />{collectorName}</span>
                      </div>
                    </div>
                    <button onClick={() => setExpandedItem(isExpanded ? null : coll.id)} className="btn-icon">
                      {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                    </button>
                  </div>
                  {isExpanded && (
                    <div className="mt-3 pt-3 border-t border-slate-50 flex justify-end">
                      <button onClick={() => handleUndoCollection(coll.id)} className="btn-danger text-sm">
                        <RotateCcw className="w-4 h-4" /> تراجع عن التحصيل
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )
      )}
    </div>
  );
}
