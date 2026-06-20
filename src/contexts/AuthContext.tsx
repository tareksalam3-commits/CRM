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

  async function fetchProfileAndBranches(userId: string) {
    try {
      // Fetch user profile
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

      setProfile(profileData);

      // ✅ إذا كان المستخدم super_admin أو dev_manager، لا نحتاج لفروع
      if (profileData.role === 'super_admin' || profileData.role === 'dev_manager') {
        console.log(`User is ${profileData.role}, skipping branch access fetch`);
        setAccessibleBranches([]);
        setActiveBranchState(null);
        setActiveBranchAccess(null);
        setLoading(false);
        return;
      }

      // Fetch user branch access with proper filtering
      const { data: accessData, error: accessError } = await supabase
        .from('user_branch_access')
        .select('id, user_id, branch_id, role, is_active, assigned_at, expires_at, updated_at, branch:branches(id, name, code, is_active, created_at, updated_at)')
        .eq('user_id', userId)
        .eq('is_active', true);

      if (accessError) {
        console.error('Error fetching branch access:', accessError);
      }

      // Extract branches from access data
      let branches: Branch[] = [];
      let accessRecords: UserBranchAccess[] = [];

      if (accessData && accessData.length > 0) {
        branches = accessData
          .map(access => (access.branch as any))
          .filter(branch => branch && branch.is_active);
        
        accessRecords = accessData as UserBranchAccess[];
      }

      // If no branches found, allow user to proceed to dashboard
      if (branches.length === 0) {
        console.warn('No active branches found for user, allowing temporary access');
        setAccessibleBranches([]);
        setActiveBranchState(null);
        setActiveBranchAccess(null);
        setLoading(false);
        return;
      }

      setAccessibleBranches(branches);

      // Set active branch from localStorage or use the first one
      const savedBranchId = localStorage.getItem(`activeBranch_${userId}`);
      let activeBranchData = null;

      if (savedBranchId) {
        activeBranchData = branches.find(b => b.id === savedBranchId);
      }

      // Fallback to first branch if saved one not found
      if (!activeBranchData) {
        activeBranchData = branches[0];
      }

      if (activeBranchData) {
        setActiveBranchState(activeBranchData);
        
        // Find the access record for the active branch
        const access = accessRecords.find(a => a.branch_id === activeBranchData.id);
        if (access) {
          setActiveBranchAccess(access as UserBranchAccess);
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
      // Non-critical, silently ignore
    }
  }

  async function setActiveBranch(branch: Branch | null) {
    if (branch && user) {
      setActiveBranchState(branch);
      localStorage.setItem(`activeBranch_${user.id}`, branch.id);

      // Fetch the access record for this branch
      const { data: accessData, error } = await supabase
        .from('user_branch_access')
        .select('*')
        .eq('user_id', user.id)
        .eq('branch_id', branch.id)
        .eq('is_active', true)
        .maybeSingle();

      if (error) {
        console.error('Error fetching branch access:', error);
      } else if (accessData) {
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
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  }

  async function signOut() {
    await supabase.auth.signOut();
    setProfile(null);
    setActiveBranchState(null);
    setActiveBranchAccess(null);
    setAccessibleBranches([]);
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
