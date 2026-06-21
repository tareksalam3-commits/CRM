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
 * 🔧 Create the main Supabase client.
 * For fallback auth mode (GoTrue schema issue), the x-user-id header
 * is managed by AuthContext which creates a separate client.
 */
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

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
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
