import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { Session, User } from '@supabase/supabase-js';
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
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [activeBranch, setActiveBranchState] = useState<Branch | null>(null);
  const [activeBranchAccess, setActiveBranchAccess] = useState<UserBranchAccess | null>(null);
  const [accessibleBranches, setAccessibleBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
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

  async function fetchProfileAndBranches(userId: string) {
    try {
      const { data: profileData, error: profileError } = await supabase
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

      if (profileData.is_active === false) {
        console.warn('Session terminated: user account is deactivated');
        await signOut();
        return;
      }

      setProfile(profileData);

      if (profileData.role === 'super_admin' || profileData.role === 'dev_manager') {
        const { data: allBranches } = await supabase.from('branches').select('*').eq('is_active', true);
        if (allBranches) {
          setAccessibleBranches(allBranches);
          setActiveBranchState({ id: 'all', name: 'جميع الفروع', code: 'ALL', is_active: true, created_at: '', updated_at: '' });
          setActiveBranchAccess(null);
        }
      } else {
        const { data: accessData } = await supabase
          .from('user_branch_access')
          .select('id, user_id, branch_id, role, is_active, assigned_at, expires_at, updated_at, branch:branches(id, name, code, is_active, created_at, updated_at)')
          .eq('user_id', userId)
          .eq('is_active', true);

        let branches: Branch[] = [];
        let accessRecords: UserBranchAccess[] = [];

        if (accessData && accessData.length > 0) {
          branches = accessData
            .map(access => (access as Record<string, unknown>).branch as Branch)
            .filter(branch => branch && branch.is_active);

          accessRecords = accessData as unknown as UserBranchAccess[];
          setAccessibleBranches(branches);

          const savedBranchId = localStorage.getItem(`activeBranch_${userId}`);
          let activeBranchData: Branch | null = null;

          if (savedBranchId && savedBranchId !== 'all') {
            activeBranchData = branches.find(b => b.id === savedBranchId) || null;
          }

          if (!activeBranchData && branches.length > 0) {
            activeBranchData = branches[0];
          }

          if (activeBranchData) {
            setActiveBranchState(activeBranchData);
            const access = accessRecords.find(a => a.branch_id === activeBranchData!.id);
            if (access) {
              setActiveBranchAccess(access);
            }
          }
        } else {
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
  }

  async function refreshProfile() {
    if (user) {
      await fetchProfileAndBranches(user.id);
    }
  }

  async function setActiveBranch(branch: Branch | null) {
    if (branch && user) {
      setActiveBranchState(branch);
      localStorage.setItem(`activeBranch_${user.id}`, branch.id);

      if (branch.id === 'all') {
        setActiveBranchAccess(null);
        return;
      }

      const { data: accessData } = await supabase
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

  async function signIn(email: string, password: string) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      return { error: error.message || 'فشل تسجيل الدخول' };
    }

    if (!data.session || !data.user) {
      return { error: 'لم يتم إنشاء الجلسة بشكل صحيح' };
    }

    // Verify the user's profile is active before allowing sign-in
    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select('is_active')
      .eq('id', data.user.id)
      .maybeSingle();

    if (profileError) {
      console.error('Error checking profile status during sign-in:', profileError);
    }

    if (!profileError && profileData && profileData.is_active === false) {
      await supabase.auth.signOut();
      return { error: 'هذا الحساب معطّل — يرجى التواصل مع مسؤول النظام' };
    }

    return { error: null };
  }

  async function signOut() {
    await supabase.auth.signOut();
    setProfile(null);
    setActiveBranchState(null);
    setActiveBranchAccess(null);
    setAccessibleBranches([]);
    setSession(null);
    setUser(null);
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
      setActiveBranch,
      refreshProfile,
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
