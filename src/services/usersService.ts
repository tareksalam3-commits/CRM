import { supabase } from '../lib/supabase';
import { Profile, UserRole } from '../types';

/**
 * Service for handling user management and permissions
 */

const EDGE_FUNCTION_URL = 'https://pojmoiuzeckhxbnahcrk.supabase.co/functions/v1/create-user';

/**
 * Call the create-user Edge Function
 */
async function callCreateUserFunction(body: Record<string, unknown>) {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token;

    if (!token) {
      return { error: 'انتهت الجلسة — يرجى إعادة تسجيل الدخول' };
    }

    const response = await fetch(EDGE_FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBvam1vaXV6ZWNraHhibmFoY3JrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEyNjA5NzUsImV4cCI6MjA5NjgzNjk3NX0.SzzaDxI4tuszQoaFQYQAkwyUNUG-mUun-DnyYOInn4s',
      },
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
 * Create a new user
 */
export async function createUser(userData: {
  email: string;
  password: string;
  full_name: string;
  phone?: string;
  role: UserRole;
  manager_id?: string;
}) {
  return callCreateUserFunction({
    email: userData.email,
    password: userData.password,
    full_name: userData.full_name,
    phone: userData.phone || null,
    role: userData.role,
    manager_id: userData.manager_id || null,
  });
}

/**
 * Reset user password
 */
export async function resetUserPassword(userId: string | null, newPassword: string) {
  if (!userId) {
    return { error: 'معرّف المستخدم مطلوب' };
  }
  return callCreateUserFunction({
    reset_password_for: userId,
    new_password: newPassword,
  });
}

/**
 * Delete a user
 */
export async function deleteUser(userId: string) {
  return callCreateUserFunction({
    delete_user_id: userId,
  });
}

/**
 * Update user profile
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
      return { error: `خطأ في تحديث الملف الشخصي: ${error.message}` };
    }

    return { success: true };
  } catch (err) {
    return { error: 'خطأ غير متوقع: ' + String(err) };
  }
}

/**
 * Get user with their accessible branches
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
 * Link user to branches
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
