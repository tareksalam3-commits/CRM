import { supabase } from '../lib/supabase';

/**
 * Service for handling collections and installments business logic
 * Ensures proper separation between new business (first installment) and collections
 */

export interface CollectionData {
  installment_id: string;
  policy_id: string;
  amount: number;
  collection_date: string;
  receipt_number?: string;
  collected_by: string;
  notes?: string;
}

/**
 * Create a new collection
 * Automatically marks it as new business if it's the first installment
 */
export async function createCollection(data: CollectionData) {
  try {
    // Get the installment to check if it's the first one
    const { data: installment, error: installmentError } = await supabase
      .from('installments')
      .select('installment_number')
      .eq('id', data.installment_id)
      .single();

    if (installmentError) {
      throw new Error(`خطأ في جلب بيانات القسط: ${installmentError.message}`);
    }

    // Determine if this is new business (first installment only)
    const is_new_business = installment?.installment_number === 1;

    // Get policy branch_id
    const { data: policy, error: policyError } = await supabase
      .from('policies')
      .select('branch_id')
      .eq('id', data.policy_id)
      .single();

    if (policyError) {
      throw new Error(`خطأ في جلب بيانات الوثيقة: ${policyError.message}`);
    }

    // Insert the collection
    const { data: collection, error } = await supabase
      .from('collections')
      .insert({
        ...data,
        is_new_business,
        branch_id: policy?.branch_id,
        collection_category: is_new_business ? 'first_year' : 'renewal'
      })
      .select()
      .single();

    if (error) {
      throw new Error(`خطأ في إنشاء التحصيل: ${error.message}`);
    }

    // Update installment status to paid
    const { error: updateError } = await supabase
      .from('installments')
      .update({
        status: 'paid',
        paid_date: data.collection_date,
        updated_at: new Date().toISOString(),
      })
      .eq('id', data.installment_id);

    if (updateError) {
      throw new Error(`خطأ في تحديث حالة القسط: ${updateError.message}`);
    }

    return { success: true, collection };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'خطأ غير معروف' };
  }
}

/**
 * Get collections with proper classification
 */
export async function getCollectionsWithClassification(filters?: {
  month?: number;
  year?: number;
  agent_id?: string;
}) {
  try {
    let query = supabase
      .from('collections')
      .select('*, policy:policies(agent_id, annual_premium), installment:installments(installment_number)');

    if (filters?.month && filters?.year) {
      const monthStart = `${filters.year}-${String(filters.month).padStart(2, '0')}-01`;
      const nextMonth = filters.month === 12 ? 1 : filters.month + 1;
      const nextYear = filters.month === 12 ? filters.year + 1 : filters.year;
      const monthEnd = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;

      query = query.gte('collection_date', monthStart).lt('collection_date', monthEnd);
    }

    if (filters?.agent_id) {
      query = query.eq('policy.agent_id', filters.agent_id);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`خطأ في جلب التحصيلات: ${error.message}`);
    }

    return { success: true, data };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'خطأ غير معروف' };
  }
}

/**
 * Calculate new business and collections totals
 */
export async function calculatePerformanceMetrics(agent_id: string, month: number, year: number) {
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
      success: true,
      metrics: {
        new_business: newBusiness,
        collections: collections_total,
        total,
        count: collections?.length || 0,
      },
    };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'خطأ غير معروف' };
  }
}
