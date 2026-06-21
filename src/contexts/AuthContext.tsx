import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { Session, User, createClient } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { Profile, Branch, UserBranchAccess } from '../types';

interface AuthContextType {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  activeBranch: Branch | null;
  activeBranchAccess: UserBranchAccess | null;
  accessibleBranches: Branch[];
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  setActiveBranch: (branch: Branch | null) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Edge Function URL for fallback authentication
const EDGE_FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/auth-login`;
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

/**
 * 🔧 Create a Supabase client with a custom auth token for fallback auth mode
 */
function createAuthClient(accessToken: string) {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [activeBranch, setActiveBranchState] = useState<Branch | null>(null);
  const [activeBranchAccess, setActiveBranchAccess] = useState<UserBranchAccess | null>(null);
  const [accessibleBranches, setAccessibleBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  // 🔧 Track fallback auth token for GoTrue schema issue
  const [fallbackToken, setFallbackToken] = useState<string | null>(null);
  const [fallbackUserId, setFallbackUserId] = useState<string | null>(null);

  useEffect(() => {
    // Initial session check
    supabase.auth.getSession().then(({ data: { session: currentSession } }) => {
      setSession(currentSession);
      setUser(currentSession?.user ?? null);
      if (currentSession?.user) {
        fetchProfileAndBranches(currentSession.user.id);
      } else {
        setLoading(false);
      }
    }).catch((err) => {
      console.error('Error getting session:', err);
      setLoading(false);
    });

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setUser(newSession?.user ?? null);
      if (newSession?.user) {
        fetchProfileAndBranches(newSession.user.id);
      } else {
        setProfile(null);
        setActiveBranchState(null);
        setActiveBranchAccess(null);
        setAccessibleBranches([]);
        setLoading(false);
      }
    });

    return () => subscription?.unsubscribe();
  }, []);

  /**
   * 🔧 Get the appropriate supabase client based on auth mode
   */
  function getClient() {
    if (fallbackToken) {
      return createAuthClient(fallbackToken);
    }
    return supabase;
  }

  async function fetchProfileAndBranches(userId: string) {
    try {
      const client = getClient();

      // Fetch user profile
      const { data: profileData, error: profileError } = await client
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (profileError) {
        console.error('Error fetching profile:', profileError);
        setLoading(false);
        return;
      }

      if (!profileData) {
        console.error('No profile found for user');
        setLoading(false);
        return;
      }

      // ✅ منع المستخدم المعطّل (is_active = false) من الاستمرار بالجلسة.
      if (profileData.is_active === false) {
        console.warn('Session terminated: user account is deactivated');
        await supabase.auth.signOut();
        setProfile(null);
        setActiveBranchState(null);
        setActiveBranchAccess(null);
        setAccessibleBranches([]);
        setSession(null);
        setUser(null);
        setFallbackToken(null);
        setFallbackUserId(null);
        setLoading(false);
        return;
      }

      setProfile(profileData);

      // ✅ جلب الفروع المتاحة دائماً ولكن بدون جعلها عائقاً
      // للمسؤولين، نصل لكل الفروع
      if (profileData.role === 'super_admin' || profileData.role === 'dev_manager') {
        const { data: allBranches } = await client.from('branches').select('*').eq('is_active', true);
        if (allBranches) {
          setAccessibleBranches(allBranches);
          // الحالة الافتراضية هي "جميع الفروع"
          setActiveBranchState({ id: 'all', name: 'جميع الفروع', code: 'ALL', is_active: true, created_at: '', updated_at: '' });
          setActiveBranchAccess(null);
        }
      } else {
        // للمستخدمين العاديين، نجلب الفروع المخصصة لهم إن وجدت
        const { data: accessData } = await client
          .from('user_branch_access')
          .select('id, user_id, branch_id, role, is_active, assigned_at, expires_at, updated_at, branch:branches(id, name, code, is_active, created_at, updated_at)')
          .eq('user_id', userId)
          .eq('is_active', true);

        let branches: Branch[] = [];
        let accessRecords: UserBranchAccess[] = [];

        if (accessData && accessData.length > 0) {
          branches = accessData
            .map(access => (access.branch as any))
            .filter(branch => branch && branch.is_active);
          
          accessRecords = accessData as UserBranchAccess[];
          setAccessibleBranches(branches);

          // محاولة استعادة الفرع النشط من localStorage
          const savedBranchId = localStorage.getItem(`activeBranch_${userId}`);
          let activeBranchData = null;

          if (savedBranchId) {
            activeBranchData = branches.find(b => b.id === savedBranchId);
          }

          // إذا لم يوجد فرع محفوظ، نستخدم الأول كخيار تلقائي لكن لا نعطل النظام إذا لم يوجد
          if (!activeBranchData && branches.length > 0) {
            activeBranchData = branches[0];
          }

          if (activeBranchData) {
            setActiveBranchState(activeBranchData);
            const access = accessRecords.find(a => a.branch_id === activeBranchData.id);
            if (access) {
              setActiveBranchAccess(access as UserBranchAccess);
            }
          }
        } else {
          // إذا لم يكن لديه فروع، نترك الفروع فارغة ونكمل الدخول بشكل طبيعي
          setAccessibleBranches([]);
          setActiveBranchState(null);
          setActiveBranchAccess(null);
        }
      }
    } catch (err) {
      console.error('Unexpected error fetching profile and branches:', err);
    } finally {
      setLoading(false);
    }

    // Auto-update overdue installments on login
    try {
      await supabase.rpc('mark_overdue_installments');
    } catch (err) {
      console.error('Error marking overdue installments:', err);
    }
  }

  async function setActiveBranch(branch: Branch | null) {
    const client = getClient();

    if (branch && user) {
      setActiveBranchState(branch);
      localStorage.setItem(`activeBranch_${user.id}`, branch.id);

      if (branch.id === 'all') {
        setActiveBranchAccess(null);
        return;
      }

      const { data: accessData } = await client
        .from('user_branch_access')
        .select('*')
        .eq('user_id', user.id)
        .eq('branch_id', branch.id)
        .eq('is_active', true)
        .maybeSingle();

      if (accessData) {
        setActiveBranchAccess(accessData as UserBranchAccess);
      }
    } else {
      setActiveBranchState(null);
      setActiveBranchAccess(null);
      if (user) {
        localStorage.removeItem(`activeBranch_${user.id}`);
      }
    }
  }

  /**
   * 🔧 FIX: Try normal sign in first, fallback to Edge Function on GoTrue schema error
   */
  async function signIn(email: string, password: string) {
    // Try 1: Normal Supabase Auth sign in
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    
    if (!error && data.session) {
      // Normal sign in successful
      if (data.user) {
        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('is_active')
          .eq('id', data.user.id)
          .maybeSingle();

        if (!profileError && profileData && profileData.is_active === false) {
          await supabase.auth.signOut();
          return { error: 'هذا الحساب معطّل — يرجى التواصل مع مسؤول النظام' };
        }
      }
      return { error: null };
    }

    // Check if error is the GoTrue schema issue
    const isSchemaError = error && (
      error.message?.includes('Database error querying schema') ||
      error.status === 500 ||
      error.message?.includes('unexpected_failure')
    );

    if (!isSchemaError) {
      // Normal auth error (wrong password, etc.)
      return { error: error?.message || 'فشل تسجيل الدخول' };
    }

    // Try 2: Fallback to Edge Function for GoTrue schema issue
    console.log('[Auth] GoTrue schema error detected, trying Edge Function fallback...');
    
    try {
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
      const response = await fetch(EDGE_FUNCTION_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': anonKey,
          'Authorization': `Bearer ${anonKey}`,
        },
        body: JSON.stringify({ email, password }),
      });

      const result = await response.json();

      if (!response.ok) {
        console.error('[Auth] Edge Function error:', result);
        return { error: result.error || 'فشل تسجيل الدخول' };
      }

      // Edge Function returned a session - set it manually
      if (result.session?.access_token) {
        // Try setSession first
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: result.session.access_token,
          refresh_token: result.session.refresh_token || result.session.access_token,
        });

        if (!sessionError) {
          // setSession worked
          return { error: null };
        }

        console.log('[Auth] setSession failed, using fallback auth mode:', sessionError.message);
        
        // 🔧 Fallback: Use custom auth client with the token from Edge Function
        setFallbackToken(result.session.access_token);
        setFallbackUserId(result.user.id);

        // Create a compatible user object
        const fallbackUser: User = {
          id: result.user.id,
          email: result.user.email,
          role: result.user.role || 'authenticated',
          aud: result.user.aud || 'authenticated',
          created_at: result.user.created_at,
          app_metadata: {},
          user_metadata: {},
          identities: [],
          factors: [],
        } as User;

        // Create a compatible session object
        const expiresAt = result.session.expires_at || Math.floor(Date.now() / 1000) + 3600;
        const fallbackSession: Session = {
          access_token: result.session.access_token,
          token_type: result.session.token_type || 'bearer',
          expires_in: result.session.expires_in || 3600,
          expires_at: expiresAt,
          refresh_token: result.session.refresh_token || result.session.access_token,
          user: fallbackUser,
        };

        setSession(fallbackSession);
        setUser(fallbackUser);
        await fetchProfileAndBranches(result.user.id);
        
        return { error: null };
      }

      return { error: 'لم يتم إرجاع جلسة من خادم المصادقة' };

    } catch (fetchError) {
      console.error('[Auth] Edge Function fetch error:', fetchError);
      return { error: 'خطأ في الاتصال بخادم المصادقة البديل' };
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    setProfile(null);
    setActiveBranchState(null);
    setActiveBranchAccess(null);
    setAccessibleBranches([]);
    setFallbackToken(null);
    setFallbackUserId(null);
  }

  return (
    <AuthContext.Provider value={{ 
      session, 
      user, 
      profile, 
      activeBranch, 
      activeBranchAccess,
      accessibleBranches,
      loading, 
      signIn, 
      signOut,
      setActiveBranch 
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
