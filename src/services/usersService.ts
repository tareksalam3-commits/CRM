import { supabase } from '../lib/supabase';
import { Profile, UserRole } from '../types';

const EDGE_FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-user`;

async function callEdgeFunction(body: Record<string, unknown>) {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY || '',
    };

    if (sessionData?.session?.access_token) {
      headers['Authorization'] = `Bearer ${sessionData.session.access_token}`;
    } else {
      return { error: 'انتهت الجلسة — يرجى إعادة تسجيل الدخول' };
    }

    const response = await fetch(EDGE_FUNCTION_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      const text = await response.text();
      return { error: `استجابة غير متوقعة من السيرفر (${response.status}): ${text.slice(0, 100)}` };
    }

    const data = await response.json();
    if (!response.ok || (data as Record<string, unknown>).error) {
      return { error: (data as Record<string, unknown>).error || `خطأ ${response.status}` };
    }

    return { success: true, ...data };
  } catch (err) {
    return { error: 'خطأ في الاتصال: ' + String(err) };
  }
}

export async function createUser(userData: {
  email: string;
  password: string;
  full_name: string;
  phone?: string;
  role: UserRole;
  manager_id?: string;
  branch_id?: string;
}) {
  return callEdgeFunction({
    action: 'create_user',
    ...userData
  });
}

export async function resetUserPassword(userId: string, newPassword: string) {
  return callEdgeFunction({
    action: 'update_password',
    target_user_id: userId,
    new_password: newPassword,
  });
}

export async function deleteUser(userId: string) {
  return callEdgeFunction({
    action: 'delete_user',
    target_user_id: userId,
  });
}

export async function toggleUserStatus(userId: string, isActive: boolean) {
  return callEdgeFunction({
    action: 'toggle_status',
    target_user_id: userId,
    is_active: isActive,
  });
}

export async function updateUserProfile(userId: string, updates: Partial<Profile>) {
  const { error } = await supabase.from('profiles').update({
    ...updates,
    updated_at: new Date().toISOString(),
  }).eq('id', userId);
  if (error) return { error: error.message };
  return { success: true };
}

export async function linkUserToBranches(userId: string, branchIds: string[]) {
  try {
    const { data: existing } = await supabase
      .from('user_branch_access')
      .select('branch_id, is_active')
      .eq('user_id', userId);
    const existingMap = new Map((existing || []).map((e: any) => [e.branch_id, e.is_active]));
    const toAdd = branchIds.filter(bid => !existingMap.has(bid));
    const toReactivate = branchIds.filter(bid => existingMap.has(bid) && existingMap.get(bid) === false);
    const toDeactivate = Array.from(existingMap.entries())
      .filter(([bid, active]) => !branchIds.includes(bid) && active === true)
      .map(([bid]) => bid);

    if (toAdd.length > 0) {
      const { error } = await supabase.from('user_branch_access').insert(
        toAdd.map(branchId => ({ user_id: userId, branch_id: branchId, is_active: true }))
      );
      if (error) return { error: error.message };
    }
    for (const bid of toReactivate) {
      await supabase.from('user_branch_access').update({ is_active: true }).eq('user_id', userId).eq('branch_id', bid);
    }
    for (const bid of toDeactivate) {
      await supabase.from('user_branch_access').update({ is_active: false }).eq('user_id', userId).eq('branch_id', bid);
    }
    return { success: true };
  } catch (err) {
    return { error: String(err) };
  }
}
