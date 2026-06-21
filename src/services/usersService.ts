import { supabase } from '../lib/supabase';
import { Profile, UserRole } from '../types';

const EDGE_FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-user`;

/**
 * Service for handling user management via the create-user Edge Function.
 * The Edge Function uses the Supabase service-role key (server-side only) to:
 *   - create users in auth.users + profiles
 *   - reset passwords (auth.admin.updateUser)
 *   - delete users (auth.admin.deleteUser, with soft-delete fallback)
 *
 * All authorization (hierarchy checks) happens in the Edge Function, NOT in the client.
 */

async function callEdgeFunction(body: Record<string, unknown>) {
  try {
    const { data: sessionData } = await supabase.auth.getSession();

    // Build headers — prefer the real session token when available, fall back to
    // x-user-id (fallback-auth mode) so management still works when GoTrue schema
    // errors block normal signIn.
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY || '',
    };

    if (sessionData?.session?.access_token) {
      headers['Authorization'] = `Bearer ${sessionData.session.access_token}`;
    } else {
      const fallbackUserId = localStorage.getItem('fallback_user_id');
      if (fallbackUserId) {
        headers['x-user-id'] = fallbackUserId;
        headers['Authorization'] = `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY || ''}`;
      } else {
        return { error: 'انتهت الجلسة — يرجى إعادة تسجيل الدخول' };
      }
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
    if (err instanceof TypeError && err.message.includes('fetch')) {
      return { error: 'خطأ في الاتصال — تحقق من اتصالك بالإنترنت' };
    }
    return { error: 'خطأ غير متوقع: ' + String(err) };
  }
}

/**
 * Create a new user — calls the Edge Function.
 */
export async function createUser(userData: {
  email: string;
  password: string;
  full_name: string;
  phone?: string;
  role: UserRole;
  manager_id?: string;
}) {
  return callEdgeFunction({
    email: userData.email,
    password: userData.password,
    full_name: userData.full_name,
    phone: userData.phone || null,
    role: userData.role,
    manager_id: userData.manager_id || null,
  });
}

/**
 * Reset a user's password — calls the Edge Function (auth.admin.updateUser).
 */
export async function resetUserPassword(userId: string | null, newPassword: string) {
  if (!userId) {
    return { error: 'معرّف المستخدم مطلوب' };
  }
  return callEdgeFunction({
    reset_password_for: userId,
    new_password: newPassword,
  });
}

/**
 * Delete a user — calls the Edge Function (auth.admin.deleteUser with soft-delete fallback).
 */
export async function deleteUser(userId: string) {
  return callEdgeFunction({
    delete_user_id: userId,
  });
}

/**
 * Update user profile — direct table update (RLS policy profiles_update enforces ownership/hierarchy).
 */
export async function updateUserProfile(userId: string, updates: Partial<Profile>) {
  try {
    const { error } = await supabase
      .from('profiles')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId);

    if (error) {
      if (error.code === '42501') {
        return { error: 'غير مصرح بتعديل هذا المستخدم — تأكد من صلاحياتك' };
      }
      return { error: `خطأ في تحديث الملف الشخصي: ${error.message}` };
    }

    return { success: true };
  } catch (err) {
    return { error: 'خطأ غير متوقع: ' + String(err) };
  }
}

/**
 * Get a user with their accessible branches.
 */
export async function getUserWithBranches(userId: string) {
  try {
    const { data: user, error: userError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (userError) {
      return { error: `خطأ في جلب بيانات المستخدم: ${userError.message}` };
    }

    const { data: branches, error: branchesError } = await supabase
      .from('user_branch_access')
      .select('branch:branches(*)')
      .eq('user_id', userId);

    if (branchesError) {
      return { error: `خطأ في جلب الفروع: ${branchesError.message}` };
    }

    return {
      success: true,
      user: {
        ...user,
        accessible_branches: branches?.map(b => (b as Record<string, unknown>).branch) || [],
      },
    };
  } catch (err) {
    return { error: 'خطأ غير متوقع: ' + String(err) };
  }
}

/**
 * Replace a user's branch access list.
 */
export async function linkUserToBranches(userId: string, branchIds: string[]) {
  try {
    // First, delete existing links
    await supabase.from('user_branch_access').delete().eq('user_id', userId);

    // Then insert new links
    if (branchIds.length > 0) {
      const { error } = await supabase
        .from('user_branch_access')
        .insert(
          branchIds.map(branchId => ({
            user_id: userId,
            branch_id: branchId,
            is_active: true,
          }))
        );

      if (error) {
        return { error: `خطأ في ربط الفروع: ${error.message}` };
      }
    }

    return { success: true };
  } catch (err) {
    return { error: 'خطأ غير متوقع: ' + String(err) };
  }
}
