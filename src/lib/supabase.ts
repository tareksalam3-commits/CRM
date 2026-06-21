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
 * 🔧 Get headers including x-user-id for fallback auth mode
 */
function getSupabaseHeaders() {
  const headers: Record<string, string> = {};
  
  // Check if we're in fallback auth mode
  if (typeof window !== 'undefined') {
    const fallbackUserId = localStorage.getItem('fallback_user_id');
    if (fallbackUserId) {
      headers['x-user-id'] = fallbackUserId;
    }
  }
  
  return headers;
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: {
    headers: getSupabaseHeaders(),
  },
});

// 🔧 Force update headers before each request for fallback auth
const originalFrom = supabase.from.bind(supabase);
supabase.from = function(table: string) {
  // Refresh headers from localStorage before each query
  const fallbackUserId = typeof window !== 'undefined' ? localStorage.getItem('fallback_user_id') : null;
  if (fallbackUserId) {
    // @ts-ignore - internal method to set headers
    supabase.rest.headers['x-user-id'] = fallbackUserId;
  }
  return originalFrom(table);
} as typeof supabase.from;
