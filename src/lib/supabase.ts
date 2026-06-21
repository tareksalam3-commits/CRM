import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

// FIX #S1: Clear error when env vars missing — not silent broken client
if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    '[CRM] ⛔ متغيرات Supabase مفقودة!\n' +
    'أنشئ ملف .env:\n' +
    '  VITE_SUPABASE_URL=https://your-project.supabase.co\n' +
    '  VITE_SUPABASE_ANON_KEY=your-anon-key'
  );
  if (typeof document !== 'undefined' && import.meta.env.PROD) {
    document.body.innerHTML =
      '<div style="font-family:sans-serif;padding:2rem;direction:rtl;text-align:center">' +
      '<h2 style="color:#dc2626">⛔ خطأ في إعداد التطبيق</h2>' +
      '<p>يرجى التواصل مع المطور</p></div>';
  }
}

/**
 * 🔧 Custom fetch that injects x-user-id header for fallback auth mode.
 * This ensures all supabase queries include the user-id when in fallback mode.
 */
const originalFetch = window.fetch;
const customFetch: typeof fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  // Only intercept Supabase REST API calls
  const url = input.toString();
  if (url.includes(supabaseUrl) && !url.includes('/auth/')) {
    const fallbackUserId = localStorage.getItem('fallback_user_id');
    if (fallbackUserId) {
      init = init || {};
      init.headers = {
        ...(init.headers || {}),
        'x-user-id': fallbackUserId,
      };
    }
  }
  return originalFetch(input, init);
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: {
    fetch: customFetch as any,
  },
});

/**
 * 🔧 Create a supabase client with x-user-id header for fallback auth.
 * Used by AuthContext when normal Supabase Auth fails with schema error.
 */
export function createAuthClient(userId: string) {
  return createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        'x-user-id': userId,
      },
      fetch: customFetch as any,
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
