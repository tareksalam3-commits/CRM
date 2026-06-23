import { useCallback, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Installment, Policy } from '../types';

export interface InstallmentWithPolicy extends Installment {
  policy?: Policy;
}

/**
 * Hook for managing collections and installments
 */
export function useCollections() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Load installments with their policies
   */
  const loadInstallments = useCallback(async (filters?: {
    status?: string;
    month?: number;
    year?: number;
  }) => {
    setLoading(true);
    setError(null);

    try {
      let query = supabase
        .from('installments')
        .select('*, policy:policies(policy_number, client_id, agent_id, annual_premium, client:clients(name))');

      if (filters?.status) {
        query = query.eq('status', filters.status);
      }

      if (filters?.month && filters?.year) {
        const monthStart = `${filters.year}-${String(filters.month).padStart(2, '0')}-01`;
        const nextMonth = filters.month === 12 ? 1 : filters.month + 1;
        const nextYear = filters.month === 12 ? filters.year + 1 : filters.year;
        const monthEnd = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;

        query = query.gte('due_date', monthStart).lt('due_date', monthEnd);
      }

      const { data, error: err } = await query.order('due_date', { ascending: true });

      if (err) {
        setError(err.message);
        return { data: null, error: err };
      }

      return { data: data as InstallmentWithPolicy[], error: null };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'خطأ غير معروف';
      setError(message);
      return { data: null, error: message };
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Create a collection for an installment
   */
  const createCollection = useCallback(async (collectionData: {
    installment_id: string;
    policy_id: string;
    amount: number;
    collection_date: string;
    receipt_number?: string;
    collected_by: string;
    notes?: string;
  }) => {
    setLoading(true);
    setError(null);

    try {
      // Get the installment to check if it's the first one
      const { data: installment, error: installmentError } = await supabase
        .from('installments')
        .select('installment_number')
        .eq('id', collectionData.installment_id)
        .single();

      if (installmentError) {
        throw new Error(`خطأ في جلب بيانات القسط: ${installmentError.message}`);
      }

      // Determine if this is new business (first installment only)
      const is_new_business = installment?.installment_number === 1;

      // Insert the collection
      const { data: collection, error: collectionError } = await supabase
        .from('collections')
        .insert({
          ...collectionData,
          is_new_business,
        })
        .select()
        .single();

      if (collectionError) {
        throw new Error(`خطأ في إنشاء التحصيل: ${collectionError.message}`);
      }

      // Update installment status to paid
      const { error: updateError } = await supabase
        .from('installments')
        .update({
          status: 'paid',
          paid_date: collectionData.collection_date,
          updated_at: new Date().toISOString(),
        })
        .eq('id', collectionData.installment_id);

      if (updateError) {
        throw new Error(`خطأ في تحديث حالة القسط: ${updateError.message}`);
      }

      return { data: collection, error: null };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'خطأ غير معروف';
      setError(message);
      return { data: null, error: message };
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Get performance metrics for an agent
   */
  const getPerformanceMetrics = useCallback(async (agent_id: string, month: number, year: number) => {
    setLoading(true);
    setError(null);

    try {
      const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;
      const nextMonth = month === 12 ? 1 : month + 1;
      const nextYear = month === 12 ? year + 1 : year;
      const monthEnd = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;

      // Get all collections for this agent in this month
      const { data: collections, error: collectionsError } = await supabase
        .from('collections')
        .select('amount, is_new_business, policy:policies(agent_id)')
        .gte('collection_date', monthStart)
        .lt('collection_date', monthEnd)
        .eq('policy.agent_id', agent_id);

      if (collectionsError) {
        throw new Error(`خطأ في جلب التحصيلات: ${collectionsError.message}`);
      }

      // Calculate totals
      const newBusiness = collections
        ?.filter(c => c.is_new_business)
        .reduce((sum, c) => sum + Number(c.amount), 0) || 0;

      const collections_total = collections
        ?.filter(c => !c.is_new_business)
        .reduce((sum, c) => sum + Number(c.amount), 0) || 0;

      const total = newBusiness + collections_total;

      return {
        data: {
          new_business: newBusiness,
          collections: collections_total,
          total,
          count: collections?.length || 0,
        },
        error: null,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'خطأ غير معروف';
      setError(message);
      return { data: null, error: message };
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    loading,
    error,
    loadInstallments,
    createCollection,
    getPerformanceMetrics,
  };
}
